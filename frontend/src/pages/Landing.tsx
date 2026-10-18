import { Link } from 'react-router-dom'
import { api, getMyPeople, getUserId } from '../api/client'
import { Card } from '../components/ui'
import { useAsync } from '../lib/useAsync'

const ILLUSTRATIONS = `${import.meta.env.BASE_URL}illustrations/`

// The father's process (spec §2) → what Jodi does. Illustrations: public/illustrations/step-1..5.webp
const STEP_IMAGE_SIZE = [[648, 549], [512, 512], [584, 584], [537, 537], [509, 509]]
const STEPS = [
  ['He knew us deeply', 'Jodi gets to know you — and your family — in a real conversation.'],
  ['He searched every day', 'Jodi quietly scouts and ranks people who fit what matters to you.'],
  ['He called their family first', "Your matchmaker interviews theirs before you're ever involved."],
  ['He gave me the update', 'You get one brief at a time — with reasons and evidence, not a profile feed.'],
  ['One week, one person', 'If you both say yes, you get a Jodi Week — then decide together.'],
]

const PRIMARY = 'inline-flex min-h-12 whitespace-nowrap items-center justify-center rounded-full bg-brand-600 px-6 text-sm font-medium text-white shadow-sm hover:bg-brand-700'
const SECONDARY = 'inline-flex min-h-12 whitespace-nowrap items-center justify-center rounded-full border border-line bg-white px-6 text-sm font-medium hover:bg-sand'

/** Where the current user should go next, based on their status. */
function useNextStep() {
  const uid = getUserId()
  const { data: user } = useAsync(() => api.getUser(uid).catch(() => null), [uid])
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
    <section className="space-y-12 pb-4 lg:space-y-16">
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

      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        {!isMine && (
          <Card className="flex flex-col items-center justify-center space-y-3 border-gold-500/40 text-center lg:order-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Try it as yourself</p>
            <p className="font-display text-2xl leading-snug">Tell Jodi about yourself and watch it learn.</p>
            <p className="text-sm text-muted">
              A private profile of your own, about 3 minutes of chat. Then Jodi searches 60 people for you. Arjun and Meera's story stays
              untouched.
            </p>
            <Link to="/start" className={PRIMARY}>
              Try it as a new person
            </Link>
          </Card>
        )}

        <Card className={`space-y-4 bg-sand/50 ${isMine ? 'lg:col-span-2' : ''}`}>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Where Jodi comes from</p>
          <p className="font-display text-xl leading-relaxed">
            “My father found matches the patient way. He filtered quietly, called the other family first, read people carefully — and only
            then handed me one name. One week, one person. Decide, then move on.”
          </p>
          <p className="text-sm text-muted">Jodi turns that father into a matchmaker everyone gets.</p>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 font-display text-2xl">How it works</h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STEPS.map(([dad, jodi], i) => (
            <li key={dad} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-3 sm:flex-col sm:items-stretch sm:gap-3 sm:p-4">
              <div className="relative shrink-0">
                <img
                  src={`${ILLUSTRATIONS}step-${i + 1}.webp`}
                  width={STEP_IMAGE_SIZE[i][0]}
                  height={STEP_IMAGE_SIZE[i][1]}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-square size-20 rounded-xl bg-[#faf4f0] object-contain sm:size-auto sm:w-full"
                />
                <span className="absolute -top-1.5 -left-1.5 flex size-7 items-center justify-center rounded-full border-2 border-white bg-brand-50 font-display text-sm text-brand-700">
                  {i + 1}
                </span>
              </div>
              <div>
                <p className="text-xs italic text-muted">{dad}</p>
                <p className="text-sm">{jodi}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['One at a time', 'No feed, no swiping. Each match gets your full attention.'],
          ['You stay in control', 'See everything Jodi knows, and choose who sees what.'],
          ['Nobody left waiting', 'Briefs expire and Jodi Weeks end — decisions are kind and quick.'],
        ].map(([t, b]) => (
          <div key={t} className="rounded-2xl bg-white p-4 text-sm">
            <p className="font-medium">{t}</p>
            <p className="mt-1 text-xs text-muted">{b}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
