import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import type { Brief } from '../api/client'
import { DIMENSION_LABEL, pct } from '../lib/format'

export default function FitRadar({ whyFit }: { whyFit: Brief['why_fit'] }) {
  const data = whyFit.map((w) => ({ dimension: DIMENSION_LABEL[w.dimension], score: pct(w.score) }))
  return (
    <div className="h-64 w-full" role="img" aria-label={data.map((d) => `${d.dimension} ${d.score}`).join(', ')}>
      <ResponsiveContainer>
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
