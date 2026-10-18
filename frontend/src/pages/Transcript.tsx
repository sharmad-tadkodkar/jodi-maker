import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, getUserId, type InterviewResponse, type InterviewTurn } from '../api/client'
import { Check, ChevronDown, CircleDashed, Compass, Radio, Sparkles, Star } from 'lucide-react'
import { Avatar, Button, Card, ErrorState, Icon, Loading, PageHeader, Typing } from '../components/ui'
import { MATCHMAKER_AVATAR } from '../lib/avatars'
import { errorMessage } from '../lib/useAsync'

const POLL_MS = 1500
const REVEAL_MS = 1100 // pace turns so even a batch of new ones reads like a live conversation

const ROUND_TITLE: Record<InterviewTurn['round'], string> = {
  1: 'Family',
  2: 'Getting to know them',
  3: 'Closing',
}
const ROUNDS = [1, 2, 3] as const
const lines = (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`
const SHORT_TITLE: Record<InterviewTurn['round'], string> = { 1: 'Family', 2: 'Getting to know', 3: 'Closing' }

/** Whose matchmaker is "mine": match the viewer's first name against speaker names, else assume agent_a. */
function useMySpeaker(turns: InterviewTurn[]) {
  const uid = getUserId()
  const [firstName, setFirstName] = useState<string>()
  useEffect(() => {
    api.getUser(uid).then((u) => setFirstName(u.name.split(' ')[0])).catch(() => {})
  }, [uid])
  const byName = firstName && turns.find((t) => t.speaker !== 'moderator' && t.speaker_name.startsWith(firstName))
  return byName ? byName.speaker : 'agent_a'
}

const HIGHLIGHT = {
  green: { border: 'border-l-sage-600', tag: 'bg-sage-100 text-sage-700', icon: Star, label: 'Green flag' },
  yellow: { border: 'border-l-amber-600', tag: 'bg-amber-100 text-amber-700', icon: Compass, label: 'Worth exploring' },
} as const

/** One matchmaker turn. Mine: light maroon tint, dark text (DESIGN.md brand = mine); theirs: white.
 * Key moments get a 3px sage/amber left border and a visible tag — never colour alone. */
function Bubble({ turn, mine }: { turn: InterviewTurn; mine: boolean }) {
  if (turn.speaker === 'moderator') {
    return <p className="mx-auto max-w-sm text-center text-xs italic text-muted">{turn.text}</p>
  }
  const hl = turn.highlight ? HIGHLIGHT[turn.highlight] : null
  return (
    <div className={`flex items-start gap-2.5 ${mine ? 'flex-row-reverse' : ''} animate-[fadeUp_.35s_ease-out]`}>
      <Avatar name={turn.speaker_name} src={MATCHMAKER_AVATAR[mine ? 'mine' : 'theirs']} size="md" tone={mine ? 'brand' : 'teal'} className="mt-5" />
      <div className={`flex max-w-[82%] flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
        <p className={`flex flex-wrap items-center gap-1.5 px-1 text-xs ${mine ? 'justify-end' : ''}`}>
          <span className="font-medium text-ink">{turn.speaker_name}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-sand px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted">
            <Icon icon={Sparkles} size="xs" className="size-3" />
            AI matchmaker
          </span>
        </p>
        <div
          className={`rounded-2xl border px-4 py-3 text-left text-sm leading-relaxed text-ink ${
            mine ? 'rounded-tr-sm border-brand-100 bg-brand-50' : 'rounded-tl-sm border-line bg-white'
          } ${hl ? `border-l-[3px] ${hl.border}` : ''}`}
        >
          {hl && (
            <p className={`mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${hl.tag}`}>
              <Icon icon={hl.icon} size="xs" className="size-3" />
              Key moment · {hl.label}
            </p>
          )}
          <p>{turn.text}</p>
        </div>
      </div>
    </div>
  )
}

