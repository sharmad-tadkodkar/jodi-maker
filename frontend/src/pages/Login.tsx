import { ArrowRight, ShieldCheck, UserPlus } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, setUserId, type Persona, type User } from '../api/client'
import { Avatar, Chip, Icon } from '../components/ui'
import { avatarFor } from '../lib/avatars'

const ILLUSTRATIONS = `${import.meta.env.BASE_URL}illustrations/`

// Stable persona IDs (FRONTEND_GUIDE). Facts are shown straight away and refreshed from /users/{id}.
const HEROES = [
  { user_id: 'arjun', name: 'Arjun Mehta', facts: '28 · Kolkata · Software Engineer' },
  { user_id: 'meera', name: 'Meera Sen', facts: '27 · Bangalore · Product Designer' },
]

type Option = { user_id: string; name: string; facts: string }

const first = (name: string) => name.split(' ')[0]

function factsOf(u: User): string | undefined {
  const f = u.self_facts
  const parts = [f?.age, f?.city, f?.profession].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}

/** Only same-app paths, never back to /login — anything else falls back to the pipeline. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login') ? raw : '/pipeline'
}

/** Staggered entrance; the resting state is fully visible (DESIGN.md → Motion). */
function Rise({ i, className, children }: { i: number; className?: string; children: ReactNode }) {
  return (
    <div className={`rise ${className ?? ''}`} style={{ '--rise-i': i } as CSSProperties}>
      {children}
    </div>
  )
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white'

function PersonaButton({ option, label, tag, onChoose }: { option: Option; label: string; tag: string; onChoose: () => void }) {
  return (
    <button
      type="button"
      onClick={onChoose}
      className={`group flex w-full items-center gap-3 rounded-2xl border border-line bg-cream p-3 text-left sm:gap-4 sm:p-4 transition-colors hover:border-brand-200 hover:bg-brand-50 ${FOCUS}`}
    >
      <Avatar name={option.name} src={avatarFor(option.user_id)} size="lg" />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-display text-lg leading-snug text-ink">{label}</span>
        <span className="block text-sm text-muted">{option.facts}</span>
        <Chip tone="gold">{tag}</Chip>
      </span>
      <Icon icon={ArrowRight} size="md" className="shrink-0 text-muted transition-colors group-hover:text-brand-600" />
    </button>
  )
}

/** Front-door screen: pick a demo persona (stored like the persona menu does) or start fresh. No new auth —
 * requests still carry X-User-Id. */
export default function Login() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [heroes, setHeroes] = useState<Option[]>(HEROES)
  const [family, setFamily] = useState<Option & { of: string }>()

  useEffect(() => {
    let live = true
    Promise.all(HEROES.map((h) => api.getUser(h.user_id).catch(() => null))).then((users) => {
      if (!live) return
      setHeroes(HEROES.map((h, i) => ({ ...h, name: users[i]?.name ?? h.name, facts: (users[i] && factsOf(users[i])) ?? h.facts })))
    })
    // A parent persona only exists if the backend seeds one (Parent Mode is currently cut).
    api
      .personas()
      .then(async (ps: Persona[]) => {
        const parent = ps.find((p) => p.role === 'parent')
        if (!parent) return
        const user = await api.getUser(parent.user_id).catch(() => null)
        const child = HEROES.find((h) => h.user_id === user?.linked_candidate_id) ?? HEROES[0]
        if (live) setFamily({ user_id: parent.user_id, name: parent.name, facts: parent.tagline || `${first(parent.name)} · family`, of: first(child.name) })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  function choose(id: string) {
    setUserId(id)
    window.location.assign(next) // full load so every screen picks up the persona (same as the persona menu)
  }

  return (
    <div className="min-h-dvh bg-cream lg:grid lg:grid-cols-2">
      {/* Illustration side: a short banner on mobile, the full left half from lg. Decorative image; the
          headline is real text laid over the empty cream sky of the picture on desktop. */}
      <aside className="relative lg:sticky lg:top-0 lg:h-dvh lg:overflow-hidden lg:bg-[#fcf4ec]">
        <div className="flex h-14 items-center px-4 lg:absolute lg:top-6 lg:left-12 lg:z-10 lg:h-auto lg:px-0">
          <Link to="/" className={`rounded font-display text-2xl text-brand-600 ${FOCUS}`}>
            Jodi
          </Link>
        </div>
        <img
          src={`${ILLUSTRATIONS}hero-father-mobile.webp`}
          width={1600}
          height={2143}
          alt=""
          fetchPriority="high"
          className="h-44 w-full bg-[#fcf4ec] object-cover object-[center_62%] sm:h-56 lg:absolute lg:inset-x-0 lg:bottom-0 lg:h-[86%] lg:object-top"
        />
        <Rise i={0} className="px-6 pt-6 text-center lg:absolute lg:inset-x-0 lg:top-0 lg:px-12 lg:pt-24 lg:text-left">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Your AI matchmaker</p>
          <h1 className="mt-2 font-display text-3xl leading-[1.1] sm:text-4xl xl:text-5xl">Your matchmaker is waiting.</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted lg:mx-0 lg:text-base">
            Pick up where your family's matchmaker left off — one thoughtful brief at a time.
          </p>
        </Rise>
      </aside>

      <main className="flex items-center justify-center px-4 pt-6 pb-10 lg:px-12 lg:py-16">
        <div className="w-full max-w-md space-y-5">
          <Rise i={1}>
            <section aria-labelledby="welcome" className="space-y-5 rounded-2xl border border-line bg-white p-4 shadow-card sm:p-6">
              <div className="space-y-1">
                <h2 id="welcome" className="font-display text-2xl">
                  Welcome to Jodi
                </h2>
                <p className="text-sm text-muted">Choose a demo profile to see Jodi at work, or start your own.</p>
              </div>

              <div className="space-y-3">
                {heroes.map((h) => (
                  <PersonaButton key={h.user_id} option={h} label={`Continue as ${first(h.name)}`} tag="Demo profile" onChoose={() => choose(h.user_id)} />
                ))}
                {family && (
                  <PersonaButton option={family} label={`Continue as ${family.of}'s family`} tag="Family view" onChoose={() => choose(family.user_id)} />
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted" role="separator" aria-label="or">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </div>

              <div className="space-y-3">
                <Link
                  to="/start"
                  className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-line bg-white px-5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50 ${FOCUS}`}
                >
                  <Icon icon={UserPlus} />
                  Start fresh — tell Jodi about yourself
                </Link>
                <button
                  type="button"
                  disabled
                  aria-describedby="google-soon"
                  className="flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded-full border border-dashed border-line bg-sand/50 px-5 text-sm font-medium text-muted"
                >
                  <span aria-hidden className="flex size-6 items-center justify-center rounded-full border border-line bg-white font-display text-sm">
                    G
                  </span>
                  Continue with Google
                  <span id="google-soon">
                    <Chip>Coming soon</Chip>
                  </span>
                </button>
              </div>
            </section>
          </Rise>

          <Rise i={2}>
            <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
              <Icon icon={ShieldCheck} className="mt-0.5 shrink-0 text-sage-600" />
              This is a demo. Profiles are synthetic; nothing you enter is shared outside your matchmaker.
            </p>
          </Rise>
        </div>
      </main>
    </div>
  )
}
