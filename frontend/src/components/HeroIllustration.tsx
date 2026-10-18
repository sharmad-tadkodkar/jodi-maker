import { MessageCircle, Sparkles } from 'lucide-react'
import { Avatar, Chip, Icon, ScoreRing } from './ui'

/** Decorative hero art built from the design system: two matchmakers talk, a brief comes out.
 * Sample content only — no real profile data. Hidden from assistive tech. */
export default function HeroIllustration() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md select-none">
      {/* soft backdrop */}
      <div className="absolute -inset-x-3 -inset-y-6 -z-10 rounded-[3rem] sm:-inset-6 bg-gradient-to-br from-brand-50 via-gold-100/60 to-teal-50 blur-[1px]" />

      {/* the matchmakers' conversation */}
      <div className="space-y-3 px-2 pt-2">
        <div className="flex items-end gap-2">
          <Avatar name="Your matchmaker" size="sm" />
          <p className="max-w-[75%] rounded-2xl rounded-bl-sm bg-brand-600 px-3.5 py-2 text-xs leading-relaxed text-white shadow-card">
            She loves weekend hikes — so does he. How does she feel about living near family?
          </p>
        </div>
        <div className="flex flex-row-reverse items-end gap-2">
          <Avatar name="Their matchmaker" size="sm" tone="teal" />
          <p className="max-w-[75%] rounded-2xl rounded-br-sm border border-line bg-white px-3.5 py-2 text-xs leading-relaxed text-ink shadow-card">
            Open to it, with a plan for their own home after a year.
          </p>
        </div>
      </div>

      {/* the brief that comes out of it */}
      <div className="relative mt-5 rounded-2xl border border-line bg-white p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <Avatar name="Meera" size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-gold-700">Today's brief</p>
            <p className="font-display text-lg leading-tight text-ink">One person, with reasons</p>
          </div>
          <ScoreRing value={91} size={56} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip tone="sage">Same conflict style</Chip>
          <Chip tone="sage">Both early risers</Chip>
          <Chip tone="amber">Living with parents?</Chip>
        </div>
        <span className="absolute -top-3 -right-3 flex size-9 items-center justify-center rounded-full bg-gold-100 text-gold-700 shadow-card">
          <Icon icon={Sparkles} />
        </span>
      </div>

      <span className="absolute top-1/3 -left-4 hidden size-9 items-center justify-center rounded-full bg-white text-teal-600 shadow-card sm:flex">
        <Icon icon={MessageCircle} />
      </span>
    </div>
  )
}
