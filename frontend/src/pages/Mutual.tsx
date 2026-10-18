import { useNavigate, useParams } from 'react-router-dom'
import { api, getUserId } from '../api/client'
import { Avatar, Button, ErrorState, Loading } from '../components/ui'
import { avatarFor } from '../lib/avatars'
import { firstName } from '../lib/format'
import { useAsync } from '../lib/useAsync'

const RULES = [
  ['7 days, just the two of you', 'Your search pauses and you are taken out of everyone else\'s queue.'],
  ['A few prompts each day', 'Practical things first, then values and the harder topics, then the personal.'],
  ['Decide together on Day 7', 'Move forward, take one more week, or part kindly. Nobody is left waiting.'],
]

export default function Mutual() {
  const { matchId = '' } = useParams()
  const uid = getUserId()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useAsync(async () => {
    const [focus, me] = await Promise.all([api.getFocus(matchId), api.getUser(uid).catch(() => null)])
    return { focus, me }
  }, [matchId, uid])

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorState error={error ?? 'Your matchmaker hit a snag — please try again.'} onRetry={reload} />

  const partner = data.focus.partner
  const them = firstName(partner.display_name)

  return (
    <section className="flex flex-col items-center pt-6 text-center">
      <div className="relative mb-8 flex items-center animate-[fadeUp_.6s_ease-out]" aria-hidden>
        <Avatar name={data.me?.name ?? uid} src={avatarFor(uid, data.me?.gender, data.me?.photo_url)} size="xl" className="border-4 border-cream" />
        <Avatar
          name={partner.display_name}
          src={avatarFor(partner.user_id, data.me?.seeking_gender)}
          size="xl"
          className="-ml-5 border-4 border-cream"
        />
        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-2 py-1 text-xl shadow-md">💛</span>
      </div>

      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">It's mutual</p>
      <h1 className="mt-1 font-display text-4xl leading-tight">You and {them} both said yes</h1>
      <p className="mt-3 max-w-sm text-sm text-muted">
        Your matchmakers did the groundwork. Now it's your turn to talk — with one week of each other's full attention.
      </p>

      <ol className="mt-8 w-full max-w-md space-y-3 text-left">
        {RULES.map(([title, body], i) => (
          <li key={title} className="flex gap-3 rounded-2xl border border-line bg-white p-4">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sand font-display text-sm text-gold-700">{i + 1}</span>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <Button className="mt-8 w-full max-w-md" onClick={() => navigate(`/focus/${matchId}`)}>
        Start your Jodi Week with {them}
      </Button>
    </section>
  )
}
