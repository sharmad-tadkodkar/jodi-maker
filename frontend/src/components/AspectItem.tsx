import { useState } from 'react'
import type { Aspect, Visibility } from '../api/client'
import { VISIBILITY } from '../lib/format'
import { VISIBILITY_ICON } from '../lib/icons'
import { errorMessage } from '../lib/useAsync'
import { Button, Icon } from './ui'

function confidenceLabel(c: number) {
  return c >= 0.85 ? 'Sure' : c >= 0.6 ? 'Fairly sure' : 'Still guessing'
}

type Props = {
  aspect: Aspect
  onPatch: (patch: { statement?: string; visibility?: Visibility }) => Promise<void>
  onDelete: () => Promise<void>
}

export default function AspectItem({ aspect, onPatch, onDelete }: Props) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirmDelete'>('view')
  const [draft, setDraft] = useState(aspect.statement)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function run(fn: () => Promise<void>, after?: () => void) {
    setBusy(true)
    setError(undefined)
    try {
      await fn()
      after?.()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      {mode === 'edit' ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            aria-label="Edit what Jodi knows"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="field-sizing-content min-h-16 w-full resize-none rounded-xl border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setDraft(aspect.statement); setMode('view') }} disabled={busy}>
              Cancel
            </Button>
            <Button busy={busy} disabled={!draft.trim() || draft.trim() === aspect.statement} onClick={() => run(() => onPatch({ statement: draft.trim() }), () => setMode('view'))}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-sm font-medium leading-snug">{aspect.statement}</p>
          <p className="text-xs italic text-muted">{aspect.evidence}</p>
          <p className="text-[11px] text-muted">
            {confidenceLabel(aspect.confidence)} · {Math.round(aspect.confidence * 100)}%
            {aspect.source === 'learned' ? ' · learned from your decisions' : aspect.source && aspect.source !== 'intake' && ` · from ${aspect.source.replace(/^upload:/, '')}`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Who can see this" className="inline-flex rounded-full border border-line bg-cream p-0.5 text-xs">
          {VISIBILITY.map((v) => (
            <button
              key={v.value}
              type="button"
              role="radio"
              aria-checked={aspect.visibility === v.value}
              title={v.hint}
              disabled={busy}
              onClick={() => aspect.visibility !== v.value && run(() => onPatch({ visibility: v.value }))}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
                aspect.visibility === v.value ? 'bg-white font-medium text-brand-700 shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              <Icon icon={VISIBILITY_ICON[v.value]} size="xs" className="size-3.5" />
              {v.label}
            </button>
          ))}
        </div>

        {mode === 'confirmDelete' ? (
          <span className="flex items-center gap-1 text-xs">
            Forget this?
            <Button variant="ghost" className="min-h-8 px-3" onClick={() => setMode('view')} disabled={busy}>
              No
            </Button>
            <Button className="min-h-8 px-3" busy={busy} onClick={() => run(onDelete)}>
              Forget
            </Button>
          </span>
        ) : (
          mode === 'view' && (
            <span className="flex gap-1 text-xs">
              <button type="button" className="rounded-full px-2.5 py-1 text-muted hover:bg-sand hover:text-ink" onClick={() => setMode('edit')}>
                Edit
              </button>
              <button type="button" className="rounded-full px-2.5 py-1 text-muted hover:bg-brand-50 hover:text-brand-700" onClick={() => setMode('confirmDelete')}>
                Forget
              </button>
            </span>
          )
        )}
      </div>
      {error && <p className="text-xs text-brand-700">{error}</p>}
    </li>
  )
}
