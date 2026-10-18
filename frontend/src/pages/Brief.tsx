import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, getUserId, type Brief as BriefT, type LearningResult } from '../api/client'
import FitRadar from '../components/FitRadar'
import LearningCard from '../components/LearningCard'
import ReasonSheet from '../components/ReasonSheet'
import {
  Briefcase,
  Cake,
  Check,
  CircleCheck,
  Compass,
  Copy,
  Gem,
  type LucideIcon,
  MapPin,
  MessageCircle,
  Sun,
  Users,
} from 'lucide-react'
import { Avatar, Button, Card, Chip, ErrorState, Icon, Loading, ScoreRing, SectionTitle, VerifiedBadge } from '../components/ui'
import { DIMENSION_COLOR, DIMENSION_LABEL, firstName, pct, type Dimension } from '../lib/format'
import { leadSentences, snapshotFacts } from '../lib/snapshot'
import { avatarFor, useViewerGenders } from '../lib/avatars'
import { errorMessage, httpStatus, useAsync } from '../lib/useAsync'

type Phase = 'reading' | 'passing' | 'learned' | 'waiting'

/** Staggered entrance wrapper — see `.rise` in index.css (content is visible even if it never animates). */
function Rise({ i, children, className }: { i: number; children: ReactNode; className?: string }) {
  return (
    <div className={`rise ${className ?? ''}`} style={{ '--rise-i': i } as CSSProperties}>
      {children}
    </div>
  )
}

const FLAG_STYLE = {
  green: { card: 'border-sage-500/30 bg-sage-50', icon: CircleCheck, iconClass: 'text-sage-600', title: 'Green flags' },
  yellow: { card: 'border-amber-500/30 bg-amber-50', icon: Compass, iconClass: 'text-amber-600', title: 'Worth exploring' },
} as const

