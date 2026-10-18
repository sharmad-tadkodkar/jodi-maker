import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isSignedIn } from '../api/client'

/** Gate for screens that need a persona: sends visitors to /login and remembers where they were going. */
export default function RequireUser() {
  const location = useLocation()
  if (!isSignedIn()) {
    const from = location.pathname + location.search + location.hash
    return <Navigate to={`/login?next=${encodeURIComponent(from)}`} replace />
  }
  return <Outlet />
}
