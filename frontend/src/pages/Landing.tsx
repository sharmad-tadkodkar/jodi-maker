import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getMyPeople, getUserId, isSignedIn } from '../api/client'
import { ChevronDown, Clock, HeartHandshake, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react'
import ScrollFilm from '../components/landing/ScrollFilm'
import Reveal from '../components/Reveal'
import { Card, Icon } from '../components/ui'
import { useAsync } from '../lib/useAsync'

const ILLUSTRATIONS = `${import.meta.env.BASE_URL}illustrations/`

const VALUES: [LucideIcon, string, string][] = [
  [HeartHandshake, 'One at a time', 'No feed, no swiping. Each match gets your full attention.'],
  [ShieldCheck, 'You stay in control', 'See everything Jodi knows, and choose who sees what.'],
  [Clock, 'Nobody left waiting', 'Briefs expire and Jodi Weeks end — decisions are kind and quick.'],
]

const PRIMARY = 'inline-flex min-h-12 whitespace-nowrap items-center justify-center rounded-full bg-brand-600 px-6 text-sm font-medium text-white shadow-sm hover:bg-brand-700'
const SECONDARY = 'inline-flex min-h-12 whitespace-nowrap items-center justify-center rounded-full border border-line bg-white px-6 text-sm font-medium hover:bg-sand'

/** "Scroll to see how Jodi works" at the foot of the hero; fades out once the page has scrolled. */
function ScrollCue() {
  const [gone, setGone] = useState(false)
  useEffect(() => {
    const onScroll = () => setGone(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <p
      aria-hidden={gone}
      className={`mt-6 flex items-center justify-center gap-1.5 text-sm text-muted transition-opacity duration-500 ${gone ? 'opacity-0' : 'opacity-100'}`}
    >
      Scroll to see how Jodi works
      <ChevronDown className="size-4 animate-bounce motion-reduce:animate-none" aria-hidden />
    </p>
  )
}

/** Where the current user should go next, based on their status. */
function useNextStep() {
  const uid = getUserId()
  const signedIn = isSignedIn()
  const { data: user } = useAsync(() => (signedIn ? api.getUser(uid).catch(() => null) : Promise.resolve(null)), [uid, signedIn])
  if (!signedIn) return { to: '/login', label: 'Meet your matchmaker', note: undefined }
  if (user?.status === 'in_focus' && user.active_match_id) {
    return { to: `/focus/${user.active_match_id}`, label: 'Continue your Jodi Week', note: "You're in a Jodi Week — your search is paused." }
  }
  if (user && user.status !== 'onboarding') {
    return { to: '/brief', label: 'See your latest brief', note: `Welcome back, ${user.name.split(' ')[0]}.` }
  }
  return { to: '/onboard', label: 'Meet your matchmaker', note: undefined }
}

export default function Landing() {
  const next = useNextStep()
  const isMine = getMyPeople().some((p) => p.user_id === getUserId())
  return (
    <div className="pb-4">
      <section className="relative mx-auto max-w-6xl px-4 lg:px-8">
        {/* Hero: text, then the father. Mobile/tablet stack; from lg two columns — the illustration is anchored
            right so its empty left margin is what gets cropped (its background is the card colour, so the edge
            is invisible). Art-directed: portrait crop under 768px, wide banner above. Eager — it's the LCP. */}
        <div className="-mx-4 overflow-hidden bg-[#fcf4ec] sm:mx-0 sm:rounded-3xl sm:border sm:border-line lg:grid lg:min-h-[560px] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="relative z-10 space-y-5 px-6 pt-10 text-center lg:flex lg:flex-col lg:justify-center lg:py-12 lg:pr-4 lg:pl-12 lg:text-left xl:pl-14">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Your AI matchmaker</p>
            <h1 className="font-display text-4xl leading-[1.1] sm:text-5xl xl:text-[3.5rem]">
              You never browse profiles.
              <br />
              <span className="text-brand-600">You get a briefing.</span>
            </h1>
            <p className="mx-auto max-w-md text-muted lg:mx-0">
              Jodi knows you and your family, talks to other people's matchmakers on your behalf, and brings you one thoughtful match at a time.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:flex-wrap lg:justify-start">
              <Link to={next.to} className={PRIMARY}>
                {next.label}
              </Link>
              {next.to !== '/pipeline' && (
                <Link to="/pipeline" className={SECONDARY}>
                  See who Jodi is considering
                </Link>
              )}
            </div>
            {next.note && <p className="text-sm text-muted">{next.note}</p>}
          </div>
          <div className="relative">
            <picture className="block lg:absolute lg:inset-0">
              <source media="(min-width: 768px)" srcSet={`${ILLUSTRATIONS}hero-father.webp`} width={1600} height={893} />
              <img
                src={`${ILLUSTRATIONS}hero-father-mobile.webp`}
                width={1600}
                height={2143}
                alt=""
                fetchPriority="high"
                decoding="async"
                className="-mt-8 block h-auto w-full md:mt-4 lg:absolute lg:inset-0 lg:mt-0 lg:h-full lg:object-cover lg:object-right"
              />
            </picture>
            {/* soften the crop edge into the text column */}
            <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/3 bg-gradient-to-r from-[#fcf4ec] via-[#fcf4ec]/60 to-transparent lg:block" />
          </div>
        </div>
        <ScrollCue />
      </section>

      {/* "How it works", told as a scroll-driven film (falls back to a static list) */}
      <div className="mt-10 lg:mt-14">
        <ScrollFilm cta={{ to: next.to, label: next.label }} />
      </div>

      <div className="mx-auto max-w-6xl space-y-12 px-4 pt-12 lg:space-y-16 lg:px-8 lg:pt-16">
        {!isMine && (
          <Reveal>
            <Card className="flex flex-col items-center gap-4 border-gold-500/40 text-center md:flex-row md:justify-between md:text-left lg:px-10">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Try it as yourself</p>
                <p className="font-display text-2xl leading-snug">Tell Jodi about yourself and watch it learn.</p>
                <p className="max-w-xl text-sm text-muted">
                  A private profile of your own, about 3 minutes of chat. Then Jodi searches 60 people for you. Arjun and Meera's story stays
                  untouched.
                </p>
              </div>
              <Link to="/start" className={`${PRIMARY} shrink-0`}>
                Try it as a new person
              </Link>
            </Card>
          </Reveal>
        )}

        <Reveal className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {VALUES.map(([icon, t, b]) => (
            <div key={t} className="flex gap-3 rounded-2xl border border-line bg-white p-4 text-sm">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Icon icon={icon} size="sm" />
              </span>
              <div>
                <p className="font-medium">{t}</p>
                <p className="mt-1 text-xs text-muted">{b}</p>
              </div>
            </div>
          ))}
        </Reveal>

        <footer className="flex flex-col items-center gap-1 border-t border-line pt-6 text-center text-xs text-muted sm:flex-row sm:justify-between sm:text-left">
          <p>
            <span className="font-display text-base text-brand-600">Jodi</span> · your AI matchmaker
          </p>
          <p className="inline-flex items-center gap-1.5">
            <Icon icon={Sparkles} size="xs" className="text-gold-700" />
            Built with Gemini on Google Cloud
          </p>
        </footer>
      </div>
    </div>
  )
}
