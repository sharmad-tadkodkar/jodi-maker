import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getUserId, type Aspect, type LearningEntry, type User } from '../api/client'
import AspectItem from '../components/AspectItem'
import HardCriteriaForm from '../components/HardCriteriaForm'
import { Avatar, Button, Card, ErrorState, Icon, Loading, PageHeader, ScoreRing, SectionTitle } from '../components/ui'
import { avatarFor } from '../lib/avatars'
import { ASPECT_ICON, VISIBILITY_ICON } from '../lib/icons'
import { ASPECT_LABEL, DIMENSION_LABEL, DIMENSIONS, VISIBILITY } from '../lib/format'
import { errorMessage, useAsync } from '../lib/useAsync'

const CATEGORY_ORDER = Object.keys(ASPECT_LABEL) as Aspect['category'][]

function Weights({ weights }: { weights: User['preference_weights'] }) {
  const values = DIMENSIONS.map((d) => ({ d, w: weights?.[d] ?? 0 }))
  const max = Math.max(...values.map((v) => v.w), 0.01)
  return (
    <div className="space-y-2">
      {values.map(({ d, w }) => (
        <div key={d} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-muted">{DIMENSION_LABEL[d]}</span>
          <div className="h-1.5 flex-1 rounded-full bg-sand">
            <div className="h-full rounded-full bg-gold-500" style={{ width: `${(w / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right tabular-nums">{Math.round(w * 100)}%</span>
        </div>
      ))}
    </div>
  )
}

function LearningHistory({ entries }: { entries: LearningEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted">Nothing yet. Each time you pass or decide after a Jodi Week, I'll note what I learned here.</p>
  }
  return (
    <ol className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="border-l-2 border-gold-500/50 pl-3">
          <p className="text-sm">{e.explanation}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            After a {e.decision}
            {e.reason && ` · ${e.reason.replace(/^other: /, '').replaceAll('_', ' ')}`}
            {e.created_at && ` · ${new Date(e.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
          </p>
        </li>
      ))}
    </ol>
  )
}

function WipeData({ count, onWipe }: { count: number; onWipe: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <Card className="space-y-3 border-brand-200">
      <p className="font-display text-lg">Delete everything my matchmaker knows</p>
      <p className="text-sm text-muted">Removes all {count} things Jodi has learned about you and the profile used for matching. You'll start fresh.</p>
      {confirm ? (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>
            Keep my data
          </Button>
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true)
              setError(undefined)
              try {
                await onWipe()
                setConfirm(false)
              } catch (e) {
                setError(errorMessage(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            Yes, delete everything
          </Button>
        </div>
      ) : (
        <Button variant="secondary" className="text-brand-700" onClick={() => setConfirm(true)}>
          Delete my data…
        </Button>
      )}
      {error && <p className="text-xs text-brand-700">{error}</p>}
    </Card>
  )
}

export default function Me() {
  const uid = getUserId()
  const { data, error, loading, reload, setData } = useAsync(async () => {
    const [user, aspects, learning] = await Promise.all([
      api.getUser(uid),
      api.getAspects(uid),
      api.getLearning(uid).catch(() => [] as LearningEntry[]),
    ])
    return { user, aspects, learning }
  }, [uid])

  if (loading && !data) return <Loading label="Gathering what Jodi knows…" />
  if (error || !data) return <ErrorState error={error ?? 'Your matchmaker hit a snag — please try again.'} onRetry={reload} />

  const { user, aspects, learning } = data
  const f = user.self_facts
  const facts = [f?.age, f?.city, f?.profession].filter(Boolean).join(' · ')
  const grouped = CATEGORY_ORDER.map((c) => ({ c, items: aspects.filter((a) => a.category === c) })).filter((g) => g.items.length)

  const replaceAspect = (a: Aspect) => setData((d) => d && { ...d, aspects: d.aspects.map((x) => (x.id === a.id ? a : x)) })
  const removeAspect = (id: string) => setData((d) => d && { ...d, aspects: d.aspects.filter((x) => x.id !== id) })

  return (
    <section className="space-y-8">
      <PageHeader eyebrow="What my matchmaker knows" title="Everything Jodi knows about you">
        Each note shows where it came from. You decide who sees what — change it, or ask Jodi to forget it.
      </PageHeader>

      <Card className="flex items-center gap-4">
        <Avatar name={user.name} src={avatarFor(user.id, user.gender, user.photo_url)} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl">{user.name}</p>
          <p className="truncate text-sm text-muted">{facts}</p>
          {f?.languages && f.languages.length > 0 && <p className="text-xs text-muted">Speaks {f.languages.join(', ')}</p>}
        </div>
        <ScoreRing value={Math.round((user.intake_completeness ?? 0) * 100)} size={72} label="known" tone="gold" />
      </Card>

      <div>
        <SectionTitle>Who sees what</SectionTitle>
        <ul className="grid gap-2 text-xs sm:grid-cols-3">
          {VISIBILITY.map((v) => (
            <li key={v.value} className="flex gap-2.5 rounded-xl bg-sand/60 px-3 py-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-card">
                <Icon icon={VISIBILITY_ICON[v.value]} size="sm" />
              </span>
              <span>
                <span className="font-medium">{v.label}</span>
                <span className="block text-muted">{v.hint}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {grouped.length === 0 ? (
        <Card className="space-y-2 text-center">
          <p className="font-display text-lg">Jodi doesn't know you yet</p>
          <Link to="/onboard" className="text-sm font-medium text-brand-600 hover:underline">
            Start a conversation →
          </Link>
        </Card>
      ) : (
        grouped.map(({ c, items }) => (
          <Card key={c}>
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                <Icon icon={ASPECT_ICON[c]} size="sm" />
              </span>
              <h2 className="font-display text-xl text-ink">{ASPECT_LABEL[c]}</h2>
              <span className="ml-auto text-xs text-muted">{items.length === 1 ? '1 note' : `${items.length} notes`}</span>
            </div>
            <ul className="divide-y divide-line">
              {items.map((a) => (
                <AspectItem
                  key={a.id}
                  aspect={a}
                  onPatch={async (patch) => replaceAspect(await api.patchAspect(uid, a.id, patch))}
                  onDelete={async () => {
                    await api.deleteAspect(uid, a.id)
                    removeAspect(a.id)
                  }}
                />
              ))}
            </ul>
          </Card>
        ))
      )}

      <Card>
        <SectionTitle>Your must-haves</SectionTitle>
        <p className="mb-4 text-sm text-muted">Jodi only considers people who meet these.</p>
        <HardCriteriaForm
          value={user.hard_criteria}
          onSave={async (patch) => {
            const u = await api.patchHardCriteria(uid, patch)
            setData((d) => d && { ...d, user: { ...d.user, hard_criteria: u.hard_criteria } })
          }}
        />
      </Card>

      <Card>
        <SectionTitle>What matters most to you</SectionTitle>
        <p className="mb-4 text-sm text-muted">How Jodi weighs each part of a match. It shifts as I learn from your decisions.</p>
        <Weights weights={user.preference_weights} />
      </Card>

      <Card>
        <SectionTitle>What I've learned from your decisions</SectionTitle>
        <LearningHistory entries={learning} />
      </Card>

      <WipeData
        count={aspects.length}
        onWipe={async () => {
          await api.wipeData(uid)
          reload()
        }}
      />
    </section>
  )
}
