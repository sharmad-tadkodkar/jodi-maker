import { Card, ErrorState, Loading, PageHeader } from '../components/ui'
import { useAsync } from '../lib/useAsync'

/** Phase 0 stand-in: renders the raw response until the real screen is built. */
export default function Placeholder({ title, load }: { title: string; load: () => Promise<unknown> }) {
  const { data, error, loading, reload } = useAsync(load, [title])
  return (
    <section>
      <PageHeader eyebrow="Coming soon" title={title} />
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && (
        <Card>
          <pre className="max-h-[65vh] overflow-auto text-xs text-muted">{JSON.stringify(data, null, 2)}</pre>
        </Card>
      )}
    </section>
  )
}
