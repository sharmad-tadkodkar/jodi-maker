import { Check, ChevronDown, NotebookPen, SendHorizontal } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, getUserId, type Aspect, type IntakeMessageResponse } from '../api/client'
import { Avatar, Card, Chip, ErrorState, Icon, Loading, ScoreRing, Spinner } from '../components/ui'
import { MATCHMAKER_AVATAR } from '../lib/avatars'
import { ASPECT_LABEL } from '../lib/format'
import { errorMessage, useAsync } from '../lib/useAsync'

type Msg = { id: string; role: 'agent' | 'user'; text: string; learned?: Aspect[] }

type Category = Aspect['category']
const CATEGORIES = Object.keys(ASPECT_LABEL) as Category[]

/** One chip per aspect category; lit once Jodi has something for it. `scroll` = single swipeable row (mobile header). */
function CategoryChips({ filled, fresh, scroll }: { filled: Set<Category>; fresh: Set<Category>; scroll?: boolean }) {
  const row = useRef<HTMLUListElement>(null)
  const freshKey = [...fresh].join()
  // In the swipeable row, bring a just-lit chip into view (horizontally only — never move the page).
  useEffect(() => {
    const el = row.current
    const chip = el?.querySelector<HTMLElement>('[data-fresh="true"]')
    if (!scroll || !el || !chip) return
    el.scrollTo({ left: chip.offsetLeft - el.clientWidth / 2 + chip.offsetWidth / 2, behavior: 'smooth' })
  }, [freshKey, scroll])
  return (
    <ul
      ref={row}
      aria-label={`Topics covered: ${filled.size} of ${CATEGORIES.length}`}
      className={
        scroll
          ? // relative: keeps the chips' sr-only text inside the scroll box (absolute children escape otherwise)
            'relative -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          : 'relative flex flex-wrap gap-1.5'
      }
    >
      {CATEGORIES.map((c) => {
        const on = filled.has(c)
        return (
          <li
            key={c}
            data-fresh={fresh.has(c) || undefined}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors duration-500 ${
              on ? 'border-gold-500/40 bg-gold-100 text-gold-700' : 'border-dashed border-line bg-transparent text-muted'
            } ${fresh.has(c) ? 'animate-[fadeUp_.45s_ease-out] ring-2 ring-gold-500/40' : ''}`}
          >
            {on && <Icon icon={Check} size="xs" className="size-3" />}
            {ASPECT_LABEL[c]}
            <span className="sr-only">{on ? ' — covered' : ' — not yet'}</span>
          </li>
        )
      })}
    </ul>
  )
}

function Progress({ value, filled, fresh }: { value: number; filled: Set<Category>; fresh: Set<Category> }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm">
          Your matchmaker knows you <span className="font-display text-xl text-brand-600">{pct}%</span>
        </p>
        <p className="text-xs text-muted">
          {filled.size}/{CATEGORIES.length} topics
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sand" role="progressbar" aria-label="How well Jodi knows you" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-brand-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <CategoryChips filled={filled} fresh={fresh} scroll />
    </div>
  )
}

/** Notes Jodi already holds (e.g. seeded profiles, earlier sessions) — shown as notes, never as fake chat turns. */
function KnownNotes({ aspects }: { aspects: Aspect[] }) {
  const [open, setOpen] = useState(false)
  const cats = [...new Set(aspects.map((a) => a.category))]
  return (
    <div className="rounded-2xl border border-line bg-white/70">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="known-notes"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
          <Icon icon={NotebookPen} size="sm" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">What you've already told Jodi</span>
          <span className="block truncate text-xs text-muted">
            {aspects.length} notes · {cats.map((c) => ASPECT_LABEL[c]).join(', ')}
          </span>
        </span>
        <Icon icon={ChevronDown} size="sm" className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul id="known-notes" className="space-y-3 border-t border-line p-4">
          {aspects.map((a) => (
            <li key={a.id} className="text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-gold-700">{ASPECT_LABEL[a.category]}</span>
              <p className="text-ink">{a.statement}</p>
              {a.evidence && <p className="mt-0.5 text-xs italic text-muted">{a.evidence}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TypingBubble() {
  return (
    <div className="flex items-end gap-2" role="status" aria-label="Jodi is typing">
      <Avatar name="Jodi" src={MATCHMAKER_AVATAR.mine} size="sm" />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-line bg-white px-4 py-3.5">
        {[0, 150, 300].map((d) => (
          <span key={d} className="size-2 animate-bounce rounded-full bg-muted/60" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  )
}

/** Desktop side panel: how well Jodi knows you, what's left to cover, what was noted in this chat. */
function IntakePanel({ value, filled, fresh, learned, done }: {
  value: number
  filled: Set<Category>
  fresh: Set<Category>
  learned: Aspect[]
  done: boolean
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <Card className="space-y-5 p-4">
      <div className="flex items-center gap-4">
        <ScoreRing value={pct} size={72} label="known" tone="gold" />
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Your profile</p>
          <p className="text-sm">{done ? 'Enough to start looking' : 'Keep going — every answer helps'}</p>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">
          Topics covered · {filled.size}/{CATEGORIES.length}
        </p>
        <CategoryChips filled={filled} fresh={fresh} />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">Noted in this chat</p>
        {learned.length === 0 ? (
          <p className="text-xs text-muted">Nothing new yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {learned.map((a) => (
              <li key={a.id} className="text-xs">
                <span className="font-medium text-gold-700">✦ {ASPECT_LABEL[a.category]}:</span> {a.statement}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link to="/me" className="block text-sm font-medium text-brand-600 hover:underline">
        Everything Jodi knows →
      </Link>
    </Card>
  )
}

function Learned({ aspects }: { aspects: Aspect[] }) {
  return (
    <div className="ml-10 space-y-1.5">
      {aspects.map((a) => (
        <div key={a.id} className="flex items-start gap-2 rounded-xl border border-gold-500/30 bg-gold-100/40 px-3 py-2 text-xs animate-[fadeUp_.35s_ease-out]">
          <span aria-hidden className="text-gold-700">✦</span>
          <p>
            <span className="font-medium text-gold-700">Jodi noted · {ASPECT_LABEL[a.category]}:</span> {a.statement}
          </p>
        </div>
      ))}
    </div>
  )
}

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm leading-relaxed text-white">{msg.text}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <Avatar name="Jodi" src={MATCHMAKER_AVATAR.mine} size="sm" />
        <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-line bg-white px-4 py-2.5 text-sm leading-relaxed">{msg.text}</p>
      </div>
      {msg.learned && msg.learned.length > 0 && <Learned aspects={msg.learned} />}
    </div>
  )
}

export default function Onboard() {
  const uid = getUserId()
  const { data, error, loading, reload } = useAsync(
    async () => {
      const [history, user, aspects] = await Promise.all([
        api.getIntakeMessages(uid),
        api.getUser(uid).catch(() => null),
        api.getAspects(uid).catch(() => [] as Aspect[]),
      ])
      return { history, completeness: user?.intake_completeness ?? 0, aspects }
    },
    [uid],
  )
  const [sent, setSent] = useState<Msg[]>([])
  const [progress, setProgress] = useState<{ value: number; missing: IntakeMessageResponse['missing_categories'] }>()
  const [done, setDone] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string>()
  const bottom = useRef<HTMLDivElement>(null)

  const messages: Msg[] = [...(data?.history ?? []), ...sent]

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, sending])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    setDraft('')
    setSendError(undefined)
    setSending(true)
    setSent((s) => [...s, { id: `u${Date.now()}`, role: 'user', text }])
    try {
      const r = await api.sendIntakeMessage(uid, text)
      setSent((s) => [...s, { id: `a${Date.now()}`, role: 'agent', text: r.reply, learned: r.new_aspects }])
      setProgress({ value: r.completeness, missing: r.missing_categories ?? [] })
      setDone(r.done ?? false)
    } catch (err) {
      setSendError(errorMessage(err))
      setDraft(text) // let them retry without retyping
      setSent((s) => s.slice(0, -1))
    } finally {
      setSending(false)
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  if (loading && !data) return <Loading label="Your matchmaker is on the way…" />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const value = progress?.value ?? data?.completeness ?? 0
  const learned = sent.flatMap((m) => m.learned ?? [])
  // A topic is lit when Jodi holds an aspect for it, or the latest reply no longer lists it as missing.
  const filled = new Set<Category>([...(data?.aspects ?? []), ...learned].map((a) => a.category))
  if (progress) for (const c of CATEGORIES) if (!progress.missing.includes(c)) filled.add(c)
  const fresh = new Set<Category>((sent.at(-1)?.learned ?? []).map((a) => a.category))

  return (
    // The column is at least one screen tall, so the composer sits at the bottom (above the mobile tab bar)
    // even when the conversation is short; once it's long, the composer sticks there while you scroll.
    <section className="lg:grid lg:grid-cols-[minmax(0,760px)_280px] lg:items-start lg:justify-center lg:gap-10">
      <div className="mx-auto -mb-10 flex min-h-[calc(100dvh-153px)] w-full max-w-[760px] flex-col md:-mb-8 md:min-h-[calc(100dvh-97px)]">
        {/* Below lg the progress sits on top; from lg it's in the side panel */}
        <div className="sticky top-[57px] z-10 -mx-4 mb-4 border-b border-line bg-cream/95 px-4 pt-1 pb-3 backdrop-blur lg:hidden">
          <Progress value={value} filled={filled} fresh={fresh} />
        </div>

        <div className="flex-1 space-y-4">
          {data && data.aspects.length > 0 && <KnownNotes aspects={data.aspects} />}
          {messages.map((m) => (
            <Bubble key={m.id} msg={m} />
          ))}
          {sending && <TypingBubble />}
          <div ref={bottom} />
        </div>

        {done && (
          <Card className="mt-6 space-y-3 text-center">
            <p className="font-display text-xl">I know enough to start looking 💛</p>
            <p className="text-sm text-muted">You decide what others can see. You can keep chatting too — the more I know, the better I choose.</p>
            <div className="flex gap-3">
              <Link to="/me" className="flex-1 rounded-full border border-line bg-white py-2.5 text-sm font-medium hover:bg-sand">
                See what I learned about you
              </Link>
              <Link to="/pipeline" className="flex-1 rounded-full bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
                Start matching
              </Link>
            </div>
          </Card>
        )}

        <div className="sticky bottom-16 z-10 mt-6 md:bottom-4">
          <form onSubmit={send} className="space-y-2">
            {sendError && <p className="rounded-xl bg-brand-50 p-2.5 text-xs text-brand-700">Couldn't send that. {sendError}</p>}
            <div className="flex items-end gap-2 rounded-3xl border border-line bg-white p-2 shadow-lg">
              <textarea
                aria-label="Message your matchmaker"
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                placeholder="Tell Jodi about yourself…"
                className="field-sizing-content max-h-36 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none"
              />
              {/* Neutral until there's something to send, then full maroon — so "ready" is unmistakable. */}
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors ${
                  draft.trim() && !sending ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700' : 'cursor-not-allowed bg-sand text-muted'
                }`}
              >
                {sending ? <Spinner className="size-4" /> : <Icon icon={SendHorizontal} size="sm" />}
                Send
              </button>
            </div>
            <p className="text-center text-[11px] text-muted">
              <Chip>Private</Chip> Only your matchmaker sees this chat. You control what's shared on the <Link to="/me" className="underline">Me</Link> page.
            </p>
          </form>
        </div>
      </div>

      <aside className="hidden lg:sticky lg:top-20 lg:block">
        <IntakePanel value={value} filled={filled} fresh={fresh} learned={learned} done={done} />
      </aside>
    </section>
  )
}
