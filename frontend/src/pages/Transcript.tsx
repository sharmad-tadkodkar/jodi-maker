import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, getUserId, type InterviewResponse, type InterviewTurn } from '../api/client'
import { Avatar, Button, Card, ErrorState, Loading, PageHeader, Typing } from '../components/ui'
import { errorMessage } from '../lib/useAsync'

const POLL_MS = 1500
const REVEAL_MS = 1100 // pace turns so even a batch of new ones reads like a live conversation

const ROUND_TITLE: Record<InterviewTurn['round'], string> = {
  1: 'Family',
  2: 'Getting to know them',
  3: 'Closing',
}


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

function Bubble({ turn, mine }: { turn: InterviewTurn; mine: boolean }) {
  if (turn.speaker === 'moderator') {
    return <p className="mx-auto max-w-sm text-center text-xs italic text-muted">{turn.text}</p>
  }
  const hl =
    turn.highlight === 'green'
      ? { ring: 'ring-2 ring-sage-600/40', label: 'Green flag', labelClass: 'text-sage-700' }
      : turn.highlight === 'yellow'
        ? { ring: 'ring-2 ring-amber-500/50', label: 'Worth exploring', labelClass: 'text-amber-700' }
        : null
  return (
    <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} animate-[fadeUp_.35s_ease-out]`}>
      {/* DESIGN.md: brand = my matchmaker, teal = their matchmaker */}
      <Avatar name={turn.speaker_name} size="sm" tone={mine ? 'brand' : 'teal'} />
      <div className={`max-w-[80%] space-y-1 ${mine ? 'items-end text-right' : ''} flex flex-col`}>
        <p className="px-1 text-[11px] text-muted">{turn.speaker_name}</p>
        <div
          className={`rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${
            mine ? 'rounded-br-sm bg-brand-600 text-white' : 'rounded-bl-sm border border-line bg-white'
          } ${hl?.ring ?? ''}`}
        >
          {turn.text}
        </div>
        {hl && <p className={`px-1 text-[11px] font-medium ${hl.labelClass}`}>● {hl.label}</p>}
      </div>
    </div>
  )
}

function RoundDivider({ round }: { round: InterviewTurn['round'] }) {
  return (
    <div className="flex items-center gap-3 pt-2 text-xs font-medium uppercase tracking-[0.14em] text-gold-700">
      <span className="h-px flex-1 bg-line" />
      Round {round} · {ROUND_TITLE[round]}
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

export default function Transcript() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()
  const [interview, setInterview] = useState<InterviewResponse>()
  const [shown, setShown] = useState(0)
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)

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

  return (
    <section>
      <PageHeader eyebrow="Matchmaker conversation" title="Before you meet, they talked">
        The two matchmakers interviewed each other on your behalf. Highlighted lines are what made it into your brief.
      </PageHeader>

      <div className="space-y-4">
        {visible.map((turn, i) => {
          const prev = visible[i - 1]
          // Summarise a round once the next round has started on screen (or the whole thing is done).
          const after = turns[i + 1]
          const showSummary = after ? after.round !== turn.round && i + 1 < shown : finished
          const summary = interview.round_summaries[turn.round - 1]
          return (
            <div key={turn.id} className="space-y-4">
              {(!prev || prev.round !== turn.round) && <RoundDivider round={turn.round} />}
              <Bubble turn={turn} mine={turn.speaker === mySpeaker} />
              {showSummary && summary && (
                <p className="rounded-xl bg-sand/70 px-4 py-2.5 text-center text-xs text-muted">
                  <span className="font-medium text-ink">Round summary:</span> {summary}
                </p>
              )}
            </div>
          )
        })}

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
    </section>
  )
}
