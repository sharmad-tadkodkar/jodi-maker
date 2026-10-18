import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, getUserId, type ChatMessage, type FocusDecisionResponse, type FocusState } from '../api/client'
import LearningCard from '../components/LearningCard'
import ReasonSheet from '../components/ReasonSheet'
import { Avatar, Button, Card, ErrorState, Loading, SectionTitle, VerifiedBadge } from '../components/ui'
import { firstName } from '../lib/format'
import { avatarFor, useViewerGenders } from '../lib/avatars'
import { errorMessage, httpStatus, useAsync } from '../lib/useAsync'

const CHAT_POLL_MS = 2000

function deckTheme(day: number) {
  if (day <= 2) return 'Practical things'
  if (day <= 5) return 'Values & the harder topics'
  return 'What matters to you personally'
}

function DayCounter({ day, total }: { day: number; total: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-2xl">
          Day {day} <span className="text-base text-muted">of {total}</span>
        </p>
        <p className="text-xs text-muted">{Math.max(0, total - day)} days left</p>
      </div>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < day ? 'bg-brand-500' : 'bg-sand'}`} />
        ))}
      </div>
    </div>
  )
}

/** Chat polls every 2s. Messages we sent stay visible until the server list includes them. 403 = chat not open. */
function useChat(matchId: string) {
  const [server, setServer] = useState<ChatMessage[]>([])
  const [mine, setMine] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string>()
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const msgs = await api.getChat(matchId)
        if (live) {
          setServer(msgs)
          setError(undefined)
        }
      } catch (e) {
        if (live && httpStatus(e) === 403) {
          setClosed(true)
          return
        }
        if (live) setError(errorMessage(e))
      }
      if (live) timer = setTimeout(poll, CHAT_POLL_MS)
    }
    poll()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [matchId])
  const ids = new Set(server.map((m) => m.id))
  const messages = [...server, ...mine.filter((m) => !ids.has(m.id))]
  return { messages, error, closed, add: (m: ChatMessage) => setMine((s) => [...s, m]) }
}

function Chat({ uid, partnerName, messages, pollError, onSend }: {
  uid: string
  partnerName: string
  messages: ChatMessage[]
  pollError?: string
  onSend: (text: string) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string>()
  const list = useRef<HTMLDivElement>(null)

  // Keep the newest message in view by scrolling the chat box only. scrollIntoView() would also scroll the
  // whole page down to the chat, hiding the Day-7 "Time to decide" card above it.
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    setDraft('')
    setSending(true)
    setSendError(undefined)
    try {
      await onSend(text)
    } catch (err) {
      setSendError(errorMessage(err))
      setDraft(text)
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="flex flex-col p-0">
      <div ref={list} className="max-h-[50vh] min-h-48 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted">Say hello to {partnerName} — or tap a prompt above.</p>}
        {messages.map((m, i) => {
          const me = m.sender_id === uid
          return (
            // index suffix: the mock backend gives every sent message the same id
            <div key={`${m.id}-${i}`} className={`flex ${me ? 'justify-end' : ''}`}>
              <p
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                  me ? 'rounded-br-sm bg-brand-600 text-white' : 'rounded-bl-sm bg-sand'
                }`}
              >
                {m.text}
              </p>
            </div>
          )
        })}
      </div>
      {(pollError || sendError) && <p className="px-4 pb-2 text-xs text-brand-700">{sendError ? `Couldn't send that. ${sendError}` : 'Reconnecting…'}</p>}
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-2">
        <input
          aria-label={`Message ${partnerName}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${partnerName}…`}
          className="min-h-10 flex-1 bg-transparent px-3 text-sm outline-none"
        />
        <Button type="submit" disabled={!draft.trim()} busy={sending}>
          Send
        </Button>
      </form>
    </Card>
  )
}

