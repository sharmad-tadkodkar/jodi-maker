import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, getMyPeople, getUserId, setUserId, type Persona } from '../api/client'

// Persona IDs are stable (FRONTEND_GUIDE); used if /demo/personas is unreachable (e.g. local backend without GCP).
const FALLBACK_PERSONAS: Persona[] = [
  { user_id: 'arjun', name: 'Arjun Mehta', role: 'candidate', tagline: '' },
  { user_id: 'meera', name: 'Meera Sen', role: 'candidate', tagline: '' },
]

const NEW_PERSON = '__new__'

/** The two heroes + people created in *this* browser. /demo/personas also lists every visitor's new user;
 * those stay on the director's panel so judges never see each other's profiles here. */
function PersonaSwitcher() {
  const [heroes, setHeroes] = useState<Persona[]>(FALLBACK_PERSONAS)
  const current = getUserId()
  const navigate = useNavigate()
  useEffect(() => {
    api
      .personas()
      .then((ps) => setHeroes(ps.filter((p) => FALLBACK_PERSONAS.some((h) => h.user_id === p.user_id))))
      .catch(() => setHeroes(FALLBACK_PERSONAS))
  }, [])
  const mine = getMyPeople()
  const known = [...heroes, ...mine].some((p) => p.user_id === current)
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="hidden sm:inline">Viewing as</span>
      <select
        aria-label="Switch persona"
        className="max-w-44 rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink"
        value={current}
        onChange={(e) => {
          if (e.target.value === NEW_PERSON) return navigate('/start')
          setUserId(e.target.value)
          window.location.reload()
        }}
      >
        <optgroup label="The demo story">
          {heroes.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="You">
          {mine.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.name} (you)
            </option>
          ))}
          {!known && <option value={current}>{current}</option>}
          <option value={NEW_PERSON}>+ Try it as yourself…</option>
        </optgroup>
      </select>
    </label>
  )
}

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/onboard', label: 'Chat' },
  { to: '/pipeline', label: 'Matches' },
  { to: '/brief', label: 'Brief' },
  { to: '/me', label: 'Me' },
]

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'text-brand-600' : 'text-muted hover:text-ink'
}

/** Start every page at the top — otherwise e.g. "Jump to Day 7" on /demo lands mid-page on /focus,
 * with the "Time to decide" card scrolled out of view. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

export default function Layout() {
  return (
    <div className="min-h-dvh">
      <ScrollToTop />
      <header className="sticky top-0 z-20 border-b border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-6 px-4 py-3">
          <Link to="/" className="font-display text-2xl text-brand-600">
            Jodi
          </Link>
          <nav className="hidden gap-5 text-sm font-medium sm:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={navClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto">
            <PersonaSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6 pb-28 sm:pb-12">
        <Outlet />
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-2xl grid-cols-5 text-center text-xs font-medium">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={(s) => `py-3.5 ${navClass(s)}`}>
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
