import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import { api, API_URL, getUserId } from './api/client'
import Layout from './components/Layout'
import Brief from './pages/Brief'
import Pipeline from './pages/Pipeline'
import Placeholder from './pages/Placeholder'

/**
 * Routes from spec §5. Pipeline and Brief are real screens; the rest are Placeholder pages that
 * render the raw response until their screen is built.
 */

const uid = getUserId

// Keyed by matchId so each brief starts with fresh decision state.
function BriefRoute() {
  const { matchId } = useParams()
  return <Brief key={matchId ?? 'next'} />
}
function Transcript() {
  const { matchId = '' } = useParams()
  return <Placeholder title="Interview transcript" load={() => api.getInterview(matchId)} />
}
function Mutual() {
  const { matchId = '' } = useParams()
  return <Placeholder title="It's mutual 💛" load={() => api.getFocus(matchId)} />
}
function Focus() {
  const { matchId = '' } = useParams()
  return (
    <Placeholder
      title="Focus Week"
      load={async () => ({ state: await api.getFocus(matchId), chat: await api.getChat(matchId) })}
    />
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Placeholder title="Jodi — health check" load={() => fetch(`${API_URL}/health`).then((r) => r.json())} />} />
          <Route path="/onboard" element={<Placeholder title="Intake chat" load={() => api.getIntakeMessages(uid())} />} />
          <Route path="/me" element={<Placeholder title="What my matchmaker knows" load={async () => ({ user: await api.getUser(uid()), aspects: await api.getAspects(uid()), learning: await api.getLearning(uid()) })} />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/brief" element={<BriefRoute />} />
          <Route path="/brief/:matchId" element={<BriefRoute />} />
          <Route path="/brief/:matchId/transcript" element={<Transcript />} />
          <Route path="/mutual/:matchId" element={<Mutual />} />
          <Route path="/focus/:matchId" element={<Focus />} />
          <Route path="/demo" element={<Placeholder title="Demo panel" load={() => api.personas()} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
