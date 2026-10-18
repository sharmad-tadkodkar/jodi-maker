import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, getUserId, type Brief as BriefT, type LearningResult } from '../api/client'
import FitRadar from '../components/FitRadar'
import LearningCard from '../components/LearningCard'
import ReasonSheet from '../components/ReasonSheet'
import { Avatar, Button, Card, ErrorState, Loading, SectionTitle, VerifiedBadge } from '../components/ui'
import { DIMENSION_LABEL, firstName, pct } from '../lib/format'
import { errorMessage, httpStatus, useAsync } from '../lib/useAsync'

type Phase = 'reading' | 'passing' | 'learned' | 'waiting'

function Flags({ items, tone }: { items: BriefT['green_flags']; tone: 'green' | 'yellow' }) {
  const dot = tone === 'green' ? 'bg-sage-600' : 'bg-amber-500' // DESIGN.md: sage = green flag, amber = worth exploring
  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <li key={f.text} className="flex gap-3">
          <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${dot}`} />
          <div>
            <p className="font-medium">{f.text}</p>
            <p className="mt-0.5 text-sm italic text-muted">{f.evidence}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function BriefBody({ brief }: { brief: BriefT }) {
  const c = brief.candidate
  const facts = [c.age, c.city, c.profession].filter(Boolean).join(' · ')
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Avatar name={c.display_name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Today's brief</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl leading-tight">{c.display_name}</h1>
            {c.verified && <VerifiedBadge />}
          </div>
          <p className="text-sm text-muted">{facts}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl leading-none text-brand-600">{pct(brief.compatibility)}%</p>
          <p className="mt-1 text-xs text-muted">compatible</p>
        </div>
      </header>

      <p className="font-display text-lg leading-relaxed text-ink/90">{brief.snapshot}</p>

      <Card>
        <SectionTitle>Why you fit</SectionTitle>
        <FitRadar whyFit={brief.why_fit} />
        <ul className="mt-2 divide-y divide-line">
          {brief.why_fit.map((w) => (
            <li key={w.dimension} className="flex gap-3 py-2.5 text-sm">
              <span className="w-28 shrink-0 font-medium">{DIMENSION_LABEL[w.dimension]}</span>
              <span className="flex-1 text-muted">{w.reason}</span>
              <span className="tabular-nums text-brand-600">{pct(w.score)}</span>
            </li>
          ))}
        </ul>
      </Card>

      {brief.green_flags.length > 0 && (
        <Card>
          <SectionTitle>Green flags</SectionTitle>
          <Flags items={brief.green_flags} tone="green" />
        </Card>
      )}

      {brief.explore.length > 0 && (
        <Card>
          <SectionTitle>Worth exploring</SectionTitle>
          <Flags items={brief.explore} tone="yellow" />
        </Card>
      )}

      {brief.questions_only_you.length > 0 && (
        <Card>
          <SectionTitle>Questions only you can ask</SectionTitle>
          <ol className="list-decimal space-y-2 pl-5 text-sm marker:text-gold-700">
            {brief.questions_only_you.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </Card>
      )}

      <Card className="bg-sand/60">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">For your family</p>
        <p className="mt-2 text-sm leading-relaxed">{brief.family_fit}</p>
      </Card>

      <Link to={`/brief/${brief.match_id}/transcript`} className="block text-center text-sm font-medium text-brand-600 hover:underline">
        Read the full matchmaker conversation →
      </Link>
    </div>
  )
}

function noBriefYet(e: unknown): null {
  if (httpStatus(e) === 404) return null
  throw e
}

/** Empty state: in a Jodi Week (queue paused), a match not yet interviewed, or nothing new. */
function NoBrief({ matchId }: { matchId?: string }) {
  const uid = getUserId()
  const { data: user } = useAsync(() => api.getUser(uid).catch(() => null), [uid])
  const link = 'inline-block text-sm font-medium text-brand-600 hover:underline'
  if (user?.status === 'in_focus' && user.active_match_id) {
    return (
      <Card className="space-y-3 text-center">
        <p className="font-display text-xl">You're in a Jodi Week</p>
        <p className="text-sm text-muted">New briefs are paused so you can give this one your full attention.</p>
        <Link to={`/focus/${user.active_match_id}`} className={link}>
          Back to your Jodi Week →
        </Link>
      </Card>
    )
  }
  return (
    <Card className="space-y-3 text-center">
      <p className="font-display text-xl">{matchId ? 'No brief for this match yet' : 'No new brief right now'}</p>
      <p className="text-sm text-muted">
        {matchId
          ? "Your matchmaker writes the brief after talking with theirs."
          : "Your matchmaker is still scouting. I'll bring you someone when they're worth your time."}
      </p>
      <Link to={matchId ? `/brief/${matchId}/transcript` : '/pipeline'} className={link}>
        {matchId ? 'Let the matchmakers talk →' : 'See your pipeline →'}
      </Link>
    </Card>
  )
}

/** /brief → the next brief in the queue; /brief/:matchId → a specific one. */
export default function Brief() {
  const { matchId } = useParams()
  const uid = getUserId()
  const navigate = useNavigate()
  const { data: brief, error, loading, reload } = useAsync<BriefT | null>(
    // 404 = not this user's turn yet (mutual consent) — treat as "no brief yet", not an error.
    () => (matchId ? api.getBrief(matchId, uid).catch(noBriefYet) : api.getNextBrief(uid)),
    [matchId, uid],
  )
  const [phase, setPhase] = useState<Phase>('reading')
  const [learning, setLearning] = useState<LearningResult>()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string>()

  function nextBrief() {
    setPhase('reading')
    setLearning(undefined)
    window.scrollTo({ top: 0 })
    if (matchId) navigate('/brief')
    else reload()
  }

  async function decide(decision: 'interested' | 'pass', reason?: string) {
    if (!brief) return
    setBusy(true)
    setActionError(undefined)
    try {
      const res = await api.decide(brief.match_id, uid, decision, reason)
      if (decision === 'interested') {
        if (res.mutual) navigate(`/mutual/${brief.match_id}`)
        else setPhase('waiting')
      } else if (res.learning) {
        setLearning(res.learning)
        setPhase('learned')
      } else {
        nextBrief()
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setActionError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !brief) return <Loading label="Opening your brief…" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!brief) return <NoBrief matchId={matchId} />

  const name = firstName(brief.candidate.display_name)

  if (phase === 'learned' && learning) {
    return (
      <section className="space-y-6">
        <p className="text-sm text-muted">You passed on {name}. Thank you for telling me why.</p>
        <LearningCard learning={learning} />
        <Button className="w-full" onClick={nextBrief}>
          See my next brief
        </Button>
      </section>
    )
  }

  if (phase === 'waiting') {
    return (
      <Card className="space-y-4 text-center">
        <p className="text-3xl" aria-hidden>
          🤞
        </p>
        <p className="font-display text-2xl">Your interest is with Jodi</p>
        <p className="text-sm text-muted">
          {name} will now get their own brief about you. If they're interested too, it becomes mutual and your Jodi Week begins.
          If not, you'll simply never hear about it.
        </p>
        <Link to="/pipeline" className="inline-block text-sm font-medium text-brand-600 hover:underline">
          Back to your pipeline
        </Link>
      </Card>
    )
  }

  return (
    <section className="space-y-6">
      <BriefBody brief={brief} />

      {actionError && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700">{actionError}</p>}
      {busy && (
        <p role="status" className="text-center text-sm text-muted">
          Your matchmaker is thinking about this…
        </p>
      )}

      <div className="sticky bottom-16 z-10 sm:bottom-4">
        {phase === 'passing' ? (
          <ReasonSheet
            title="What didn't feel right?"
            hint={`Only Jodi sees this — ${name} is never told. It helps me find better people for you.`}
            submitLabel="Pass"
            busy={busy}
            onCancel={() => setPhase('reading')}
            onSubmit={(r) => decide('pass', r)}
          />
        ) : (
          <div className="flex gap-3 rounded-full border border-line bg-white/95 p-2 shadow-lg backdrop-blur">
            <Button variant="secondary" className="flex-1" onClick={() => setPhase('passing')} disabled={busy}>
              Pass
            </Button>
            <Button className="flex-1" busy={busy} onClick={() => decide('interested')}>
              I'm interested
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
