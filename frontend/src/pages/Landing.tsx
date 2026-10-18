import { Link } from 'react-router-dom'
import { api, getMyPeople, getUserId } from '../api/client'
import { Card } from '../components/ui'
import { useAsync } from '../lib/useAsync'

// The father's process (spec §2) → what Jodi does.
const STEPS = [
  ['He knew us deeply', 'Jodi gets to know you — and your family — in a real conversation.'],
  ['He searched every day', 'Jodi quietly scouts and ranks people who fit what matters to you.'],
  ['He called their family first', "Your matchmaker interviews theirs before you're ever involved."],
  ['He gave me the update', 'You get one brief at a time — with reasons and evidence, not a profile feed.'],
  ['One week, one person', 'If you both say yes, you get a Jodi Week — then decide together.'],
]

const PRIMARY = 'inline-flex min-h-12 items-center justify-center rounded-full bg-brand-600 px-6 text-sm font-medium text-white shadow-sm hover:bg-brand-700'
const SECONDARY = 'inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-white px-6 text-sm font-medium hover:bg-sand'

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
    <section className="space-y-12 pb-4">
      <div className="space-y-5 pt-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Your AI matchmaker</p>
        <h1 className="font-display text-4xl leading-[1.1] sm:text-5xl">
          You never browse profiles.
          <br />
          <span className="text-brand-600">You get a briefing.</span>
        </h1>
        <p className="mx-auto max-w-md text-muted">
          Jodi knows you and your family, talks to other people's matchmakers on your behalf, and brings you one thoughtful match at a time.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
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

      {!isMine && (
        <Card className="space-y-3 border-gold-500/40 text-center">
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

      <Card className="space-y-4 bg-sand/50">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">Where Jodi comes from</p>
        <p className="font-display text-xl leading-relaxed">
          “My father found matches the patient way. He filtered quietly, called the other family first, read people carefully — and only
          then handed me one name. One week, one person. Decide, then move on.”
        </p>
        <p className="text-sm text-muted">Jodi turns that father into a matchmaker everyone gets.</p>
      </Card>

      <div>
        <h2 className="mb-4 font-display text-2xl">How it works</h2>
        <ol className="space-y-3">
          {STEPS.map(([dad, jodi], i) => (
            <li key={dad} className="flex gap-4 rounded-2xl border border-line bg-white p-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 font-display text-brand-700">{i + 1}</span>
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