/** Stop works any day; Continue / Extend only on the last day (the backend 409s before that). */
function Decision({ focus, uid, onDecided }: { focus: FocusState; uid: string; onDecided: (r: FocusDecisionResponse) => void }) {
  const [stopping, setStopping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const them = firstName(focus.partner.display_name)

  async function decide(decision: 'continue' | 'stop' | 'extend', reason?: string) {
    setBusy(true)
    setError(undefined)
    try {
      onDecided(await api.focusDecide(focus.match_id, uid, decision, reason))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const lastDay = focus.day >= focus.total_days
  if (stopping) {
    return (
      <div className="space-y-2">
        {busy && <p role="status" className="text-center text-sm text-muted">Your matchmaker is thinking about this…</p>}
        <ReasonSheet
          title={`What made you decide to stop with ${them}?`}
          hint={`${them} only learns that the week has ended — never your reason. It helps Jodi find someone better suited.`}
          submitLabel="End Jodi Week"
          busy={busy}
          onCancel={() => setStopping(false)}
          onSubmit={(r) => decide('stop', r)}
        />
        {error && <p className="text-center text-xs text-brand-700">{error}</p>}
      </div>
    )
  }
  if (!lastDay) {
    return (
      <p className="text-center text-xs text-muted">
        Your decision opens on Day {focus.total_days}. Until then, just get to know {them}.{' '}
        <button type="button" className="underline hover:text-ink" onClick={() => setStopping(true)}>
          End it early
        </button>
      </p>
    )
  }
  return (
    <Card className="space-y-4 border-gold-500/40">
      <div>
        <p className="font-display text-xl">Time to decide</p>
        <p className="text-sm text-muted">
          Your choice stays private until you've both decided.
          {focus.decision_them_submitted && ` ${them} has already made theirs.`}
        </p>
      </div>
      <div className="grid gap-2">
        <Button busy={busy} onClick={() => decide('continue')}>
          Move forward with {them}
        </Button>
        {!focus.extended && (
          <Button variant="secondary" disabled={busy} onClick={() => decide('extend')}>
            Take one more week
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={() => setStopping(true)}>
          End it kindly
        </Button>
      </div>
      {error && <p className="text-xs text-brand-700">{error}</p>}
    </Card>
  )
}

function Moving({ them }: { them: string }) {
  return (
    <Card className="space-y-2 text-center">
      <p className="text-3xl" aria-hidden>🎉</p>
      <p className="font-display text-2xl">We're moving forward</p>
      <p className="text-sm text-muted">You and {them} both chose each other. Jodi has stopped searching — wishing you both the very best.</p>
    </Card>
  )
}

function Ended({ them }: { them: string }) {
  return (
    <Card className="space-y-3 text-center">
      <p className="font-display text-xl">This Jodi Week has ended</p>
      <p className="text-sm text-muted">Your time with {them} is over — nobody is left waiting. Your matchmaker is ready with someone new.</p>
      <Link to="/brief" className="inline-block text-sm font-medium text-brand-600 hover:underline">
        See my next brief →
      </Link>
    </Card>
  )
}

function Outcome({ result, them, onReset }: { result: FocusDecisionResponse; them: string; onReset: () => void }) {
  if (result.outcome === 'locked') {
    return (
      <div className="space-y-4">
        <Moving them={them} />
        {result.learning && <LearningCard learning={result.learning} />}
      </div>
    )
  }
  if (result.outcome === 'closed') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">Your Jodi Week with {them} has ended. Thank you for giving it a real chance.</p>
        {result.learning && <LearningCard learning={result.learning} />}
        <Link to="/brief" className="block rounded-full bg-brand-600 py-3 text-center text-sm font-medium text-white hover:bg-brand-700">
          See my next brief
        </Link>
      </div>
    )
  }
  return (
    <Card className="space-y-2 text-center">
      <p className="font-display text-xl">{result.outcome === 'extended' ? 'One more week it is' : 'Your choice is saved'}</p>
      <p className="text-sm text-muted">
        {result.outcome === 'extended'
          ? `You both wanted more time. Jodi Week with ${them} now runs to Day 14.`
          : `Jodi will let you know once ${them} has decided too.`}
      </p>
      <Button variant="ghost" onClick={onReset}>
        Back to the chat
      </Button>
    </Card>
  )
}

export default function Focus() {
  const { matchId = '' } = useParams()
  const uid = getUserId()
  const { candidates } = useViewerGenders()
  // 404 = no Jodi Week for this match (it only starts once both say Interested).
  const { data: focus, error, loading, reload } = useAsync(
    () => api.getFocus(matchId).catch((e) => (httpStatus(e) === 404 ? null : Promise.reject(e))),
    [matchId],
  )
  const chat = useChat(matchId)
  const [used, setUsed] = useState<string[]>([])
  const [sendingPrompt, setSendingPrompt] = useState<string>()
  const [promptError, setPromptError] = useState<string>()
  const [result, setResult] = useState<FocusDecisionResponse>()

  async function send(text: string) {
    chat.add(await api.sendChat(matchId, uid, text))
  }

  async function sendPrompt(q: string) {
    setSendingPrompt(q)
    setPromptError(undefined)
    try {
      await send(q)
      setUsed((u) => [...u, q])
    } catch (e) {
      setPromptError(errorMessage(e))
    } finally {
      setSendingPrompt(undefined)
    }
  }

  if (loading && !focus) return <Loading label="Opening your Jodi Week…" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!focus) {
    return (
      <Card className="space-y-3 text-center">
        <p className="font-display text-xl">No Jodi Week here yet</p>
        <p className="text-sm text-muted">A Jodi Week starts once you both say Interested.</p>
        <Link to={`/brief/${matchId}`} className="inline-block text-sm font-medium text-brand-600 hover:underline">
          Back to the brief →
        </Link>
      </Card>
    )
  }

  const p = focus.partner
  const them = firstName(p.display_name)
  const active = focus.status === 'focus_week'
  const lastDay = focus.day >= focus.total_days
  const facts = [p.age, p.city, p.profession].filter(Boolean).join(' · ')

  return (
    <section className="space-y-6">
      <header className="flex items-center gap-4">
        <Avatar name={p.display_name} src={avatarFor(p.user_id, candidates)} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Jodi Week</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl leading-tight">{p.display_name}</h1>
            {p.verified && <VerifiedBadge />}
          </div>
          <p className="truncate text-sm text-muted">{facts}</p>
        </div>
      </header>

      <DayCounter day={focus.day} total={focus.total_days} />

      {result ? (
        <Outcome result={result} them={them} onReset={() => { setResult(undefined); reload() }} />
      ) : focus.status === 'locked' ? (
        <Moving them={them} />
      ) : !active ? (
        <Ended them={them} />
      ) : focus.decision_me ? (
        <Card className="text-center text-sm text-muted">
          You chose to <span className="font-medium text-ink">{focus.decision_me}</span>. Waiting for {them} to decide.
        </Card>
      ) : (
        lastDay && <Decision focus={focus} uid={uid} onDecided={setResult} />
      )}

      {active && !result && focus.deck_today.length > 0 && (
        <div>
          <SectionTitle>Today's prompts</SectionTitle>
          <p className="-mt-2 mb-3 text-xs text-muted">{deckTheme(focus.day)} · tap one to ask {them}</p>
          <div className="grid gap-2">
            {focus.deck_today.map((q) => {
              const isUsed = used.includes(q)
              return (
                <button
                  key={q}
                  type="button"
                  disabled={isUsed || sendingPrompt !== undefined}
                  onClick={() => sendPrompt(q)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                    isUsed ? 'border-line bg-sand/50 text-muted line-through decoration-muted/40' : 'border-gold-500/40 bg-gold-100/40 hover:bg-gold-100'
                  }`}
                >
                  {q}
                  {isUsed && <span className="ml-2 text-xs no-underline">· sent</span>}
                </button>
              )
            })}
          </div>
          {promptError && <p className="mt-2 text-xs text-brand-700">Couldn't send that. {promptError}</p>}
        </div>
      )}

      {active && !chat.closed && (
        <div>
          <SectionTitle>Chat with {them}</SectionTitle>
          <Chat uid={uid} partnerName={them} messages={chat.messages} pollError={chat.error} onSend={send} />
        </div>
      )}

      {active && !result && !focus.decision_me && !lastDay && <Decision focus={focus} uid={uid} onDecided={setResult} />}
    </section>
  )
}
