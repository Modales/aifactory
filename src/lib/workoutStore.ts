import { useState } from 'react'
import type { RepData, CameraAngle } from './simulation'

export interface UserSettings {
  cameraAnglePreference: CameraAngle | 'Auto'
  sensitivity: 'Strict' | 'Standard' | 'Lenient'
  effortAlertThreshold: number
  audioFeedback: boolean
}

export interface OnboardingData {
  completed: boolean
  fitnessLevel: 'Beginner' | 'Intermediate' | 'Advanced'
  targetExercises: string[]
  focusAreas: string[]
  sensitivity: 'Strict' | 'Standard' | 'Lenient'
}

export interface StoredSession {
  id: string
  timestamp: string
  exerciseName: string
  exerciseId: string
  cameraAngle: CameraAngle
  durationSeconds: number
  totalReps: number
  avgFormScore: number
  peakEffort: number
  reps: RepData[]
}

const SETTINGS_STORAGE_KEY = 'aifactory_user_settings'
const HISTORY_STORAGE_KEY = 'aifactory_session_history'
const ONBOARDING_STORAGE_KEY = 'aifactory_onboarding_data'

export const DEFAULT_SETTINGS: UserSettings = {
  cameraAnglePreference: 'Auto',
  sensitivity: 'Standard',
  effortAlertThreshold: 85,
  audioFeedback: true,
}

export const DEFAULT_ONBOARDING: OnboardingData = {
  completed: false,
  fitnessLevel: 'Intermediate',
  targetExercises: ['squat', 'bench', 'deadlift'],
  focusAreas: ['Technique', 'Strength'],
  sensitivity: 'Standard',
}

export const SAMPLE_HISTORICAL_SESSIONS: StoredSession[] = [
  {
    id: 'sess_sample_1',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    exerciseName: 'Back Squat',
    exerciseId: 'squat',
    cameraAngle: 'Side',
    durationSeconds: 145,
    totalReps: 5,
    avgFormScore: 92,
    peakEffort: 84,
    reps: [
      { rep: 1, tempo: 2.4, concentricTime: 1.1, eccentricTime: 1.3, peakAngle: 88, velocity: 164, formScore: 96, effort: 52, cue: 'Great depth & control — rep locked in', severity: 'good' },
      { rep: 2, tempo: 2.6, concentricTime: 1.2, eccentricTime: 1.4, peakAngle: 90, velocity: 150, formScore: 94, effort: 60, cue: 'Great depth & control — rep locked in', severity: 'good' },
      { rep: 3, tempo: 2.8, concentricTime: 1.3, eccentricTime: 1.5, peakAngle: 92, velocity: 138, formScore: 90, effort: 70, cue: 'Acceptable range — drive through heels', severity: 'warn' },
      { rep: 4, tempo: 3.1, concentricTime: 1.5, eccentricTime: 1.6, peakAngle: 94, velocity: 120, formScore: 88, effort: 78, cue: 'Acceptable range — drive through heels', severity: 'warn' },
      { rep: 5, tempo: 3.5, concentricTime: 1.8, eccentricTime: 1.7, peakAngle: 96, velocity: 100, formScore: 84, effort: 84, cue: 'Shallow depth — hit full range of motion', severity: 'crit' },
    ],
  },
  {
    id: 'sess_sample_2',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    exerciseName: 'Bench Press',
    exerciseId: 'bench',
    cameraAngle: 'Side',
    durationSeconds: 110,
    totalReps: 6,
    avgFormScore: 95,
    peakEffort: 78,
    reps: [
      { rep: 1, tempo: 2.1, concentricTime: 0.9, eccentricTime: 1.2, peakAngle: 86, velocity: 200, formScore: 98, effort: 45, cue: 'Great depth & control — rep locked in', severity: 'good' },
      { rep: 2, tempo: 2.2, concentricTime: 1.0, eccentricTime: 1.2, peakAngle: 88, velocity: 180, formScore: 96, effort: 52, cue: 'Great depth & control — rep locked in', severity: 'good' },
      { rep: 3, tempo: 2.4, concentricTime: 1.1, eccentricTime: 1.3, peakAngle: 89, velocity: 163, formScore: 95, effort: 61, cue: 'Great depth & control — rep locked in', severity: 'good' },
      { rep: 4, tempo: 2.5, concentricTime: 1.1, eccentricTime: 1.4, peakAngle: 91, velocity: 163, formScore: 94, effort: 68, cue: 'Great depth & control — rep locked in', severity: 'good' },
      { rep: 5, tempo: 2.7, concentricTime: 1.2, eccentricTime: 1.5, peakAngle: 92, velocity: 150, formScore: 92, effort: 74, cue: 'Acceptable range — drive through heels', severity: 'warn' },
      { rep: 6, tempo: 3.0, concentricTime: 1.4, eccentricTime: 1.6, peakAngle: 93, velocity: 128, formScore: 90, effort: 78, cue: 'Acceptable range — drive through heels', severity: 'warn' },
    ],
  },
  {
    id: 'sess_sample_3',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    exerciseName: 'Deadlift',
    exerciseId: 'deadlift',
    cameraAngle: 'Three-quarter',
    durationSeconds: 160,
    totalReps: 4,
    avgFormScore: 89,
    peakEffort: 88,
    reps: [
      { rep: 1, tempo: 2.5, concentricTime: 1.1, eccentricTime: 1.4, peakAngle: 72, velocity: 163, formScore: 94, effort: 55, cue: 'Great depth & control — rep locked in', severity: 'good' },
      { rep: 2, tempo: 2.8, concentricTime: 1.3, eccentricTime: 1.5, peakAngle: 75, velocity: 138, formScore: 90, effort: 67, cue: 'Acceptable range — drive through heels', severity: 'warn' },
      { rep: 3, tempo: 3.2, concentricTime: 1.5, eccentricTime: 1.7, peakAngle: 78, velocity: 120, formScore: 88, effort: 79, cue: 'Acceptable range — drive through heels', severity: 'warn' },
      { rep: 4, tempo: 3.8, concentricTime: 1.9, eccentricTime: 1.9, peakAngle: 82, velocity: 94, formScore: 84, effort: 88, cue: 'Shallow depth — hit full range of motion', severity: 'crit' },
    ],
  },
]

