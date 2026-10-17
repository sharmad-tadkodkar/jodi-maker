import type { LearningResult } from '../api/client'
import { DIMENSION_LABEL, DIMENSIONS } from '../lib/format'
import { Card } from './ui'

/** "What I learned about you" — shown after a Pass / Stop (spec §4.7). Weights are 0–1 shares of attention. */
export default function LearningCard({ learning }: { learning: LearningResult }) {
  const max = Math.max(...DIMENSIONS.flatMap((d) => [learning.old_weights[d] ?? 0, learning.new_weights[d] ?? 0]), 0.01)
  return (
    <Card className="space-y-4 border-gold-500/40">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">What I learned about you</p>
        <p className="font-display text-xl leading-snug">{learning.explanation}</p>
      </div>

      <div className="space-y-2.5">
        {DIMENSIONS.map((d) => {
          const before = learning.old_weights[d] ?? 0
          const after = learning.new_weights[d] ?? 0
          const delta = Math.round((after - before) * 100)
          return (
            <div key={d} className="text-xs">
              <div className="mb-1 flex justify-between">
                <span className="text-muted">{DIMENSION_LABEL[d]}</span>
                <span className={delta > 0 ? 'text-sage-600' : delta < 0 ? 'text-brand-600' : 'text-muted'}>
                  {Math.round(before * 100)}% → {Math.round(after * 100)}%
                  {delta !== 0 && ` (${delta > 0 ? '+' : ''}${delta})`}
                </span>
              </div>
              <div className="relative h-1.5 rounded-full bg-sand">
                <div className="absolute inset-y-0 left-0 rounded-full bg-line" style={{ width: `${(before / max) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-gold-500/80" style={{ width: `${(after / max) * 100}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {learning.moved_up > 0 && (
        <p className="text-sm text-muted">
          {learning.moved_up} {learning.moved_up === 1 ? 'person' : 'people'} moved up in your queue.
        </p>
      )}
    </Card>
  )
}