/** DESIGN.md: sage = green flag, amber = worth exploring. Claim in bold, evidence as a muted italic quote. */
function FlagCards({ items, tone }: { items: BriefT['green_flags']; tone: keyof typeof FLAG_STYLE }) {
  const st = FLAG_STYLE[tone]
  return (
    <section>
      <SectionTitle>{st.title}</SectionTitle>
      <ul className="space-y-3">
        {items.map((f) => (
          <li key={f.text} className={`flex gap-3 rounded-2xl border p-4 ${st.card}`}>
            <Icon icon={st.icon} size="md" className={`mt-0.5 ${st.iconClass}`} />
            <div className="min-w-0">
              <p className="font-semibold leading-snug text-ink">{f.text}</p>
              <p className="mt-1.5 text-sm italic leading-relaxed text-muted">{f.evidence}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

const DIMENSION_ICON: Record<Dimension, LucideIcon> = {
  values: Gem,
  family_fit: Users,
  lifestyle: Sun,
  career: Briefcase,
  location: MapPin,
  communication: MessageCircle,
}

/** Pull-quote (lead sentence, 2 lines) + chips found in the text; full snapshot behind "Read more". */
function Snapshot({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const lead = leadSentences(text)
  const facts = snapshotFacts(text)
  const hasMore = text.trim().length > lead.length + 1
  return (
    <section aria-label="Snapshot" className="space-y-3">
      <blockquote className="border-l-4 border-gold-500 pl-4">
        <p className={`font-display text-xl leading-snug text-ink lg:text-2xl ${open ? '' : 'line-clamp-2'}`}>
          {open ? text : lead}
        </p>
      </blockquote>
      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        {facts.map((f) => (
          <Chip key={f} tone="gold">
            {f}
          </Chip>
        ))}
        {hasMore && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="ml-1 text-sm font-medium text-brand-600 hover:underline"
          >
            {open ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>
    </section>
  )
}

/** Note card with a copy button (clipboard API; falls back to a calm message if it's unavailable). */
function QuestionNote({ q, n }: { q: string; n: number }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const t = setTimeout(() => setState('idle'), 1800)
    return () => clearTimeout(t)
  }, [state])
  async function copy() {
    try {
      await navigator.clipboard.writeText(q)
      setState('copied')
    } catch {
      setState('failed')
    }
  }
  return (
    <li className="flex flex-col justify-between gap-3 rounded-2xl border border-gold-500/30 bg-gold-100/40 p-4 shadow-card">
      <p className="text-sm leading-relaxed text-ink">
        <span className="mr-1.5 font-display text-gold-700">{n}.</span>
        {q}
      </p>
      <div className="flex items-center justify-end gap-2">
        {/* Success is shown on the button; announce it for screen readers only. Failure is shown to everyone. */}
        <span aria-live="polite" className={state === 'failed' ? 'text-xs text-muted' : 'sr-only'}>
          {state === 'copied' ? 'Question copied' : state === 'failed' ? "Couldn't copy — select the text instead" : ''}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy question ${n}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-sand"
        >
          <Icon icon={state === 'copied' ? Check : Copy} size="xs" className={state === 'copied' ? 'text-sage-600' : ''} />
          {state === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
    </li>
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

/** Snapshot, why-you-fit, flags, questions, family — the right column from lg. Sections rise in sequence. */
function BriefContent({ brief }: { brief: BriefT }) {
  return (
    <div className="space-y-8">
      <Rise i={0}>
        <Snapshot text={brief.snapshot} />
      </Rise>

      <Rise i={1}>
        <Card>
          <SectionTitle>Why you fit</SectionTitle>
          <FitRadar whyFit={brief.why_fit} />
          <ul className="mt-4 grid gap-2 lg:grid-cols-2">
            {brief.why_fit.map((w) => (
              <li key={w.dimension} className="flex items-start gap-3 rounded-xl bg-cream p-3">
                <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-white shadow-card">
                  <Icon icon={DIMENSION_ICON[w.dimension]} size="sm" className="text-ink" />
                  <span aria-hidden className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-cream ${DIMENSION_COLOR[w.dimension]}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{DIMENSION_LABEL[w.dimension]}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-ink shadow-card">{pct(w.score)}</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{w.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </Rise>

      {(brief.green_flags.length > 0 || brief.explore.length > 0) && (
        <Rise i={2} className="grid gap-8 xl:grid-cols-2">
          {brief.green_flags.length > 0 && <FlagCards items={brief.green_flags} tone="green" />}
          {brief.explore.length > 0 && <FlagCards items={brief.explore} tone="yellow" />}
        </Rise>
      )}

      {brief.questions_only_you.length > 0 && (
        <Rise i={3}>
          <section>
            <SectionTitle>Questions only you can ask</SectionTitle>
            <ol className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {brief.questions_only_you.map((q, i) => (
                <QuestionNote key={q} q={q} n={i + 1} />
              ))}
            </ol>
          </section>
        </Rise>
      )}

      <Rise i={4}>
        <Card className="bg-sand/60">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">For your family</p>
          <p className="mt-2 text-sm leading-relaxed">{brief.family_fit}</p>
        </Card>
      </Rise>

      <Link to={`/brief/${brief.match_id}/transcript`} className="block text-center text-sm font-medium text-brand-600 hover:underline lg:hidden">
        Read the full matchmaker conversation →
      </Link>
    </div>
  )
}

/** Live height of an element (ResizeObserver). */
function useHeight<T extends HTMLElement>(): [RefCallback<T>, number] {
  const [h, setH] = useState(0)
  const ro = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect()
    if (!el) return
    ro.current = new ResizeObserver(([e]) => setH(Math.ceil(e.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight)))
    ro.current.observe(el)
  }, [])
  return [ref, h]
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
  const [barRef, barHeight] = useHeight<HTMLDivElement>()

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
    <section className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-10 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)] 2xl:gap-14">
      <aside className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pb-2">
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
        {/* Below lg the decision bar is fixed above the tab bar; this spacer is exactly its height (measured,
            so the taller Pass sheet is covered too) — the bar can never sit on top of the last content. */}
        <div aria-hidden className="lg:hidden" style={{ height: barHeight + 16 }} />
        <div ref={barRef} className="fixed inset-x-0 bottom-16 z-10 mx-auto max-w-6xl px-4 md:bottom-4 lg:hidden">
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
