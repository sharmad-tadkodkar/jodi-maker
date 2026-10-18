/**
 * Fact chips pulled out of a brief's free-text snapshot. Deliberately conservative: a chip appears only when
 * its phrase is literally in the text, so it can never claim something the matchmaker didn't write.
 * (The Brief contract has no self_facts; age/city/profession come from `candidate` and are shown separately.)
 */

const ROOTS = /\b(?:roots?(?: back)? in|originally from|grew up in|hails from|hometown(?: is)?(?: in)?)\s+([A-Z][\p{L}-]+(?:\s[A-Z][\p{L}-]+)?)/u

// [pattern, chip label] — first match per label wins; order = display order.
const KEYWORDS: [RegExp, string][] = [
  [/\bearly[- ](?:morning|riser|starts?)\b/i, 'Early riser'],
  [/\bhik(?:e|es|ing)\b|\btrek(?:s|king)?\b/i, 'Hiking'],
  [/\bsketch(?:es|ing)?\b|\bpaint(?:s|ing)?\b|\bdraw(?:s|ing)\b/i, 'Art'],
  [/\bcook(?:s|ing)?\b|\bbak(?:es|ing)\b/i, 'Cooking'],
  [/\bmusic\b|\bsing(?:s|ing)\b|\bsangeet\b/i, 'Music'],
  [/\bread(?:s|ing)\b|\bbooks?\b/i, 'Reading'],
  [/\btravel(?:s|ling|ing)?\b/i, 'Travel'],
  [/\byoga\b|\bmeditat/i, 'Yoga'],
  [/\bfootball\b|\bcricket\b|\bbadminton\b|\btennis\b|\brunning\b|\bgym\b/i, 'Sport'],
  [/\bfestiv(?:e|als?)\b|\btradition/i, 'Traditions'],
  [/\bvegetarian\b|\bvegan\b/i, 'Vegetarian'],
]

export function snapshotFacts(snapshot: string, max = 5): string[] {
  const out: string[] = []
  const roots = ROOTS.exec(snapshot)
  if (roots) out.push(`Roots in ${roots[1]}`)
  for (const [re, label] of KEYWORDS) {
    if (out.length >= max) break
    if (re.test(snapshot) && !(label === 'Vegetarian' && /\bnon[- ]vegetarian\b/i.test(snapshot))) out.push(label)
  }
  return out
}

/** First sentence (or two, if the first is short) — the pull-quote. */
export function leadSentences(snapshot: string): string {
  const parts = snapshot.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [snapshot]
  const first = parts[0].trim()
  return first.length < 90 && parts[1] ? `${first} ${parts[1].trim()}` : first
}
