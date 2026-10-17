import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, getUserId, type Aspect, type IntakeMessageResponse } from '../api/client'
import { Button, Card, Chip, ErrorState, Loading, Typing } from '../components/ui'
import { ASPECT_LABEL } from '../lib/format'
import { errorMessage, useAsync } from '../lib/useAsync'

type Msg = { id: string; role: 'agent' | 'user'; text: string; learned?: Aspect[] }

function Progress({ value, missing }: { value: number; missing: IntakeMessageResponse['missing_categories'] }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm">
          Your matchmaker knows you <span className="font-display text-xl text-brand-600">{pct}%</span>
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-brand-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      {missing.length > 0 && (
        <p className="text-xs text-muted">Still to talk about: {missing.map((c) => ASPECT_LABEL[c]).join(', ')}</p>
      )}
    </div>
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
        <div aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-display text-sm text-brand-700">
          J
        </div>
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
      const [history, user] = await Promise.all([api.getIntakeMessages(uid), api.getUser(uid).catch(() => null)])
      return { history, completeness: user?.intake_completeness ?? 0 }
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

  return (
    <section className="flex flex-col">
      <div className="sticky top-[57px] z-10 -mx-4 mb-4 border-b border-line bg-cream/95 px-4 pt-1 pb-3 backdrop-blur">
        <Progress value={progress?.value ?? data?.completeness ?? 0} missing={progress?.missing ?? []} />
      </div>

      <div className="space-y-4">
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
        {sending && <Typing name="Jodi" />}
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

      <div className="sticky bottom-16 z-10 mt-6 sm:bottom-4">
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
            <Button type="submit" className="shrink-0" disabled={!draft.trim()} busy={sending}>
              Send
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted">
            <Chip>Private</Chip> Only your matchmaker sees this chat. You control what's shared on the <Link to="/me" className="underline">Me</Link> page.
          </p>
        </form>
      </div>
    </section>
  )
}
