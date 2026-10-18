import type { Aspect, PipelineItem, Scores, Visibility } from '../api/client'

export const ASPECT_LABEL: Record<Aspect['category'], string> = {
  values: 'Values',
  family_structure: 'Family',
  career_ambition: 'Career',
  lifestyle: 'Lifestyle',
  location_plans: 'Location plans',
  finances: 'Finances',
  faith_practice: 'Faith',
  communication_style: 'Communication',
  interests: 'Interests',
  partner_expectations: 'In a partner',
  dealbreakers: 'Dealbreakers',
}

export type Dimension = Exclude<keyof Scores, 'overall' | 'reasons'>

export const DIMENSIONS: Dimension[] = ['values', 'family_fit', 'lifestyle', 'career', 'location', 'communication']

export const DIMENSION_LABEL: Record<Dimension, string> = {
  values: 'Values',
  family_fit: 'Family',
  lifestyle: 'Lifestyle',
  career: 'Career',
  location: 'Location',
  communication: 'Communication',
}

/** Bar/dot colour per dimension (docs/DESIGN.md → Dimension palette). Colour follows the dimension, never its
 * rank; labels and values stay in text colours. Static class names so Tailwind sees them. */
export const DIMENSION_COLOR: Record<Dimension, string> = {
  values: 'bg-dim-values',
  family_fit: 'bg-dim-family',
  lifestyle: 'bg-dim-lifestyle',
  career: 'bg-dim-career',
  location: 'bg-dim-location',
  communication: 'bg-dim-communication',
}

/** The `n` highest-scoring dimensions, strongest first (ties keep DIMENSIONS order). */
export function topDimensions(scores: Scores, n: number): Dimension[] {
  return [...DIMENSIONS].sort((a, b) => pct(scores[b]) - pct(scores[a])).slice(0, n)
}

/** Scores are 0–100 in the contract; tolerate 0–1 in case a real phase returns fractions. */
export function pct(v: number): number {
  return Math.round(v <= 1 ? v * 100 : v)
}

type MatchStatus = PipelineItem['status']

export const STATUS: Record<MatchStatus, { label: string; tone: 'brand' | 'gold' | 'sage' | 'muted' }> = {
  queued: { label: 'In the queue', tone: 'muted' },
  screening: { label: 'Matchmakers talking', tone: 'gold' },
  briefed: { label: 'Brief ready', tone: 'brand' },
  awaiting_them: { label: 'Waiting on them', tone: 'gold' },
  focus_week: { label: 'Jodi Week', tone: 'sage' },
  locked: { label: 'Together', tone: 'sage' },
  closed: { label: 'Closed', tone: 'muted' },
}

/** Statuses for which a brief exists and can be opened. */
export const HAS_BRIEF: MatchStatus[] = ['briefed', 'awaiting_them', 'focus_week', 'locked']

export function firstName(displayName: string): string {
  return displayName.split(' ')[0]
}

export const VISIBILITY: { value: Visibility; label: string; hint: string }[] = [
  { value: 'public', label: 'Shown', hint: 'May appear on their brief about you' },
  { value: 'agent_only', label: 'Matchmaker only', hint: 'Your matchmaker uses it, but never quotes it' },
  { value: 'private', label: 'Private', hint: 'Only used to find people for you — never shared' },
]
