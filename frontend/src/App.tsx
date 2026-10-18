import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import Layout from './components/Layout'
import RequireUser from './components/RequireUser'
import { Loading } from './components/ui'
import Landing from './pages/Landing'

// Home is eager (it's the front door and carries the scroll film); every other screen loads on demand so the
// first download stays small. Layout wraps <Outlet /> in Suspense.
const Brief = lazy(() => import('./pages/Brief'))
const Demo = lazy(() => import('./pages/Demo'))
const Focus = lazy(() => import('./pages/Focus'))
const Login = lazy(() => import('./pages/Login'))
const Me = lazy(() => import('./pages/Me'))
const Mutual = lazy(() => import('./pages/Mutual'))
const Onboard = lazy(() => import('./pages/Onboard'))
const Pipeline = lazy(() => import('./pages/Pipeline'))
const Start = lazy(() => import('./pages/Start'))
const Transcript = lazy(() => import('./pages/Transcript'))

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
        <Route
          path="/login"
          element={
            <Suspense fallback={<Loading />}>
              <Login />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
