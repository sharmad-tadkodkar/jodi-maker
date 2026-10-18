import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import Layout from './components/Layout'
import RequireUser from './components/RequireUser'
import Brief from './pages/Brief'
import Demo from './pages/Demo'
import Focus from './pages/Focus'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Me from './pages/Me'
import Mutual from './pages/Mutual'
import Onboard from './pages/Onboard'
import Pipeline from './pages/Pipeline'
import Start from './pages/Start'
import Transcript from './pages/Transcript'

/** Routes from spec §5. /demo is hidden (not in the nav); /brief shows the next brief in the queue.
 * /login stands alone (no header or tab bar); screens that need a persona sit behind RequireUser. */

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
          <Route path="/" element={<Landing />} />
          <Route path="/start" element={<Start />} />
          <Route path="/demo" element={<Demo />} />
          <Route element={<RequireUser />}>
            <Route path="/onboard" element={<Onboard />} />
            <Route path="/me" element={<Me />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/brief" element={<BriefRoute />} />
            <Route path="/brief/:matchId" element={<BriefRoute />} />
            <Route path="/brief/:matchId/transcript" element={<Transcript />} />
            <Route path="/mutual/:matchId" element={<Mutual />} />
            <Route path="/focus/:matchId" element={<Focus />} />
          </Route>
        </Route>
        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  )
}
