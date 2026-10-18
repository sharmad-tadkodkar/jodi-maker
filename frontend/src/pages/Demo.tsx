import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, getUserId, setUserId, waitForJob, type DemoState } from '../api/client'
import { Button, Card, Chip, ErrorState, Loading, PageHeader, SectionTitle } from '../components/ui'
import { firstName, STATUS } from '../lib/format'
import { rawError, useAsync } from '../lib/useAsync'

/** Hidden route (spec §4.9, FRONTEND_GUIDE Phase 6) — not in the nav. Controls for recording the demo video. */

type LogEntry = { id: number; ok: boolean; text: ReactNode }

const USER_STATUS: Record<string, string> = {
  onboarding: 'Onboarding',
  active: 'Searching',
  in_focus: 'In Jodi Week',
  locked: 'Moving forward',
  paused: 'Paused',
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {hint && <p className="-mt-2 mb-3 text-xs text-muted">{hint}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </Card>
  )
}

/** One-glance status, refreshed every 3 s. */
function StatusStrip() {
  const [state, setState] = useState<DemoState>()
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const s = await api.demoState()
        if (live) setState(s)
      } catch {
        /* keep the last good state */
      }
      if (live) timer = setTimeout(poll, 3000)
    }
    poll()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [])
  if (!state) return null
  return (
    <Card className="space-y-3 bg-sand/50">
      <div className="grid gap-2 sm:grid-cols-2">
        {state.heroes.map((h) => (
          <div key={h.user_id} className="rounded-xl bg-white px-3 py-2 text-xs">
            <p className="text-sm font-medium">{h.name}</p>
            <p className="text-muted">
              {USER_STATUS[h.status] ?? h.status}
              {h.focus_day != null && ` · Day ${h.focus_day}`} · {h.queue_size} in queue
              {h.next_brief_match_id && ' · brief waiting'}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        Hero match: {state.hero_match_status ? STATUS[state.hero_match_status].label : '—'} · {state.profiles} profiles ·{' '}
        {state.reserves_left} new joiners left
      </p>
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
  const [progress, setProgress] = useState<string>()
  const [log, setLog] = useState<LogEntry[]>([])
  const [confirm, setConfirm] = useState<'soft' | 'full'>()

  const items = data?.pipeline?.items ?? []
  // Default target: the active Jodi Week match, else the top of the pipeline.
  const target = matchId ?? data?.user?.active_match_id ?? items[0]?.match_id
  const targetItem = items.find((i) => i.match_id === target)
  const them = targetItem ? firstName(targetItem.candidate.display_name) : 'They'

  async function act(label: string, fn: () => Promise<ReactNode>) {
    setBusy(label)
    try {
      const text = await fn()
      setLog((l) => [{ id: Date.now(), ok: true, text }, ...l])
    } catch (e) {
      setLog((l) => [{ id: Date.now(), ok: false, text: `${label}: ${rawError(e)}` }, ...l])
    } finally {
      setBusy(undefined)
      setProgress(undefined)
    }
  }

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorState error={error ?? 'Your matchmaker hit a snag — please try again.'} onRetry={reload} />

  const btn = (label: string, fn: () => Promise<ReactNode>, variant: 'primary' | 'secondary' = 'secondary', disabled = false) => (
    <Button
      key={label}
      variant={variant}
      busy={busy === label}
      disabled={(busy !== undefined && busy !== label) || disabled}
      onClick={() => act(label, fn)}
    >
      {label}
    </Button>
  )

  const reset = async (soft: boolean) => {
    await api.reset(soft)
    setConfirm(undefined)
    setMatchId(undefined)
    reload()
    return soft ? 'Soft reset — matches and heroes back to their starting state.' : 'Full reset — fresh seeded world.'
  }

  return (
    <section className="space-y-5">
      <PageHeader eyebrow="Demo controls" title="Director's panel">
        Hidden route for recording the video. Actions here change the shared demo data.
      </PageHeader>

      <StatusStrip />

      {/* Cards flow into columns on wide screens instead of one narrow stack */}
      <div className="grid items-start gap-5 lg:grid-cols-2 2xl:grid-cols-3">
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
          <Link to="/start" className="mt-3 inline-block text-sm text-brand-600 underline">
            + Try it as a new person (fresh intake chat)
          </Link>
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

        <Section title="Matching" hint="Runs for the current persona. A live interview takes about 2 minutes.">
          {btn(
            'Run scout now',
            async () => {
              setProgress('Starting…')
              const { job_id } = await api.runScout(uid)
              await waitForJob(job_id, (j) => j.progress && setProgress(j.progress))
              reload()
              return (
                <>
                  Scout finished.{' '}
                  <Link className="underline" to="/pipeline">
                    Open pipeline
                  </Link>
                </>
              )
            },
            'primary',
          )}
          {btn('Interview top candidate', async () => {
            const r = await api.interviewTop(uid)
            navigate(`/brief/${r.match_id}/transcript`)
            return `Interviewing ${r.candidate.display_name} live.`
          })}
          {btn(
            'Replay target interview live',
            async () => {
              await api.rerunInterview(target!)
              navigate(`/brief/${target}/transcript`)
              return 'Re-running the interview live.'
            },
            'secondary',
            !target,
          )}
          {busy === 'Run scout now' && progress && <p className="basis-full text-xs text-muted">{progress}</p>}
        </Section>

        <Section
          title="Their response"
          hint={targetItem ? `${targetItem.candidate.display_name} answers their brief (after you said Interested).` : undefined}
        >
          {(['interested', 'pass'] as const).map((d) =>
            btn(
              `${them} says ${d === 'interested' ? 'Interested' : 'Pass'}`,
              async () => {
                const r = await api.simulateResponse(target!, targetItem!.candidate.user_id, d)
                if (r.mutual) {
                  navigate(`/mutual/${target}`)
                  return "It's mutual — opening the mutual screen."
                }
                return d === 'pass' ? `${them} passed (the app never tells you).` : 'Response recorded — not mutual yet.'
              },
              d === 'interested' ? 'primary' : 'secondary',
              !targetItem,
            ),
          )}
        </Section>

        <Section title="Jodi Week" hint="Fast-forward the target match. “Time runs out” shows the week auto-closing.">
          {[
            { label: 'Jump to Day 4', day: () => Promise.resolve(4) },
            { label: 'Jump to Day 7', day: () => Promise.resolve(7) },
            // One past the end — total_days is 14 if the week was extended.
            {
              label: 'Time runs out',
              day: async () => (await api.getFocus(target!)).total_days + 1,
            },
          ].map(({ label, day }) =>
            btn(
              label,
              async () => {
                const s = await api.fastForward(target!, await day())
                navigate(`/focus/${target}`)
                return s.status === 'closed' ? 'Time ran out — the Jodi Week closed.' : `Now on Day ${s.day} of ${s.total_days}.`
              },
              'secondary',
              !target,
            ),
          )}
        </Section>

        <Section title="World" hint="Someone new joins (then run scout to see the “New” badge), or reset between takes.">
          {btn('Someone just joined', async () => {
            const c = await api.newProfile()
            return `${c.display_name} just joined (${[c.age, c.city, c.profession].filter(Boolean).join(' · ')}).`
          })}
          {confirm ? (
            <span className="flex basis-full flex-wrap items-center gap-2 text-sm">
              {confirm === 'soft' ? 'Restore matches and heroes for everyone?' : 'Wipe and reseed everything (~20 s) for everyone?'}
              <Button variant="ghost" onClick={() => setConfirm(undefined)}>
                Cancel
              </Button>
              {btn(confirm === 'soft' ? 'Yes, soft reset' : 'Yes, full reset', () => reset(confirm === 'soft'), 'primary')}
            </span>
          ) : (
            <>
              <Button variant="secondary" disabled={busy !== undefined} onClick={() => setConfirm('soft')}>
                Soft reset (~2 s)
              </Button>
              <Button variant="secondary" className="text-brand-700" disabled={busy !== undefined} onClick={() => setConfirm('full')}>
                Full reset…
              </Button>
            </>
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
      </div>
    </section>
  )
}
