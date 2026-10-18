import { useEffect, useState } from 'react'
import avatarFiles from 'virtual:avatar-files'
import { api, getUserId, type Gender, type User } from '../api/client'

/** public/avatars/ (256px WebP): per-user portraits named {userId}.webp (e.g. arjun, meera), seed portraits
 * avatar-w-1..9 / avatar-m-1..9, and the two matchmaker badges. See docs/DESIGN.md → Imagery. */
const BASE = `${import.meta.env.BASE_URL}avatars/`
const SEED_COUNT = 9
const SEEDS = /^(avatar-[wm]-\d+|agent-[ab])$/
const OWN_FILE = new Set(avatarFiles.filter((f) => !SEEDS.test(f)))

/** Matchmaker badges: maroon paisley = your matchmaker, teal = theirs (DESIGN.md: brand = mine, teal = theirs). */
export const MATCHMAKER_AVATAR = {
  mine: `${BASE}agent-a.webp`,
  theirs: `${BASE}agent-b.webp`,
} as const

/** FNV-1a (32-bit): small, stable across browsers and sessions. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Portrait for a user, first match wins:
 *   1. `photoUrl` from their profile
 *   2. public/avatars/{userId}.webp, if that file exists (Arjun, Meera, any you drop in)
 *   3. a seed portrait picked from gender + hash(userId) — the same person always gets the same face
 * Returns undefined when none applies (gender unknown), so `Avatar` shows the letter. `Avatar` also falls
 * back to the letter if an image fails to load.
 */
export function avatarFor(userId: string, gender?: Gender | null, photoUrl?: string | null): string | undefined {
  if (photoUrl) return photoUrl
  if (OWN_FILE.has(userId)) return `${BASE}${userId}.webp`
  if (!gender) return undefined
  return `${BASE}avatar-${gender === 'female' ? 'w' : 'm'}-${(hash(userId) % SEED_COUNT) + 1}.webp`
}

// The viewer's own profile, fetched once per persona and shared — several screens need only their gender.
const viewers = new Map<string, Promise<User | null>>()
function loadViewer(uid: string) {
  if (!viewers.has(uid)) viewers.set(uid, api.getUser(uid).catch(() => null))
  return viewers.get(uid)!
}

/** Gender of the current persona and of the people shown to them. Candidates come from the bidirectional
 * filter, so a candidate's gender is the viewer's `seeking_gender` (CandidateSummary carries no gender). */
export function useViewerGenders(): { me?: Gender; candidates?: Gender } {
  const uid = getUserId()
  const [user, setUser] = useState<User | null>()
  useEffect(() => {
    let live = true
    loadViewer(uid).then((u) => live && setUser(u))
    return () => {
      live = false
    }
  }, [uid])
  return { me: user?.gender, candidates: user?.seeking_gender }
}