export function getStoredSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveStoredSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save settings to localStorage', e)
  }
}

export function getStoredOnboarding(): OnboardingData {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    return raw ? { ...DEFAULT_ONBOARDING, ...JSON.parse(raw) } : DEFAULT_ONBOARDING
  } catch {
    return DEFAULT_ONBOARDING
  }
}

export function saveStoredOnboarding(data: OnboardingData): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(data))
    const currentSettings = getStoredSettings()
    saveStoredSettings({ ...currentSettings, sensitivity: data.sensitivity })
  } catch (e) {
    console.error('Failed to save onboarding data to localStorage', e)
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
  } catch (e) {
    console.error('Failed to reset onboarding', e)
  }
}

export function getSessionHistory(): StoredSession[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(SAMPLE_HISTORICAL_SESSIONS))
    return SAMPLE_HISTORICAL_SESSIONS
  } catch {
    return SAMPLE_HISTORICAL_SESSIONS
  }
}

export function saveSessionToHistory(session: Omit<StoredSession, 'id' | 'timestamp'>): StoredSession {
  const newSession: StoredSession = {
    ...session,
    id: `sess_${Date.now()}`,
    timestamp: new Date().toISOString(),
  }
  try {
    const history = getSessionHistory()
    const updated = [newSession, ...history].slice(0, 15)
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated))
  } catch (e) {
    console.error('Failed to save session history', e)
  }
  return newSession
}

export function clearSessionHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY)
  } catch (e) {
    console.error('Failed to clear session history', e)
  }
}

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings>(getStoredSettings)

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings }
      saveStoredSettings(updated)
      return updated
    })
  }

  return { settings, updateSettings }
}
