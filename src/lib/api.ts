import type { RepData } from './simulation'
import type { MuscleLoadSummary } from './muscleModel'

export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:4000'

const TOKEN_STORAGE_KEY = 'aifactory_access_token'

export interface PublicUser {
  id: string
  email: string
  displayName: string
  createdAt: string
}

export interface AuthToken {
  accessToken: string
  tokenType: 'bearer'
  expiresInMinutes: number
  user: PublicUser
}

export interface HistoryItem {
  id: string
  exerciseId: string
  exerciseName: string
  cameraAngle: string
  durationSeconds: number
  totalReps: number
  avgFormScore: number
  peakEffort: number
  muscleLoad: MuscleLoadSummary
  createdAt: string
}

export interface HistoryPage {
  items: HistoryItem[]
  total: number
  limit: number
  offset: number
}

export interface ExerciseBreakdown {
  exerciseId: string
  exerciseName: string
  sessions: number
  totalReps: number
  avgFormScore: number
  bestFormScore: number
}

export interface HistoryStats {
  totalSessions: number
  totalReps: number
  totalDurationSeconds: number
  avgFormScore: number
  peakEffort: number
  topFlaws: [string, number][]
  byExercise: ExerciseBreakdown[]
  lastSessionAt: string | null
}

export interface SocialAuthor {
  id: string
  displayName: string
}

export interface SocialActivity {
  id: string
  author: SocialAuthor
  caption: string
  visibility: 'public' | 'followers'
  workout: { exerciseId: string; exerciseName: string; totalReps: number; durationSeconds: number; avgFormScore: number; muscleLoad: MuscleLoadSummary } | null
  reactionCount: number
  commentCount: number
  reactedByMe: boolean
  createdAt: string
}

export interface SocialFeed {
  items: SocialActivity[]
  limit: number
  offset: number
}

export interface SocialClub {
  id: string
  name: string
  description: string
  isPrivate: boolean
  memberCount: number
  joined: boolean
  createdAt: string
}

export interface SocialChallenge {
  id: string
  name: string
  description: string
  metric: 'reps' | 'sessions' | 'durationSeconds'
  startsAt: string
  endsAt: string
  participantCount: number
  joined: boolean
}

export interface CoachSummary {
  jobId: string
  sessionId: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  model: string | null
  headline: string | null
  summary: string | null
  focusAreas: string[]
  nextSession: string | null
  error: string | null
  createdAt: string
  completedAt: string | null
}

export interface TelemetryLog {
  sessionId: string
  exerciseId: string
  exerciseName: string
  recordedAt: string
  muscleLoad: MuscleLoadSummary
  reps: RepData[]
  flawCounts: Record<string, number>
}

export interface SessionPayload {
  exerciseId: string
  exerciseName: string
  cameraAngle: string
  durationSeconds: number
  totalReps: number
  avgFormScore: number
  peakEffort: number
  muscleLoad: MuscleLoadSummary
  reps: RepData[]
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_STORAGE_KEY)
    else localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch (e) {
    console.error('Failed to persist access token', e)
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const { method = 'GET', body, token = getStoredToken() } = options

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, `Cannot reach the API at ${API_BASE_URL}`)
  }

  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    const detail = (data as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string }
      if (typeof first.msg === 'string') return first.msg
    }
  } catch {
    // falls through to the generic message below
  }
  return res.status === 401 ? 'Your session has expired. Sign in again.' : `Request failed (${res.status})`
}

export const api = {
  signup: (email: string, password: string, displayName: string) =>
    request<AuthToken>('/api/auth/signup', {
      method: 'POST',
      body: { email, password, displayName },
      token: null,
    }),

  login: (email: string, password: string) =>
    request<AuthToken>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      token: null,
    }),

  me: (token?: string) => request<PublicUser>('/api/auth/me', { token }),

  saveSession: (payload: SessionPayload) =>
    request<{ id: string; createdAt: string }>('/api/workout/session', {
      method: 'POST',
      body: payload,
    }),

  history: (params: { limit?: number; offset?: number; exerciseId?: string } = {}) => {
    const query = new URLSearchParams()
    if (params.limit !== undefined) query.set('limit', String(params.limit))
    if (params.offset !== undefined) query.set('offset', String(params.offset))
    if (params.exerciseId) query.set('exerciseId', params.exerciseId)
    const suffix = query.toString() ? `?${query}` : ''
    return request<HistoryPage>(`/api/workouts/history${suffix}`)
  },

  stats: () => request<HistoryStats>('/api/workouts/stats'),

  telemetry: (sessionId: string) =>
    request<TelemetryLog>(`/api/workouts/history/${sessionId}/telemetry`),

  generateSummary: (sessionId: string) =>
    request<CoachSummary>('/api/workout/generate-summary', {
      method: 'POST',
      body: { sessionId },
    }),

  summaryJob: (jobId: string) =>
    request<CoachSummary>(`/api/workout/generate-summary/${jobId}`),
  socialFeed: () => request<SocialFeed>('/api/social/feed'),
  clubs: () => request<SocialClub[]>('/api/social/clubs'),
  challenges: () => request<SocialChallenge[]>('/api/social/challenges'),
  reactToActivity: (activityId: string) =>
    request<SocialActivity>(`/api/social/activities/${activityId}/reaction`, { method: 'PUT' }),
  joinClub: (clubId: string) =>
    request<SocialClub>(`/api/social/clubs/${clubId}/membership`, { method: 'PUT' }),
  joinChallenge: (challengeId: string) =>
    request<SocialChallenge>(`/api/social/challenges/${challengeId}/participation`, { method: 'PUT' }),
}

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 90_000

export async function waitForCoachSummary(
  jobId: string,
  isCancelled: () => boolean = () => false,
): Promise<CoachSummary> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  for (;;) {
    const job = await api.summaryJob(jobId)
    if (isCancelled()) return job
    if (job.status === 'complete' || job.status === 'failed') return job
    if (Date.now() > deadline) {
      return { ...job, status: 'failed', error: 'Timed out waiting for the coach summary' }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    if (isCancelled()) return job
  }
}
