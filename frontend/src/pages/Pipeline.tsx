import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getUserId, waitForJob, type Job, type PipelineItem } from '../api/client'
import { Avatar, Button, Card, Chip, ErrorState, Loading, PageHeader, ScoreBar, Spinner, VerifiedBadge } from '../components/ui'
import { DIMENSION_LABEL, DIMENSIONS, HAS_BRIEF, pct, STATUS } from '../lib/format'
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

function MatchCard({ item }: { item: PipelineItem }) {
  const { candidate: c, scores, status } = item
  const s = STATUS[status]
  const facts = [c.age, c.city, c.profession].filter(Boolean).join(' · ')
  // Brief ready → open it. Not yet interviewed → the matchmakers' conversation, which leads to the brief.
  const to = HAS_BRIEF.includes(status)
    ? { href: `/brief/${item.match_id}`, label: 'Read brief →' }
    : status === 'queued' || status === 'screening'
      ? { href: `/brief/${item.match_id}/transcript`, label: status === 'queued' ? 'Let the matchmakers talk →' : 'Listen in →' }
      : null

  const body = (
    <Card className={`flex h-full flex-col ${to ? 'transition-shadow group-hover:shadow-md' : 'opacity-70'}`}>
      <div className="flex items-start gap-4">
        <Avatar name={c.display_name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg leading-tight">{c.display_name}</h3>
            {c.verified && <VerifiedBadge />}
            {c.is_new && <Chip tone="gold">New</Chip>}
          </div>
          <p className="truncate text-sm text-muted">{facts}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl leading-none text-brand-600">{pct(scores.overall)}%</p>
          <p className="mt-1 text-[11px] text-muted">fit</p>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {DIMENSIONS.map((d) => (
          <ScoreBar key={d} label={DIMENSION_LABEL[d]} value={pct(scores[d])} title={scores.reasons?.[d]} />
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between pt-4">
        <Chip tone={s.tone}>{s.label}</Chip>
        {to && <span className="text-sm font-medium text-brand-600">{to.label}</span>}
      </div>
    </Card>
  )

  return to ? (
    <Link to={to.href} className="group block h-full" aria-label={`${c.display_name}: ${to.label.replace(' →', '')}`}>
      {body}
    </Link>
  ) : (
    body
  )
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
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.items.map((item) => (
            <li key={item.match_id}>
              <MatchCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
