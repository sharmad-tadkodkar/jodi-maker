import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'framer-motion'
import { BadgeCheck, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getUserId, waitForJob, type Job, type PipelineItem } from '../api/client'
import { Avatar, Button, Card, Chip, ErrorState, Icon, Loading, PageHeader, ScoreBar, ScoreRing, Spinner } from '../components/ui'
import { DIMENSION_COLOR, DIMENSION_LABEL, DIMENSIONS, HAS_BRIEF, pct, STATUS, topDimensions } from '../lib/format'
import { avatarFor, useViewerGenders } from '../lib/avatars'
import { errorMessage, useAsync } from '../lib/useAsync'

/** Shape of a finished scout job's `result` (FRONTEND_GUIDE "Long-running jobs"). Every field optional — parse defensively. */
type ScoutSummary = {
  profiles_checked?: number
  passed_filter?: number
  filtered_out?: number
  scored?: number
  new_in_queue?: number
  queue_size?: number
  top?: string[]
  excluded_dealbreakers?: { name: string; reason: string }[]
  paused?: boolean // in a Jodi Week: scout is a no-op
}

function ScoutSummaryCard({ s, onClose }: { s: ScoutSummary; onClose: () => void }) {
  const excluded = s.excluded_dealbreakers ?? []
  const steps = [
    s.profiles_checked !== undefined && `checked ${s.profiles_checked} profiles`,
    s.passed_filter !== undefined && `${s.passed_filter} met your must-haves`,
    excluded.length > 0 && `${excluded.length} excluded for dealbreakers`,
  ].filter(Boolean) as string[]
  return (
    <Card className="mb-6 space-y-3 border-gold-500/40 animate-[fadeUp_.35s_ease-out]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Today's search</p>
        <button type="button" onClick={onClose} className="-mt-1 text-sm text-muted hover:text-ink" aria-label="Dismiss">
          ✕
        </button>
      </div>
      {steps.length > 0 && (
        <p className="font-display text-lg leading-snug">
          Your matchmaker {steps.map((t, i) => (
            <span key={t}>
              {i > 0 && <span className="text-gold-500"> → </span>}
              {t}
            </span>
          ))}
        </p>
      )}
      {excluded.length > 0 && (
        <ul className="space-y-1 text-xs text-muted">
          {excluded.map((e) => (
            <li key={e.name}>
              <span className="font-medium text-ink">{e.name}</span> — {e.reason}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted">
        {s.new_in_queue ? `${s.new_in_queue} new in your queue` : 'No one new today'}
        {s.top && s.top.length > 0 && ` · strongest: ${s.top.slice(0, 3).join(', ')}`}
      </p>
    </Card>
  )
}

/** Compact card: who, fit ring, top-2 strengths, status. Tap the summary to reveal the six dimension bars;
 * the action link (brief / matchmakers' conversation) is separate so expanding never navigates. */
function MatchCard({ item, nextUp }: { item: PipelineItem; nextUp: boolean }) {
  const { candidates } = useViewerGenders()
  const [open, setOpen] = useState(false)
  const { candidate: c, scores, status } = item
  const s = STATUS[status]
  const briefed = status === 'briefed'
  const facts = [c.age, c.city, c.profession].filter(Boolean).join(' · ')
  const strengths = topDimensions(scores, 2)
  const barsId = `bars-${item.match_id}`
  // Brief ready → open it. Not yet interviewed → the matchmakers' conversation, which leads to the brief.
  const to = HAS_BRIEF.includes(status)
    ? { href: `/brief/${item.match_id}`, label: 'Read brief' }
    : status === 'queued' || status === 'screening'
      ? { href: `/brief/${item.match_id}/transcript`, label: status === 'queued' ? 'Let the matchmakers talk' : 'Listen in' }
      : null

  return (
    <Card
      className={`relative p-4 ${briefed ? 'border-gold-500 bg-gradient-to-b from-gold-100/50 to-white to-40% ring-4 ring-gold-100' : ''} ${to ? '' : 'opacity-70'}`}
    >
      {nextUp && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-gold-500 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white shadow-card">
          Next up
        </span>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={barsId}
        onClick={() => setOpen((o) => !o)}
        className="block w-full space-y-2.5 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
      >
        <div className="flex items-center gap-3">
          <Avatar name={c.display_name} src={avatarFor(c.user_id, candidates)} />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate font-display text-lg leading-tight">{c.display_name}</h3>
              {c.verified && <Icon icon={BadgeCheck} size="xs" label="Verified" className="text-sage-600" />}
              {c.is_new && <Chip tone="gold">New</Chip>}
            </div>
            <p className="truncate text-sm text-muted">{facts}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ScoreRing value={pct(scores.overall)} size={52} label="fit" />
            <Icon icon={ChevronDown} size="sm" className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
            <span className="sr-only">{open ? 'Hide' : 'Show'} the six fit scores</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:pl-[60px]">
          <span className="sr-only">Strongest:</span>
          {strengths.map((d) => (
            <span key={d} className="inline-flex items-center gap-1.5 rounded-full bg-sand px-2 py-0.5 text-xs text-ink">
              <span aria-hidden className={`size-2 rounded-full ${DIMENSION_COLOR[d]}`} />
              {DIMENSION_LABEL[d]}
              <span className="tabular-nums text-muted">{pct(scores[d])}</span>
            </span>
          ))}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={barsId}
            key="bars"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 pt-4">
              {DIMENSIONS.map((d) => (
                <ScoreBar key={d} label={DIMENSION_LABEL[d]} value={pct(scores[d])} title={scores.reasons?.[d]} color={DIMENSION_COLOR[d]} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <Chip tone={s.tone}>{s.label}</Chip>
        {to && (
          <Link to={to.href} aria-label={`${c.display_name}: ${to.label}`} className="text-sm font-medium text-brand-600 hover:underline">
            {to.label} →
          </Link>
        )}
      </div>
    </Card>
  )
}

/** Brief-ready matches first (the next one gets "Next up"); everything else keeps the server's fit ranking. */
function order(items: PipelineItem[]): PipelineItem[] {
  return [...items.filter((i) => i.status === 'briefed'), ...items.filter((i) => i.status !== 'briefed')]
}

export default function Pipeline() {
  const uid = getUserId()
  const { data, error, loading, reload } = useAsync(() => api.getPipeline(uid), [uid])
  const [scouting, setScouting] = useState(false)
  const [progress, setProgress] = useState<string>()
  const [summary, setSummary] = useState<ScoutSummary>()
  const [scoutError, setScoutError] = useState<string>()

  async function scout() {
    setScouting(true)
    setScoutError(undefined)
    setSummary(undefined)
    setProgress('Your matchmaker is starting today\'s search…')
    try {
      const { job_id } = await api.runScout(uid)
      const job: Job = await waitForJob(job_id, (j) => j.progress && setProgress(j.progress))
      const result = job.result as ScoutSummary | null | undefined
      if (result && !result.paused) setSummary(result)
      reload()
    } catch (e) {
      setScoutError(errorMessage(e))
    } finally {
      setScouting(false)
      setProgress(undefined)
    }
  }

  return (
    <section>
      <PageHeader eyebrow="Your pipeline" title="People Jodi is considering">
        Ranked by fit. Jodi brings you one brief at a time — no endless scrolling.
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={scout} busy={scouting} disabled={data?.paused}>
          {scouting ? 'Searching…' : 'Find new matches'}
        </Button>
        {data && !loading && !scouting && <span className="text-sm text-muted">{data.count} in your queue</span>}
      </div>

      {scouting && progress && (
        <p role="status" className="mb-6 flex items-center gap-2 text-sm text-muted">
          <Spinner className="size-3.5 text-gold-500" />
          {progress}
        </p>
      )}
      {scoutError && (
        <Card className="mb-6 flex items-center justify-between gap-3 text-sm">
          <span>{scoutError}</span>
          <Button variant="secondary" onClick={scout}>
            Retry
          </Button>
        </Card>
      )}
      {summary && <ScoutSummaryCard s={summary} onClose={() => setSummary(undefined)} />}

      {data?.paused && (
        <Card className="mb-6 border-gold-500/40 bg-gold-100/50 text-sm">
          Scouting is paused during your Jodi Week. Give this one your full attention.
        </Card>
      )}

      {loading && !data && <Loading label="Loading your matches…" />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <Card className="text-center text-sm text-muted">No one in your queue yet. Ask Jodi to find new matches — it takes about half a minute.</Card>
      )}
      {data && (
        <MotionConfig reducedMotion="user">
          <LayoutGroup>
            <ul className="grid grid-cols-1 items-start gap-4 pt-2 md:grid-cols-2">
              {order(data.items).map((item, i) => (
                <motion.li key={item.match_id} layout transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
                  <MatchCard item={item} nextUp={i === 0 && item.status === 'briefed'} />
                </motion.li>
              ))}
            </ul>
          </LayoutGroup>
        </MotionConfig>
      )}
    </section>
  )
}
