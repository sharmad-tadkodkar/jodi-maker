import { CAPTIONS, STEPS, type Step } from './captions'
import { POSTER } from './frames'

function StepCard({ step, n }: { step: Step; n: number }) {
  return (
    <li className="flex items-center gap-4 rounded-2xl border border-line bg-white p-3 sm:flex-col sm:items-stretch sm:gap-3 sm:p-4">
      {step.image ? (
        <div className="relative shrink-0">
          <img
            src={step.image.src}
            width={step.image.width}
            height={step.image.height}
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-square size-20 rounded-xl bg-[#faf4f0] object-contain sm:size-auto sm:w-full"
          />
          <span className="absolute -top-1.5 -left-1.5 flex size-7 items-center justify-center rounded-full border-2 border-white bg-brand-50 font-display text-sm text-brand-700">
            {n}
          </span>
        </div>
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 font-display text-brand-700">{n}</span>
      )}
      <div>
        <p className="text-xs italic text-muted">{step.eyebrow}</p>
        <p className="text-sm">{step.text}</p>
      </div>
    </li>
  )
}

export default function HowItWorks({ steps = STEPS, title = 'How it works', className = 'lg:grid-cols-5' }: { steps?: Step[]; title?: string; className?: string }) {
  return (
    <div>
      <h2 className="mb-4 font-display text-2xl">{title}</h2>
      <ol className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${className}`}>
        {steps.map((s, i) => (
          <StepCard key={s.eyebrow} step={s} n={i + 1} />
        ))}
      </ol>
    </div>
  )
}

/** No-motion / failed-load version of the film: the poster, then the seven captions as a plain list. */
export function FilmFallback() {
  return (
    <div className="space-y-6">
      <img
        src={POSTER}
        width={1600}
        height={900}
        alt="A father at his desk, reading a profile card under a lamp"
        loading="lazy"
        decoding="async"
        className="aspect-video w-full rounded-3xl border border-line object-cover"
      />
      <HowItWorks steps={CAPTIONS} className="lg:grid-cols-4" />
    </div>
  )
}
