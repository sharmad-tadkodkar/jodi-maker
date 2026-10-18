/** One caption per film chapter (scene 1–7), in order. */
export const CAPTIONS: { eyebrow: string; text: string }[] = [
  { eyebrow: 'Where Jodi comes from', text: 'My father found matches the patient way.' },
  { eyebrow: 'He searched every day', text: 'He filtered quietly, and only a few ever glowed.' },
  { eyebrow: 'He called their family first', text: "Now your matchmaker talks to theirs — before you're ever involved." },
  { eyebrow: 'He gave me the update', text: 'You get one brief at a time. Reasons, not a feed.' },
  { eyebrow: 'Only when both said yes', text: "Contact opens only when it's mutual." },
  { eyebrow: 'One week, one person', text: 'A focused week together. Then decide, kindly and quickly.' },
  { eyebrow: 'Jodi', text: 'Jodi turns that father into a matchmaker everyone gets.' },
]

const ILLUSTRATIONS = `${import.meta.env.BASE_URL}illustrations/`

export type Step = { eyebrow: string; text: string; image?: { src: string; width: number; height: number } }

// The original five-step strip (step-1..5 illustrations). Kept for reuse; the landing now tells this story with
// the scroll film, and falls back to FilmFallback (same card styling) when the film can't run.
export const STEPS: Step[] = [
  ['He knew us deeply', 'Jodi gets to know you — and your family — in a real conversation.', 648, 549],
  ['He searched every day', 'Jodi quietly scouts and ranks people who fit what matters to you.', 512, 512],
  ['He called their family first', "Your matchmaker interviews theirs before you're ever involved.", 584, 584],
  ['He gave me the update', 'You get one brief at a time — with reasons and evidence, not a profile feed.', 537, 537],
  ['One week, one person', 'If you both say yes, you get a Jodi Week — then decide together.', 509, 509],
].map(([eyebrow, text, width, height], i) => ({
  eyebrow: eyebrow as string,
  text: text as string,
  image: { src: `${ILLUSTRATIONS}step-${i + 1}.webp`, width: width as number, height: height as number },
}))
