import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, getUserId, setUserId, waitForJob } from '../api/client'
import { Button, Card, Chip, ErrorState, Loading, PageHeader, SectionTitle } from '../components/ui'
import { STATUS } from '../lib/format'
import { errorMessage, useAsync } from '../lib/useAsync'

/** Hidden route (spec §4.9) — not in the nav. Controls for recording the demo video. */

type LogEntry = { id: number; ok: boolean; text: ReactNode }

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {hint && <p className="-mt-2 mb-3 text-xs text-muted">{hint}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </Card>
  )
}

export default function Demo() {
  const uid = getUserId()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useAsync(async () => {
    const [personas, pipeline, user] = await Promise.all([
      api.personas(),
      api.getPipeline(uid).catch(() => null),
      api.getUser(uid).catch(() => null),
    ])
    return { personas, pipeline, user }
  }, [uid])
  const [matchId, setMatchId] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [log, setLog] = useState<LogEntry[]>([])
  const [confirmReset, setConfirmReset] = useState(false)

  const items = data?.pipeline?.items ?? []
  // Default target: the active Focus Week match, else the top of the pipeline.
  const target = matchId ?? data?.user?.active_match_id ?? items[0]?.match_id
  const targetItem = items.find((i) => i.match_id === target)

  async function act(label: string, fn: () => Promise<ReactNode>) {
    setBusy(label)
    try {
      const text = await fn()
      setLog((l) => [{ id: Date.now(), ok: true, text }, ...l])
    } catch (e) {
      setLog((l) => [{ id: Date.now(), ok: false, text: `${label} failed: ${errorMessage(e)}` }, ...l])
    } finally {
      setBusy(undefined)
    }
  }

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorState error={error ?? 'No data'} onRetry={reload} />

  const needsTarget = !target
  const btn = (label: string, fn: () => Promise<ReactNode>, variant: 'primary' | 'secondary' = 'secondary', disabled = false) => (
    <Button variant={variant} busy={busy === label} disabled={(busy !== undefined && busy !== label) || disabled} onClick={() => act(label, fn)}>
      {label}
    </Button>
  )

  return (
    <section className="space-y-5">
      <PageHeader eyebrow="Demo controls" title="Director's panel">
        Hidden route for recording the video. Actions here change the shared demo data.
      </PageHeader>

      <Card>
        <SectionTitle>Viewing as</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.personas.map((p) => (
            <button
              key={p.user_id}
              type="button"
              onClick={() => {
                setUserId(p.user_id)
                window.location.reload()
              }}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                p.user_id === uid ? 'border-brand-500 bg-brand-50' : 'border-line bg-white hover:bg-sand'
              }`}
            >
              <span className="font-medium">{p.name}</span>
              {p.role === 'parent' && <Chip tone="gold">parent</Chip>}
              <span className="block text-xs text-muted">{p.tagline}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Target match</SectionTitle>
        {items.length === 0 ? (
          <p className="text-sm text-muted">No matches in this persona's pipeline yet — run a scout first.</p>
        ) : (
          <select
            aria-label="Target match"
            value={target}
            onChange={(e) => setMatchId(e.target.value)}
            className="w-full rounded-xl border border-line bg-cream px-3 py-2 text-sm"
          >
            {items.map((i) => (
              <option key={i.match_id} value={i.match_id}>
                {i.candidate.display_name} · {STATUS[i.status].label}
              </option>
            ))}
          </select>
        )}
      </Card>

      <Section title="Matching" hint="Runs for the current persona.">
        {btn(
          'Run scout now',
          async () => {
            const { job_id } = await api.runScout(uid)
            await waitForJob(job_id)
            reload()
            return <>Scout finished. <Link className="underline" to="/pipeline">Open pipeline</Link></>
          },
          'primary',
        )}
        {btn(
          'Run interview',
          async () => {
            const { job_id } = await api.runInterview(target!)
            await waitForJob(job_id)
            return <>Interview done. <Link className="underline" to={`/brief/${target}/transcript`}>Watch transcript</Link></>
          },
          'secondary',
          needsTarget,
        )}
      </Section>

      <Section title="Their response" hint={targetItem ? `Simulate ${targetItem.candidate.display_name} answering the brief.` : undefined}>
        {(['interested', 'pass'] as const).map((d) =>
          btn(
            d === 'interested' ? 'They say yes' : 'They pass',
            async () => {
              const r = await api.simulateResponse(target!, targetItem?.candidate.user_id ?? '', d)
              if (r.mutual) {
                navigate(`/mutual/${target}`)
                return "It's mutual — opening the mutual screen."
              }
              return d === 'pass' ? 'They passed (you will never be told).' : 'Response recorded — not mutual yet.'
            },
            d === 'interested' ? 'primary' : 'secondary',
            needsTarget || !targetItem,
          ),
        )}
      </Section>

      <Section title="Focus Week">
        {[4, 7].map((day) =>
          btn(
            `Jump to Day ${day}`,
            async () => {
              await api.fastForward(target!, day)
              navigate(`/focus/${target}`)
              return `Fast-forwarded to Day ${day}.`
            },
            'secondary',
            needsTarget,
          ),
        )}
      </Section>

      <Section title="World" hint="Someone new joins, or start the whole demo over.">
        {btn('Add a new profile', async () => {
          const c = await api.newProfile()
          return `${c.display_name} just joined (${[c.age, c.city, c.profession].filter(Boolean).join(' · ')}).`
        })}
        {confirmReset ? (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            Wipes and reseeds data for everyone.
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button>
            {btn('Yes, reset demo', async () => {
              await api.reset()
              setConfirmReset(false)
              setMatchId(undefined)
              reload()
              return 'Demo reset — fresh seeded world.'
            }, 'primary')}
          </span>
        ) : (
          <Button variant="secondary" className="text-brand-700" disabled={busy !== undefined} onClick={() => setConfirmReset(true)}>
            Reset demo…
          </Button>
        )}
      </Section>

      {log.length > 0 && (
        <Card>
          <SectionTitle>Activity</SectionTitle>
          <ul className="space-y-1.5 text-sm">
            {log.map((e) => (
              <li key={e.id} className={e.ok ? '' : 'text-brand-700'}>
                {e.ok ? '✓' : '✗'} {e.text}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}
