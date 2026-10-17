import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getUserId, waitForJob, type PipelineItem } from '../api/client'
import { Avatar, Button, Card, Chip, ErrorState, Loading, PageHeader, ScoreBar, VerifiedBadge } from '../components/ui'
import { DIMENSION_LABEL, DIMENSIONS, HAS_BRIEF, pct, STATUS } from '../lib/format'
import { errorMessage, useAsync } from '../lib/useAsync'

function MatchCard({ item }: { item: PipelineItem }) {
  const { candidate: c, scores, status } = item
  const s = STATUS[status]
  const openable = HAS_BRIEF.includes(status)
  const facts = [c.age, c.city, c.profession].filter(Boolean).join(' · ')

  const body = (
    <Card className={openable ? 'transition-shadow group-hover:shadow-md' : 'opacity-80'}>
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

      <div className="mt-4 flex items-center justify-between">
        <Chip tone={s.tone}>{s.label}</Chip>
        {openable ? (
          <span className="text-sm font-medium text-brand-600">Read brief →</span>
        ) : (
          <span className="text-xs text-muted">Brief after the matchmakers talk</span>
        )}
      </div>
    </Card>
  )

  return openable ? (
    <Link to={`/brief/${item.match_id}`} className="group block" aria-label={`Open brief for ${c.display_name}`}>
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
  const [scoutError, setScoutError] = useState<string>()

  async function scout() {
    setScouting(true)
    setScoutError(undefined)
    setProgress('Jodi is looking…')
    try {
      const { job_id } = await api.runScout(uid)
      await waitForJob(job_id, (j) => j.progress && setProgress(j.progress))
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

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button onClick={scout} busy={scouting} disabled={data?.paused}>
          {scouting ? progress : 'Find new matches'}
        </Button>
        {data && !loading && <span className="text-sm text-muted">{data.count} in your queue</span>}
      </div>
      {scoutError && <p className="mb-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-700">Scouting failed: {scoutError}</p>}

      {data?.paused && (
        <Card className="mb-6 border-gold-500/40 bg-gold-100/50 text-sm">
          Your search is paused while you're in a Focus Week. Give this one your full attention.
        </Card>
      )}

      {loading && !data && <Loading label="Loading your matches…" />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <Card className="text-center text-sm text-muted">No one in your queue yet. Ask Jodi to find new matches.</Card>
      )}
      {data && (
        <ul className="space-y-4">
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
