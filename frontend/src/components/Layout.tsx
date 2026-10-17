import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { api, getUserId, setUserId, type Persona } from '../api/client'

// Persona IDs are stable (FRONTEND_GUIDE); used if /demo/personas is unreachable (e.g. local backend without GCP).
const FALLBACK_PERSONAS: Persona[] = [
  { user_id: 'arjun', name: 'Arjun Mehta', role: 'candidate', tagline: '' },
  { user_id: 'meera', name: 'Meera Sen', role: 'candidate', tagline: '' },
]

function PersonaSwitcher() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const current = getUserId()
  useEffect(() => {
    api.personas().then(setPersonas).catch(() => setPersonas(FALLBACK_PERSONAS))
  }, [])
  const options = personas.some((p) => p.user_id === current)
    ? personas
    : [...personas, { user_id: current, name: current, role: 'candidate' as const, tagline: '' }]
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="hidden sm:inline">Viewing as</span>
      <select
        aria-label="Switch persona"
        className="rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink"
        value={current}
        onChange={(e) => {
          setUserId(e.target.value)
          window.location.reload()
        }}
      >
        {options.map((p) => (
          <option key={p.user_id} value={p.user_id}>
            {p.name}
          </option>
        ))}
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

export default function Layout() {
  return (
    <div className="min-h-dvh">
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
