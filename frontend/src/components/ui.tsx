/** Shared building blocks. Keep screens composed from these so the look stays consistent (docs/DESIGN.md). */
import { BadgeCheck, type LucideIcon } from 'lucide-react'
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-200',
  secondary: 'border border-line bg-white text-ink hover:bg-sand disabled:text-muted',
  ghost: 'text-brand-600 hover:bg-brand-50 disabled:text-muted',
}

export function Button({
  variant = 'primary',
  className,
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        BUTTON[variant],
        className,
      )}
    >
      {busy && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl border border-line bg-white p-5 shadow-card', className)}>{children}</div>
}

const CHIP_TONE = {
  brand: 'bg-brand-50 text-brand-700',
  gold: 'bg-gold-100 text-gold-700',
  sage: 'bg-sage-100 text-sage-700',
  amber: 'bg-amber-100 text-amber-700',
  teal: 'bg-teal-100 text-teal-700',
  muted: 'bg-sand text-muted',
} as const

export function Chip({ tone = 'muted', children }: { tone?: keyof typeof CHIP_TONE; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', CHIP_TONE[tone])}>
      {children}
    </span>
  )
}

const AVATAR_SIZE = {
  sm: 'size-8 text-sm',
  md: 'size-12 text-lg',
  lg: 'size-16 text-2xl',
  xl: 'size-20 text-3xl',
} as const
const AVATAR_TONE = {
  brand: 'from-brand-100 to-gold-100 text-brand-700', // me / the person
  teal: 'from-teal-100 to-sage-100 text-teal-700', // their matchmaker / the other side
} as const

/** Photo if `src` loads, otherwise the first letter of `name`. Decorative: the name is always shown beside it. */
export function Avatar({
  name,
  src,
  size = 'md',
  tone = 'brand',
  className,
}: {
  name: string
  src?: string | null
  size?: keyof typeof AVATAR_SIZE
  tone?: keyof typeof AVATAR_TONE
  className?: string
}) {
  const [failedSrc, setFailedSrc] = useState<string>()
  const showImage = src && src !== failedSrc
  return (
    <div
      aria-hidden
      className={cx(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-display',
        AVATAR_SIZE[size],
        AVATAR_TONE[tone],
        className,
      )}
    >
      {showImage ? (
        <img src={src} alt="" decoding="async" className="size-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </div>
  )
}

const ICON_SIZE = { xs: 'size-3.5', sm: 'size-4', md: 'size-5', lg: 'size-6' } as const

/** lucide-react icon at a design-system size. Decorative unless `label` is given. */
export function Icon({
  icon: Glyph,
  size = 'sm',
  label,
  className,
}: {
  icon: LucideIcon
  size?: keyof typeof ICON_SIZE
  label?: string
  className?: string
}) {
  return (
    <Glyph
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      strokeWidth={size === 'xs' ? 2.25 : 1.75} // thin strokes vanish at 14 px
      className={cx('shrink-0', ICON_SIZE[size], className)}
    />
  )
}

const RING_TONE = { brand: 'text-brand-500', sage: 'text-sage-600', teal: 'text-teal-600', gold: 'text-gold-500' } as const

/** Circular 0–100 score (compatibility, fit). Pass percentages — use `pct()` from lib/format for raw scores. */
export function ScoreRing({
  value,
  size = 56,
  stroke = 5,
  label,
  tone = 'brand',
}: {
  value: number
  size?: number
  stroke?: number
  label?: string
  tone?: keyof typeof RING_TONE
}) {
  const v = Math.round(Math.min(100, Math.max(0, value)))
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  return (
    <div role="img" aria-label={`${v}%${label ? ` ${label}` : ''}`} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-sand)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - v / 100)}
          className={cx('transition-[stroke-dashoffset] duration-700', RING_TONE[tone])}
        />
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display tabular-nums text-ink" style={{ fontSize: size * 0.3 }}>
          {v}
          <span style={{ fontSize: size * 0.16 }}>%</span>
        </span>
        {label && size >= 64 && <span className="mt-0.5 text-[10px] text-muted">{label}</span>}
      </div>
    </div>
  )
}

export function ScoreBar({ label, value, title }: { label: string; value: number; title?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs" title={title}>
      <span className="w-24 shrink-0 text-muted">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="w-7 text-right tabular-nums text-ink">{value}</span>
    </div>
  )
}

export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-sage-600" title="ID verified">
      <Icon icon={BadgeCheck} size="xs" />
      Verified
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', className)} />
}

export function Loading({ label = 'One moment…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-muted" role="status">
      <Spinner className="size-6 text-brand-500" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Card className="space-y-3 text-center">
      <p className="font-display text-lg">{error}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  )
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 space-y-1">
      {eyebrow && <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">{eyebrow}</p>}
      <h1 className="font-display text-3xl leading-tight text-ink">{title}</h1>
      {children && <div className="text-sm text-muted">{children}</div>}
    </header>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 font-display text-xl text-ink">{children}</h2>
}

export function Typing({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted" role="status">
      <span className="flex gap-1">
        {[0, 150, 300].map((d) => (
          <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted/60" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
      {name} is typing…
    </div>
  )
}
