import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import { API_URL } from './api/client'
import Layout from './components/Layout'
import Brief from './pages/Brief'
import Demo from './pages/Demo'
import Focus from './pages/Focus'
import Me from './pages/Me'
import Mutual from './pages/Mutual'
import Onboard from './pages/Onboard'
import Pipeline from './pages/Pipeline'
import Placeholder from './pages/Placeholder'
import Transcript from './pages/Transcript'

/**
 * Routes from spec §5. Onboard, Me, Pipeline, Brief, Transcript, Mutual, Focus and Demo are real screens; the rest are Placeholder pages that
 * render the raw response until their screen is built.
 */

// Keyed by matchId so each brief starts with fresh decision state.
function BriefRoute() {
  const { matchId } = useParams()
  return <Brief key={matchId ?? 'next'} />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Placeholder title="Jodi — health check" load={() => fetch(`${API_URL}/health`).then((r) => r.json())} />} />
          <Route path="/onboard" element={<Onboard />} />
          <Route path="/me" element={<Me />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/brief" element={<BriefRoute />} />
          <Route path="/brief/:matchId" element={<BriefRoute />} />
          <Route path="/brief/:matchId/transcript" element={<Transcript />} />
          <Route path="/mutual/:matchId" element={<Mutual />} />
          <Route path="/focus/:matchId" element={<Focus />} />
          <Route path="/demo" element={<Demo />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
