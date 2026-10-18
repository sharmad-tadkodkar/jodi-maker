import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, getUserId, type Brief as BriefT, type LearningResult } from '../api/client'
import FitRadar from '../components/FitRadar'
import LearningCard from '../components/LearningCard'
import ReasonSheet from '../components/ReasonSheet'
import { Briefcase, Cake, MapPin } from 'lucide-react'
import { Avatar, Button, Card, Chip, ErrorState, Icon, Loading, ScoreRing, SectionTitle, VerifiedBadge } from '../components/ui'
import { DIMENSION_LABEL, firstName, pct } from '../lib/format'
import { avatarFor, useViewerGenders } from '../lib/avatars'
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

/** Who they are + the score. Plain header on mobile; a card in the sticky left column from lg. */
function ProfileCard({ brief }: { brief: BriefT }) {
  const { candidates } = useViewerGenders()
  const c = brief.candidate
  const facts: [typeof Cake, string | number | null | undefined][] = [
    [Cake, c.age],
    [MapPin, c.city],
    [Briefcase, c.profession],
  ]
  return (
    <header className="flex items-center gap-4 lg:flex-col lg:rounded-2xl lg:border lg:border-line lg:bg-white lg:p-6 lg:text-center lg:shadow-card">
      <Avatar name={c.display_name} src={avatarFor(c.user_id, candidates)} size="lg" className="lg:size-24 lg:text-4xl" />
      <div className="min-w-0 flex-1 space-y-1.5 lg:flex-none">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Today's brief</p>
        <div className="flex flex-wrap items-center gap-2 lg:justify-center">
          <h1 className="font-display text-3xl leading-tight">{c.display_name}</h1>
          {c.verified && <VerifiedBadge />}
        </div>
        <div className="flex flex-wrap gap-1.5 lg:justify-center">
          {facts.map(
            ([icon, v]) =>
              v != null &&
              v !== '' && (
                <Chip key={String(v)}>
                  <Icon icon={icon} size="xs" />
                  {v}
                </Chip>
              ),
          )}
        </div>
      </div>
      <div className="lg:hidden">
        <ScoreRing value={pct(brief.compatibility)} size={64} label="match" />
      </div>
      <div className="hidden lg:block">
        <ScoreRing value={pct(brief.compatibility)} size={128} stroke={8} label="compatible" />
      </div>
    </header>
  )
}

/** Snapshot, why-you-fit, flags, questions, family — the right column from lg. */
function BriefContent({ brief }: { brief: BriefT }) {
  return (
    <div className="space-y-6">
      <p className="font-display text-lg leading-relaxed text-ink/90 lg:text-xl">{brief.snapshot}</p>

      <Card>
        <SectionTitle>Why you fit</SectionTitle>
        <FitRadar whyFit={brief.why_fit} />
        <ul className="mt-2 grid lg:grid-cols-2 lg:gap-x-8">
          {brief.why_fit.map((w) => (
            <li key={w.dimension} className="border-t border-line py-3 text-sm first:border-t-0 lg:[&:nth-child(2)]:border-t-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{DIMENSION_LABEL[w.dimension]}</span>
                <span className="tabular-nums text-brand-600">{pct(w.score)}</span>
              </div>
              <p className="mt-0.5 text-muted">{w.reason}</p>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
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
      </div>

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

      <Link to={`/brief/${brief.match_id}/transcript`} className="block text-center text-sm font-medium text-brand-600 hover:underline lg:hidden">
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

  const status = (
    <>
      {actionError && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700">{actionError}</p>}
      {busy && (
        <p role="status" className="text-center text-sm text-muted">
          Your matchmaker is thinking about this…
        </p>
      )}
    </>
  )
  const passSheet = (
    <ReasonSheet
      title="What didn't feel right?"
      hint={`Only Jodi sees this — ${name} is never told. It helps me find better people for you.`}
      submitLabel="Pass"
      busy={busy}
      onCancel={() => setPhase('reading')}
      onSubmit={(r) => decide('pass', r)}
    />
  )

  // One decision state; it renders in the sticky left column from lg, and as a sticky bottom bar below lg.
  return (
    <section className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-10 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-20">
        <ProfileCard brief={brief} />
        <div className="hidden space-y-3 lg:block">
          {status}
          {phase === 'passing' ? (
            passSheet
          ) : (
            <div className="grid gap-2">
              <Button busy={busy} onClick={() => decide('interested')}>
                I'm interested
              </Button>
              <Button variant="secondary" onClick={() => setPhase('passing')} disabled={busy}>
                Pass
              </Button>
            </div>
          )}
          <Link to={`/brief/${brief.match_id}/transcript`} className="block pt-1 text-center text-sm font-medium text-brand-600 hover:underline">
            Read the full matchmaker conversation →
          </Link>
        </div>
      </aside>

      <div className="mt-6 space-y-6 lg:mt-0">
        <BriefContent brief={brief} />

        <div className="space-y-3 lg:hidden">{status}</div>
        <div className="sticky bottom-16 z-10 md:bottom-4 lg:hidden">
          {phase === 'passing' ? (
            passSheet
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
      </div>
    </section>
  )
}
