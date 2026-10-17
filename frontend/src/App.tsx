import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useParams } from 'react-router-dom'
import { api, getUserId, setUserId, type Persona } from './api/client'

/**
 * Phase 0 shell: every route from spec §5, each wired to its real endpoint.
 * Placeholder pages render the raw response so we can see the contract working;
 * each gets replaced by its real screen in later phases.
 */

function JsonPage({ title, load }: { title: string; load: () => Promise<unknown> }) {
  const [data, setData] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    load().then(setData).catch((e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title])
  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold text-stone-800">{title}</h1>
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!error && !data && <p className="text-stone-500">Loading…</p>}
      {data !== null && (
        <pre className="max-h-[70vh] overflow-auto rounded-lg bg-white p-4 text-xs text-stone-700 shadow-sm">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </section>
  )
}

function PersonaSwitcher() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [current, setCurrent] = useState(getUserId())
  useEffect(() => {
    api.personas().then(setPersonas).catch(() => setPersonas([]))
  }, [])
  return (
    <select
      className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
      value={current}
      onChange={(e) => {
        setUserId(e.target.value)
        setCurrent(e.target.value)
        window.location.reload()
      }}
    >
      {personas.map((p) => (
        <option key={p.user_id} value={p.user_id}>
          {p.name}
        </option>
      ))}
    </select>
  )
}

const NAV = [
  ['/', 'Home'],
  ['/onboard', 'Onboard'],
  ['/me', 'Me'],
  ['/pipeline', 'Pipeline'],
  ['/brief/m_arjun_meera', 'Brief'],
  ['/brief/m_arjun_meera/transcript', 'Transcript'],
  ['/mutual/m_arjun_meera', 'Mutual'],
  ['/focus/m_arjun_meera', 'Focus'],
  ['/demo', 'Demo'],
]

const uid = getUserId

function Brief() {
  const { matchId = '' } = useParams()
  return <JsonPage title="Match Brief" load={() => api.getBrief(matchId, uid())} />
}
function Transcript() {
  const { matchId = '' } = useParams()
  return <JsonPage title="Interview transcript" load={() => api.getInterview(matchId)} />
}
function Mutual() {
  const { matchId = '' } = useParams()
  return <JsonPage title="It's mutual 💛" load={() => api.getFocus(matchId)} />
}
function Focus() {
  const { matchId = '' } = useParams()
  return (
    <JsonPage
      title="Focus Week"
      load={async () => ({ state: await api.getFocus(matchId), chat: await api.getChat(matchId) })}
    />
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-stone-50">
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
            <Link to="/" className="text-lg font-semibold text-rose-700">Jodi</Link>
            <nav className="flex flex-wrap gap-2 text-sm text-stone-600">
              {NAV.map(([to, label]) => (
                <Link key={to} to={to} className="hover:text-rose-700">{label}</Link>
              ))}
            </nav>
            <div className="ml-auto"><PersonaSwitcher /></div>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">
          <Routes>
            <Route path="/" element={<JsonPage title="Jodi — health check" load={() => fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:8080'}/health`).then((r) => r.json())} />} />
            <Route path="/onboard" element={<JsonPage title="Intake chat" load={() => api.getIntakeMessages(uid())} />} />
            <Route path="/me" element={<JsonPage title="What my matchmaker knows" load={async () => ({ user: await api.getUser(uid()), aspects: await api.getAspects(uid()), learning: await api.getLearning(uid()) })} />} />
            <Route path="/pipeline" element={<JsonPage title="Your pipeline" load={() => api.getPipeline(uid())} />} />
            <Route path="/brief/:matchId" element={<Brief />} />
            <Route path="/brief/:matchId/transcript" element={<Transcript />} />
            <Route path="/mutual/:matchId" element={<Mutual />} />
            <Route path="/focus/:matchId" element={<Focus />} />
            <Route path="/demo" element={<JsonPage title="Demo panel" load={() => api.personas()} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
