/** Shared building blocks. Keep screens composed from these so the look stays consistent. */
import type { ButtonHTMLAttributes, ReactNode } from 'react'

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
  return <div className={cx('rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(43,36,32,0.04)]', className)}>{children}</div>
}

const CHIP_TONE = {
  brand: 'bg-brand-50 text-brand-700',
  gold: 'bg-gold-100 text-gold-700',
  sage: 'bg-sage-100 text-sage-600',
  muted: 'bg-sand text-muted',
} as const

export function Chip({ tone = 'muted', children }: { tone?: keyof typeof CHIP_TONE; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', CHIP_TONE[tone])}>
      {children}
    </span>
  )
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <div
      aria-hidden
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-gold-100 font-display text-brand-700',
        size === 'lg' ? 'size-16 text-2xl' : 'size-12 text-lg',
      )}
    >
      {name.charAt(0).toUpperCase()}
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
      <svg viewBox="0 0 20 20" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M10 1.5l2.2 1.6 2.7-.1.9 2.6 2.2 1.6-.8 2.6.8 2.6-2.2 1.6-.9 2.6-2.7-.1L10 18.5l-2.2-1.6-2.7.1-.9-2.6-2.2-1.6.8-2.6-.8-2.6 2.2-1.6.9-2.6 2.7.1L10 1.5zm-1.1 11.3l5-5-1.1-1.1-3.9 3.9-1.8-1.8L6 9.9l2.9 2.9z" />
      </svg>
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
      <p className="font-display text-lg">Jodi couldn't reach the server</p>
      <p className="break-words text-xs text-muted">{error}</p>
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
