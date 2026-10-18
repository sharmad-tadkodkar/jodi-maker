import { FileText, Home, MessageCircle, User, Users, type LucideIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import PersonaMenu from './PersonaMenu'
import { Icon } from './ui'

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/onboard', label: 'Chat', icon: MessageCircle },
  { to: '/pipeline', label: 'Matches', icon: Users },
  { to: '/brief', label: 'Brief', icon: FileText },
  { to: '/me', label: 'Me', icon: User },
]

/** Screens laid out for wide viewports (multi-column at lg). Everything else keeps the reading column. */
const WIDE = /^\/($|onboard|pipeline|brief)/

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
  const { pathname } = useLocation()
  const wide = WIDE.test(pathname)
  return (
    <div className="min-h-dvh">
      <ScrollToTop />
      <header className="sticky top-0 z-20 border-b border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4 lg:px-8">
          <Link to="/" className="font-display text-2xl text-brand-600">
            Jodi
          </Link>
          {/* Desktop / tablet nav — the tab bar takes over below md */}
          <nav aria-label="Main" className="hidden items-center gap-1 text-sm font-medium md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-full px-3.5 py-1.5 transition-colors ${isActive ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-sand hover:text-ink'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto">
            <PersonaMenu />
          </div>
        </div>
      </header>

      {/* pb clears the mobile tab bar; sticky bottom bars in pages use bottom-16 md:bottom-4 to match */}
      <main className={`mx-auto px-4 pt-6 pb-28 md:pb-12 lg:px-8 ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}>
        <Outlet />
      </main>

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-5 text-center text-[11px] font-medium">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 ${isActive ? 'text-brand-600' : 'text-muted'}`}
            >
              <Icon icon={n.icon} size="md" />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
