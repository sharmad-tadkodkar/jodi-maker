import { useState } from 'react'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import type { Brief } from '../api/client'
import { DIMENSION_LABEL, pct } from '../lib/format'

// "Communication" sits on the left vertex and runs past the chart edge on phone-width cards.
// The full label is always in the reasons list under the chart.
const SHORT_LABEL: Partial<Record<Brief['why_fit'][number]['dimension'], string>> = { communication: 'Comms' }
const NARROW_PX = 400

export default function FitRadar({ whyFit }: { whyFit: Brief['why_fit'] }) {
  const [width, setWidth] = useState(0)
  const narrow = width > 0 && width < NARROW_PX
  const data = whyFit.map((w) => ({
    dimension: (narrow && SHORT_LABEL[w.dimension]) || DIMENSION_LABEL[w.dimension],
    score: pct(w.score),
  }))
  return (
    <div
      className="h-72 w-full sm:h-80"
      role="img"
      aria-label={whyFit.map((w) => `${DIMENSION_LABEL[w.dimension]} ${pct(w.score)}`).join(', ')}
    >
      <ResponsiveContainer onResize={(w) => setWidth(w)}>
        {/* Single series → brand maroon (DESIGN.md: the radar stays one colour); gold vertices tie it to the brand. */}
        <RadarChart data={data} outerRadius="74%">
          <defs>
            <radialGradient id="fit-fill" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="var(--color-gold-500)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0.28} />
            </radialGradient>
          </defs>
          <PolarGrid stroke="var(--color-line)" />
          <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--color-ink)', fontSize: 12, fontWeight: 500 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="score"
            stroke="var(--color-brand-600)"
            strokeWidth={2}
            strokeLinejoin="round"
            fill="url(#fit-fill)"
            fillOpacity={1}
            dot={{ r: 4, fill: 'var(--color-gold-500)', stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
