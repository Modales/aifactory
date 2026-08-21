import type { RepData } from './simulation'

export type MuscleId =
  | 'chest'
  | 'front_delts'
  | 'triceps'
  | 'biceps'
  | 'forearms'
  | 'core'
  | 'lats'
  | 'erector_spinae'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves'

export interface MuscleLoadEntry {
  id: MuscleId
  name: string
  score: number
  role: 'primary' | 'secondary'
}

export interface MuscleLoadSummary {
  modelVersion: '1.0'
  source: 'biomechanical-estimate'
  confidence: 'moderate' | 'low'
  entries: MuscleLoadEntry[]
  disclaimer: string
}

const NAMES: Record<MuscleId, string> = {
  chest: 'Chest',
  front_delts: 'Front delts',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Forearms',
  core: 'Core',
  lats: 'Lats',
  erector_spinae: 'Erector spinae',
  glutes: 'Glutes',
  quads: 'Quadriceps',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
}

/** Relative exercise demand, informed by biomechanical and EMG literature. */
const EXERCISE_DEMAND: Record<string, Partial<Record<MuscleId, number>>> = {
  squat: { quads: 95, glutes: 86, core: 65, erector_spinae: 58, hamstrings: 46, calves: 35 },
  deadlift: { erector_spinae: 92, quads: 78, hamstrings: 76, glutes: 74, core: 68, lats: 58, forearms: 55 },
  bench: { chest: 95, triceps: 78, front_delts: 68, lats: 30 },
  ohp: { front_delts: 95, triceps: 80, core: 68, chest: 42, erector_spinae: 36 },
  curl: { biceps: 95, forearms: 66, front_delts: 28 },
  lunge: { quads: 90, glutes: 86, hamstrings: 58, calves: 48, core: 45 },
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))

/**
 * Estimates relative training demand; it does not measure activation or force.
 * Confirmed exercise defines the anatomical prior, while completed rep count,
 * observed peak-angle consistency, and form quality scale the workout exposure.
 */
export function estimateMuscleLoad(exerciseId: string, reps: RepData[]): MuscleLoadSummary {
  const demand = EXERCISE_DEMAND[exerciseId] ?? {}
  const avgForm = reps.length ? reps.reduce((sum, rep) => sum + rep.formScore, 0) / reps.length : 0
  const volumeSignal = clamp(reps.length / 8, 0, 1)
  const meanPeak = reps.length ? reps.reduce((sum, rep) => sum + rep.peakAngle, 0) / reps.length : 0
  const peakVariation = reps.length > 1
    ? Math.sqrt(reps.reduce((sum, rep) => sum + (rep.peakAngle - meanPeak) ** 2, 0) / reps.length)
    : 20
  const consistencySignal = clamp(1 - peakVariation / 30, 0, 1)
  const exposure = reps.length
    ? 0.45 + volumeSignal * 0.25 + (avgForm / 100) * 0.2 + consistencySignal * 0.1
    : 0

  const entries = Object.entries(demand)
    .map(([id, baseline]) => ({
      id: id as MuscleId,
      name: NAMES[id as MuscleId],
      score: Math.round(clamp((baseline ?? 0) * exposure)),
      role: (baseline ?? 0) >= 70 ? 'primary' as const : 'secondary' as const,
    }))
    .sort((a, b) => b.score - a.score)

  return {
    modelVersion: '1.0',
    source: 'biomechanical-estimate',
    confidence: reps.length >= 3 ? 'moderate' : 'low',
    entries,
    disclaimer: 'Estimated training demand from confirmed exercise, observed joint motion, rep volume, and form—not a direct EMG or muscle-force measurement.',
  }
}

export function emptyMuscleLoad(): MuscleLoadSummary {
  return estimateMuscleLoad('unknown', [])
}
