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
      className="h-64 w-full"
      role="img"
      aria-label={whyFit.map((w) => `${DIMENSION_LABEL[w.dimension]} ${pct(w.score)}`).join(', ')}
    >
      <ResponsiveContainer onResize={(w) => setWidth(w)}>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="var(--color-line)" />
          <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--color-muted)', fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="score"
            stroke="var(--color-brand-500)"
            strokeWidth={2}
            fill="var(--color-brand-500)"
            fillOpacity={0.18}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
