/**
 * Typed API client for the Jodi backend.
 *
 * Types come from `schema.ts`, which is GENERATED from the backend's OpenAPI contract —
 * never edit it by hand. When the backend contract changes, run `npm run gen:api`.
 * Every page should call the backend through the functions below, never raw fetch.
 */
import type { components } from './schema'

type S = components['schemas']
export type User = S['User']
export type Aspect = S['Aspect']
export type AspectPatch = S['AspectPatch']
export type HardCriteriaPatch = S['HardCriteriaPatch']
export type IntakeMessage = S['IntakeMessage']
export type IntakeMessageResponse = S['IntakeMessageResponse']
export type LearningEntry = S['LearningEntry']
export type Job = S['Job']
export type PipelineResponse = S['PipelineResponse']
export type PipelineItem = S['PipelineItem']
export type CandidateSummary = S['CandidateSummary']
export type Scores = S['Scores']
export type InterviewResponse = S['InterviewResponse']
export type InterviewTurn = S['InterviewTurn']
export type Brief = S['Brief']
export type Match = S['Match']
export type DecisionResponse = S['DecisionResponse']
export type LearningResult = S['LearningResult']
export type FocusState = S['FocusState']
export type ChatMessage = S['ChatMessage']
export type FocusDecisionResponse = S['FocusDecisionResponse']
export type Persona = S['Persona']
export type DemoState = S['DemoState']
export type InterviewStarted = S['InterviewStarted']
export type Gender = User['gender']
export type Visibility = Aspect['visibility']

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

// ---- Current persona (hackathon auth = X-User-Id header) ----
const USER_KEY = 'jodi.userId'
export function getUserId(): string {
  try {
    return localStorage.getItem(USER_KEY) ?? 'arjun'
  } catch {
    return 'arjun'
  }
}
export function setUserId(id: string) {
  try {
    localStorage.setItem(USER_KEY, id)
  } catch {
    /* private mode — persona just won't persist */
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

/** Poll a background job (scout, interview) until done. `onProgress` fires on every poll. */
export async function waitForJob(jobId: string, onProgress?: (job: Job) => void): Promise<Job> {
  for (;;) {
    const job = await req<Job>('GET', `/jobs/${jobId}`)
    onProgress?.(job)
    if (job.status === 'done') return job
    if (job.status === 'error') throw new Error(job.error ?? 'job failed')
    await new Promise((r) => setTimeout(r, 1500))
  }
}

export const api = {
  // Onboarding & profile — screens: /onboard, /me
  createUser: (name: string, gender: Gender) => req<User>('POST', '/users', { name, gender, role: 'candidate' }),
  getUser: (userId: string) => req<User>('GET', `/users/${userId}`),
  getAspects: (userId: string) => req<Aspect[]>('GET', `/users/${userId}/aspects`),
  patchAspect: (userId: string, aspectId: string, patch: AspectPatch) =>
    req<Aspect>('PATCH', `/users/${userId}/aspects/${aspectId}`, patch),
  deleteAspect: (userId: string, aspectId: string) => req('DELETE', `/users/${userId}/aspects/${aspectId}`),
  patchHardCriteria: (userId: string, patch: HardCriteriaPatch) =>
    req<User>('PATCH', `/users/${userId}/hard-criteria`, patch),
  wipeData: (userId: string) => req('DELETE', `/users/${userId}/data`),
  getLearning: (userId: string) => req<LearningEntry[]>('GET', `/users/${userId}/learning`),
  getIntakeMessages: (userId: string) => req<IntakeMessage[]>('GET', `/intake/${userId}/messages`),
  sendIntakeMessage: (userId: string, text: string) =>
    req<IntakeMessageResponse>('POST', `/intake/${userId}/message`, { text }),

  // Matching — screens: /pipeline, /brief/:matchId, /brief/:matchId/transcript
  runScout: (userId: string) => req<{ job_id: string }>('POST', `/scout/${userId}`),
  getPipeline: (userId: string) => req<PipelineResponse>('GET', `/pipeline/${userId}`),
  runInterview: (matchId: string, instructions?: string) =>
    req<{ job_id: string }>('POST', `/matches/${matchId}/interview`, { instructions }),
  getInterview: (matchId: string) => req<InterviewResponse>('GET', `/matches/${matchId}/interview`),
  getBrief: (matchId: string, userId: string) => req<Brief>('GET', `/matches/${matchId}/brief/${userId}`),
  getNextBrief: (userId: string) => req<Brief | null>('GET', `/briefs/next/${userId}`),
  decide: (matchId: string, userId: string, decision: 'interested' | 'pass', reason?: string) =>
    req<DecisionResponse>('POST', `/matches/${matchId}/decision`, { user_id: userId, decision, reason }),
  getMatch: (matchId: string) => req<Match>('GET', `/matches/${matchId}`),

  // Focus Week — screens: /mutual/:matchId, /focus/:matchId
  getFocus: (matchId: string) => req<FocusState>('GET', `/focus/${matchId}`),
  getChat: (matchId: string) => req<ChatMessage[]>('GET', `/focus/${matchId}/chat`),
  sendChat: (matchId: string, senderId: string, text: string) =>
    req<ChatMessage>('POST', `/focus/${matchId}/chat`, { sender_id: senderId, text }),
  focusDecide: (matchId: string, userId: string, decision: 'continue' | 'stop' | 'extend', reason?: string) =>
    req<FocusDecisionResponse>('POST', `/focus/${matchId}/decision`, { user_id: userId, decision, reason }),

  // Demo — screen: /demo
  personas: () => req<Persona[]>('GET', '/demo/personas'),
  seed: (count = 20) => req('POST', '/demo/seed', { count }),
  /** soft = ~2 s: restore matches + heroes' starting state (use between takes). Full = ~15–20 s reseed. */
  reset: (soft = false) => req('POST', `/demo/reset${soft ? '?soft=true' : ''}`),
  simulateResponse: (matchId: string, userId: string, decision: 'interested' | 'pass') =>
    req<DecisionResponse>('POST', '/demo/simulate-response', { match_id: matchId, user_id: userId, decision }),
  fastForward: (matchId: string, day: number) =>
    req<FocusState>('POST', '/demo/fast-forward', { match_id: matchId, day }),
  newProfile: () => req<CandidateSummary>('POST', '/demo/new-profile'),
  /** One-glance status for the demo panel: heroes' status, Focus Week day, queue size, next brief. */
  demoState: () => req<DemoState>('GET', '/demo/state'),
  /** "Run interview for top candidate now" — live (~2 min); poll getInterview(result.match_id). */
  interviewTop: (userId: string) => req<InterviewStarted>('POST', `/demo/interview-top/${userId}`),
  /** Re-run an already-finished interview live (e.g. the pre-computed Arjun–Meera one). */
  rerunInterview: (matchId: string) => req<{ job_id: string }>('POST', `/matches/${matchId}/interview?rerun=true`, {}),
}
