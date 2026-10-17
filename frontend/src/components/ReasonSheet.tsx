import { useState } from 'react'
import { Button, Card } from './ui'

/** One-tap reason chips (+ "other" free text). Values are what the backend expects (FRONTEND_GUIDE Phase 5). */
const REASONS = [
  { value: 'values', label: 'Values' },
  { value: 'family', label: 'Family' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'location', label: 'Location' },
  { value: 'career', label: 'Career' },
  { value: 'just not feeling it', label: 'Just not feeling it' },
  { value: 'other', label: 'Other' },
]

export default function ReasonSheet({ title, hint, submitLabel, busy, onCancel, onSubmit }: {
  title: string
  hint: string
  submitLabel: string
  busy: boolean
  onCancel: () => void
  onSubmit: (reason: string) => void
}) {
  const [choice, setChoice] = useState<string>()
  const [other, setOther] = useState('')
  const reason = choice === 'other' ? (other.trim() ? `other: ${other.trim()}` : undefined) : choice
  return (
    <Card className="space-y-4">
      <div>
        <p className="font-display text-lg">{title}</p>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            aria-pressed={choice === r.value}
            onClick={() => setChoice(r.value)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              choice === r.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line bg-white hover:bg-sand'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {choice === 'other' && (
        <input
          autoFocus
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Tell Jodi in a few words"
          className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        />
      )}
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
          Back
        </Button>
        <Button className="flex-1" disabled={!reason} busy={busy} onClick={() => reason && onSubmit(reason)}>
          {submitLabel}
        </Button>
      </div>
    </Card>
  )
}