/** A round as a collapsible section. Collapsed: header + the round's summary. */
function RoundSection({ round, turns, summary, state, open, onToggle, children }: {
  round: InterviewTurn['round']
  turns: InterviewTurn[]
  summary?: string
  state: RoundState
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const green = turns.filter((t) => t.highlight === 'green').length
  const amber = turns.filter((t) => t.highlight === 'yellow').length
  const stats = [green > 0 && `${green} green`, amber > 0 && `${amber} to explore`, state === 'live' && 'live'].filter(Boolean) as string[]
  const bodyId = `round-body-${round}`
  return (
    <section id={`round-${round}`} className="scroll-mt-28 space-y-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-xl py-1 text-left focus-visible:outline-2 focus-visible:outline-brand-500 sm:gap-3"
      >
        <span aria-hidden className="hidden h-px flex-1 bg-line sm:block" />
        <span className="whitespace-nowrap text-xs font-medium uppercase tracking-[0.14em] text-gold-700">
          Round {round} · <span className="sm:hidden">{SHORT_TITLE[round]}</span>
          <span className="hidden sm:inline">{ROUND_TITLE[round]}</span>
        </span>
        <span className="ml-auto truncate text-xs text-muted sm:ml-0">
          <span className="sm:hidden">{stats.join(' · ')}</span>
          <span className="hidden sm:inline">{[lines(turns.length), ...stats].join(' · ')}</span>
        </span>
        <Icon icon={ChevronDown} size="sm" className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        <span aria-hidden className="hidden h-px flex-1 bg-line sm:block" />
      </button>
      {open ? (
        <div id={bodyId} className="space-y-4">
          {children}
          {summary && state === 'done' && <Summary text={summary} />}
        </div>
      ) : (
        <div id={bodyId}>
          {summary ? <Summary text={summary} /> : <p className="text-center text-xs text-muted">Summary appears when the round ends.</p>}
        </div>
      )}
    </section>
  )
}

function Summary({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-sand/70 px-4 py-2.5 text-center text-xs text-muted">
      <span className="font-medium text-ink">Round summary:</span> {text}
    </p>
  )
}

/** Family → Getting to know → Closing, at the top of the page on every screen size. */
function RoundStepper({ states, onJump }: { states: Record<InterviewTurn['round'], RoundState>; onJump: (r: InterviewTurn['round']) => void }) {
  return (
    <nav aria-label="Interview rounds" className="mb-6">
      <ol className="flex items-center">
        {ROUNDS.map((r, i) => {
          const st = states[r]
          const reachable = st === 'done' || st === 'live'
          return (
            <li key={r} className={`flex items-center ${i < ROUNDS.length - 1 ? 'flex-1' : ''}`}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onJump(r)}
                aria-current={st === 'live' ? 'step' : undefined}
                className="flex min-w-0 items-center gap-2 rounded-full py-1 pr-2 text-left enabled:hover:bg-sand"
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    st === 'done' ? 'bg-sage-600 text-white' : st === 'live' ? 'bg-brand-600 text-white' : 'border border-line bg-white text-muted'
                  }`}
                >
                  {st === 'done' ? <Icon icon={Check} size="xs" /> : r}
                </span>
                <span className={`truncate text-xs font-medium sm:text-sm ${reachable ? 'text-ink' : 'text-muted'}`}>{SHORT_TITLE[r]}</span>
                <span className="sr-only">— {st === 'done' ? 'finished' : st === 'live' ? 'in progress' : st === 'skipped' ? 'not reached' : 'up next'}</span>
              </button>
              {i < ROUNDS.length - 1 && (
                <span aria-hidden className={`mx-1 h-0.5 min-w-3 flex-1 rounded-full ${st === 'done' ? 'bg-sage-500' : 'bg-line'}`} />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Round states from what's on screen (shared by the stepper, the round headers and the side panel). */
function roundStates(interview: InterviewResponse, turns: InterviewTurn[], shown: number, running: boolean) {
  const visible = turns.slice(0, shown)
  const current = visible.at(-1)?.round
  const ended = interview.status === 'ended_dealbreaker'
  const stateOf = (r: InterviewTurn['round']): RoundState => {
    if (!visible.some((t) => t.round === r)) return ended && !running ? 'skipped' : 'upcoming'
    const more = turns.slice(shown).some((t) => t.round === r)
    return more || (running && r === current) ? 'live' : 'done'
  }
  return { 1: stateOf(1), 2: stateOf(2), 3: stateOf(3) } as Record<InterviewTurn['round'], RoundState>
}

type RoundState = 'done' | 'live' | 'upcoming' | 'skipped'

/** Desktop side panel: where the conversation is, round by round. Derived from what's on screen. */
function RoundProgress({ interview, turns, shown, running, onRead, onJump }: {
  interview: InterviewResponse
  turns: InterviewTurn[]
  shown: number
  running: boolean
  onRead?: () => void
  onJump: (r: InterviewTurn['round']) => void
}) {
  const visible = turns.slice(0, shown)
  const ended = interview.status === 'ended_dealbreaker'
  const states = roundStates(interview, turns, shown, running)
  const stateOf = (r: InterviewTurn['round']) => states[r]
  const pctDone = turns.length ? Math.round((shown / turns.length) * 100) : 0
  const badge = { done: Check, live: Radio, upcoming: CircleDashed, skipped: CircleDashed }

  return (
    <Card className="space-y-4 p-4">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Round progress</p>
        <p className="text-sm">
          {ended ? 'Ended early — dealbreaker' : running || shown < turns.length ? 'In conversation…' : 'Conversation finished'}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-sand">
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-700" style={{ width: `${running ? Math.min(pctDone, 95) : pctDone}%` }} />
        </div>
      </div>
      <ol className="space-y-1">
        {ROUNDS.map((r) => {
          const st = stateOf(r)
          const seen = visible.filter((t) => t.round === r)
          const green = seen.filter((t) => t.highlight === 'green').length
          const amber = seen.filter((t) => t.highlight === 'yellow').length
          const summary = st === 'done' ? interview.round_summaries[r - 1] : undefined
          return (
            <li key={r}>
              <button
                type="button"
                disabled={st === 'upcoming' || st === 'skipped'}
                onClick={() => onJump(r)}
                className="flex w-full gap-3 rounded-xl p-2 text-left enabled:hover:bg-sand disabled:opacity-60"
              >
                <span
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                    st === 'done' ? 'bg-sage-100 text-sage-700' : st === 'live' ? 'bg-brand-50 text-brand-600' : 'bg-sand text-muted'
                  }`}
                >
                  <Icon icon={badge[st]} size="xs" className={st === 'live' ? 'animate-pulse' : ''} />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block text-sm font-medium text-ink">
                    {r}. {ROUND_TITLE[r]}
                  </span>
                  <span className="block text-xs text-muted">
                    {st === 'upcoming' ? 'Up next' : st === 'skipped' ? 'Not reached' : lines(seen.length)}
                    {green > 0 && <span className="text-sage-700"> · {green} green</span>}
                    {amber > 0 && <span className="text-amber-700"> · {amber} to explore</span>}
                  </span>
                  {summary && <span className="line-clamp-3 text-xs text-muted">{summary}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {onRead && (
        <Button className="w-full" onClick={onRead}>
          Read the brief
        </Button>
      )}
    </Card>
  )
}

export default function Transcript() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()
  const [interview, setInterview] = useState<InterviewResponse>()
  const [shown, setShown] = useState(0)
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const [collapsed, setCollapsed] = useState<Set<InterviewTurn['round']>>(new Set())

  // Load; start the interview if it hasn't run; poll while it's running.
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout>
    async function tick(first: boolean) {
      try {
        let r = await api.getInterview(matchId)
        if (first && r.status === 'not_started') {
          await api.runInterview(matchId)
          r = await api.getInterview(matchId)
        } else if (first && r.status !== 'running') {
          // Already finished: show it all at once (Replay animates it for the video).
          if (live) setShown(r.turns.length)
        }
        if (!live) return
        setInterview(r)
        if (r.status === 'running' || r.status === 'not_started') timer = setTimeout(() => tick(false), POLL_MS)
      } catch (e) {
        if (live) setError(errorMessage(e))
      }
    }
    tick(true)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [matchId, attempt])

  const turns = useMemo(() => [...(interview?.turns ?? [])].sort((a, b) => a.turn_index - b.turn_index), [interview])
  const mySpeaker = useMySpeaker(turns)

  // Reveal received turns one at a time.
  useEffect(() => {
    if (shown >= turns.length) return
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 400 : REVEAL_MS)
    return () => clearTimeout(t)
  }, [shown, turns.length])

  useEffect(() => {
    if (shown > 0 && shown < turns.length) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }, [shown, turns.length])

  if (error) return <ErrorState error={error} onRetry={() => {
          setError(undefined)
          setAttempt((a) => a + 1)
        }} />
  if (!interview) return <Loading label="Joining the matchmakers' conversation…" />

  const running = interview.status === 'running' || interview.status === 'not_started'
  const revealing = shown < turns.length
  const finished = !running && !revealing
  const visible = turns.slice(0, shown)
  const next = turns[shown]
  const typingName = next?.speaker_name ?? 'Your matchmaker'
  const states = roundStates(interview, turns, shown, running)
  function jumpTo(r: InterviewTurn['round']) {
    setCollapsed((c) => {
      const n = new Set(c)
      n.delete(r)
      return n
    })
    requestAnimationFrame(() => document.getElementById(`round-${r}`)?.scrollIntoView({ behavior: 'smooth' }))
  }
  function toggle(r: InterviewTurn['round']) {
    setCollapsed((c) => {
      const n = new Set(c)
      if (n.has(r)) n.delete(r)
      else n.add(r)
      return n
    })
  }

  return (
    <section className="lg:grid lg:grid-cols-[minmax(0,760px)_280px] lg:items-start lg:justify-center lg:gap-10 xl:grid-cols-[minmax(0,880px)_320px] xl:gap-12 2xl:grid-cols-[minmax(0,960px)_360px]">
      <div className="mx-auto w-full max-w-[760px] xl:max-w-[880px] 2xl:max-w-[960px]">
        <PageHeader eyebrow="Matchmaker conversation" title="Before you meet, they talked">
          The two matchmakers interviewed each other on your behalf. Highlighted lines are what made it into your brief.
        </PageHeader>

        <RoundStepper states={states} onJump={jumpTo} />

        <div className="space-y-6">
          {ROUNDS.filter((r) => visible.some((t) => t.round === r)).map((r) => (
            <RoundSection
              key={r}
              round={r}
              turns={visible.filter((t) => t.round === r)}
              summary={states[r] === 'done' ? interview.round_summaries[r - 1] : undefined}
              state={states[r]}
              open={!collapsed.has(r)}
              onToggle={() => toggle(r)}
            >
              {visible
                .filter((t) => t.round === r)
                .map((turn) => (
                  <Bubble key={turn.id} turn={turn} mine={turn.speaker === mySpeaker} />
                ))}
            </RoundSection>
          ))}

          {revealing && <Typing name={typingName} />}
          {running && !revealing && turns.length > 0 && (
            <p role="status" className="text-xs text-muted">The matchmakers are still talking — new lines appear as they speak…</p>
          )}
          {running && turns.length === 0 && (
            <p className="text-center text-sm text-muted">The matchmakers are getting started…</p>
          )}
        </div>

        {finished && (
          <div className="mt-8 space-y-4">
            {interview.status === 'ended_dealbreaker' && (
              <Card className="border-brand-200 bg-brand-50 text-sm text-brand-700">
                The matchmakers found a dealbreaker and ended the conversation early. Jodi won't bring you this match.
              </Card>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => { setShown(0); window.scrollTo({ top: 0 }) }}>
                Replay
              </Button>
              {interview.status === 'done' && (
                <Button className="flex-1" onClick={() => navigate(`/brief/${matchId}`)}>
                  Read the brief
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <aside className="hidden lg:sticky lg:top-20 lg:block">
        <RoundProgress
          interview={interview}
          turns={turns}
          shown={shown}
          running={running}
          onJump={jumpTo}
          onRead={finished && interview.status === 'done' ? () => navigate(`/brief/${matchId}`) : undefined}
        />
      </aside>
    </section>
  )
}
