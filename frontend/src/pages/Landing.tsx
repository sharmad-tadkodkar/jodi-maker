import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getMyPeople, getUserId, isSignedIn } from '../api/client'
import { ChevronDown, Clock, HeartHandshake, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react'
import ScrollFilm from '../components/landing/ScrollFilm'
import Reveal from '../components/Reveal'
import { Card, Icon } from '../components/ui'
import { CONTAINER } from '../lib/layout'
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

/** The card colour easing out to transparent, for merging the hero scene into the card. */
const fade = (dir: string) =>
  `linear-gradient(${dir}, #fcf4ec 0%, #fcf4ec 10%, rgb(252 244 236 / 0.93) 22%, rgb(252 244 236 / 0.76) 36%, ` +
  `rgb(252 244 236 / 0.5) 52%, rgb(252 244 236 / 0.26) 68%, rgb(252 244 236 / 0.09) 84%, rgb(252 244 236 / 0) 100%)`

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
      <section className={`relative ${CONTAINER}`}>
        {/* Hero: text, then the couple. Mobile/tablet stack, the scene fading up into the card colour; from lg the
            scene fills the right ~62% of the card and dissolves leftwards into the cream behind the text (the faded
            part is park, never the couple). Art-directed: portrait crop under 768px, wide scene above. Eager — it's
            the LCP. */}
        <div className="relative -mx-4 overflow-hidden bg-[#fcf4ec] sm:mx-0 sm:rounded-3xl sm:border sm:border-line lg:grid lg:min-h-[560px] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="relative z-10 space-y-5 px-6 pt-10 text-center lg:flex lg:flex-col lg:justify-center lg:py-12 lg:pr-4 lg:pl-12 lg:text-left xl:pl-14">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Your AI matchmaker</p>
            <h1 className="font-display text-4xl leading-[1.1] sm:text-5xl xl:text-[3.5rem]">
              You never browse profiles.
              <br />
              <span className="text-brand-600">You get a briefing.</span>
            </h1>
            <p className="mx-auto max-w-md text-muted lg:mx-0">
              In a world of endless swiping and empty promises, a master matchmaker protects your time, silences the noise, and brings you only
              the ones truly destined for your heart.
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
          <div className="relative mt-8 lg:absolute lg:inset-y-0 lg:right-0 lg:mt-0 lg:w-[62%]">
            <picture className="block lg:absolute lg:inset-0">
              <source media="(min-width: 768px)" srcSet={`${ILLUSTRATIONS}hero-couple.webp`} width={998} height={533} />
              <img
                src={`${ILLUSTRATIONS}hero-couple-mobile.webp`}
                width={480}
                height={533}
                alt="A smiling couple walking together through a sunlit park"
                fetchPriority="high"
                decoding="async"
                className="block h-auto w-full lg:absolute lg:inset-0 lg:h-full lg:object-cover lg:object-[51%_50%]"
              />
            </picture>
            {/* Merge the scene into the card: up into the text when stacked, left into the text column from lg. Eased
                stops (a straight ramp reads as an edge where it starts), and 2px outside the image so its anti-aliased
                sub-pixel edge never shows as a line. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-0.5 h-20 lg:hidden" style={{ background: fade('to bottom') }} />
            <div aria-hidden className="pointer-events-none absolute inset-y-0 -left-0.5 hidden w-[38%] lg:block" style={{ background: fade('to right') }} />
          </div>
        </div>
        <ScrollCue />
      </section>

      {/* "How it works", told as a scroll-driven film (falls back to a static list) */}
      <div className="mt-10 lg:mt-14">
        <ScrollFilm cta={{ to: next.to, label: next.label }} />
      </div>

      <div className={`${CONTAINER} space-y-12 pt-12 lg:space-y-16 lg:pt-16`}>
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
