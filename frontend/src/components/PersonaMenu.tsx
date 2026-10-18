import { Check, ChevronDown, UserPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getMyPeople, getUserId, setUserId, type Persona } from '../api/client'
import { avatarFor, useViewerGenders } from '../lib/avatars'
import { Avatar, Icon } from './ui'

// Persona IDs are stable (FRONTEND_GUIDE); used if /demo/personas is unreachable (e.g. local backend without GCP).
const FALLBACK_PERSONAS: Persona[] = [
  { user_id: 'arjun', name: 'Arjun Mehta', role: 'candidate', tagline: '' },
  { user_id: 'meera', name: 'Meera Sen', role: 'candidate', tagline: '' },
]

type Option = { user_id: string; name: string; tagline?: string }

/** Avatar pill + dropdown. Lists the two heroes and people created in *this* browser. /demo/personas also
 * lists every visitor's new user; those stay on the director's panel so judges never see each other's profiles. */
export default function PersonaMenu() {
  const [heroes, setHeroes] = useState<Persona[]>(FALLBACK_PERSONAS)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const current = getUserId()
  const { me: myGender } = useViewerGenders()
  const portrait = (id: string) => avatarFor(id, id === current ? myGender : undefined)

  useEffect(() => {
    api
      .personas()
      .then((ps) => setHeroes(ps.filter((p) => FALLBACK_PERSONAS.some((h) => h.user_id === p.user_id))))
      .catch(() => setHeroes(FALLBACK_PERSONAS))
  }, [])

  // Close on outside click / Escape; focus the first item when opening.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    root.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const mine: Option[] = getMyPeople()
  const all: Option[] = [...heroes, ...mine]
  const me = all.find((p) => p.user_id === current) ?? { user_id: current, name: current }

  function choose(id: string) {
    setOpen(false)
    if (id === current) return
    setUserId(id)
    window.location.reload()
  }

  const item = (p: Option, suffix = '') => (
    <button
      key={p.user_id}
      type="button"
      role="menuitemradio"
      aria-checked={p.user_id === current}
      onClick={() => choose(p.user_id)}
      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-sand focus:bg-sand focus:outline-none"
    >
      <Avatar name={p.name} src={portrait(p.user_id)} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">
          {p.name}
          {suffix}
        </span>
        {p.tagline && <span className="block truncate text-xs text-muted">{p.tagline}</span>}
      </span>
      {p.user_id === current && <Icon icon={Check} className="text-brand-600" />}
    </button>
  )

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Viewing as ${me.name}. Switch persona`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pr-3 pl-1 text-sm text-ink shadow-card hover:bg-sand"
      >
        <Avatar name={me.name} src={portrait(me.user_id)} size="sm" />
        <span className="max-w-32 truncate font-medium">{me.name.split(' ')[0]}</span>
        <Icon icon={ChevronDown} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch persona"
          className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-1 rounded-2xl border border-line bg-white p-2 shadow-lg animate-[fadeUp_.15s_ease-out]"
        >
          <p className="px-2.5 pt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-gold-700">The demo story</p>
          {heroes.map((p) => item(p))}
          <div className="my-1 border-t border-line" />
          <p className="px-2.5 pt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-gold-700">You</p>
          {mine.map((p) => item(p, ' (you)'))}
          {!all.some((p) => p.user_id === current) && item(me)}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              navigate('/start')
            }}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-brand-600 hover:bg-brand-50 focus:bg-brand-50 focus:outline-none"
          >
            <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-brand-200">
              <Icon icon={UserPlus} />
            </span>
            Try it as yourself…
          </button>
        </div>
      )}
    </div>
  )
}
