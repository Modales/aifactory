import type { RepData } from './simulation'

export type MuscleId =
  | 'upper_chest' | 'mid_chest' | 'lower_chest'
  | 'anterior_delts' | 'lateral_delts' | 'rear_delts'
  | 'triceps_long' | 'triceps_lateral' | 'biceps_long' | 'biceps_short' | 'brachialis' | 'forearms'
  | 'rectus_abdominis' | 'obliques' | 'transverse_abdominis'
  | 'lats' | 'traps' | 'erector_spinae'
  | 'glutes' | 'hip_adductors' | 'quads' | 'hamstrings' | 'calves'

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
  upper_chest: 'Upper pectoralis', mid_chest: 'Mid pectoralis', lower_chest: 'Lower pectoralis',
  anterior_delts: 'Anterior deltoids', lateral_delts: 'Lateral deltoids', rear_delts: 'Rear deltoids',
  triceps_long: 'Triceps long head', triceps_lateral: 'Triceps lateral head',
  biceps_long: 'Biceps long head', biceps_short: 'Biceps short head', brachialis: 'Brachialis', forearms: 'Forearms',
  rectus_abdominis: 'Rectus abdominis', obliques: 'Obliques', transverse_abdominis: 'Deep core',
  lats: 'Latissimus dorsi', traps: 'Trapezius', erector_spinae: 'Erector spinae',
  glutes: 'Gluteus maximus', hip_adductors: 'Hip adductors', quads: 'Quadriceps', hamstrings: 'Hamstrings', calves: 'Calves',
}

type Demand = Partial<Record<MuscleId, number>>

/** Anatomical exercise priors, scaled by observed volume, range, tempo and form quality. */
const EXERCISE_DEMAND: Record<string, Demand> = {
  squat: { quads: 95, glutes: 88, hip_adductors: 62, rectus_abdominis: 58, obliques: 55, erector_spinae: 58, hamstrings: 48, calves: 35 },
  deadlift: { erector_spinae: 94, glutes: 84, hamstrings: 82, lats: 65, traps: 62, quads: 58, forearms: 55, rectus_abdominis: 54, obliques: 54 },
  bench: { mid_chest: 95, lower_chest: 80, upper_chest: 68, triceps_lateral: 76, triceps_long: 72, anterior_delts: 66, lats: 28 },
  ohp: { anterior_delts: 95, lateral_delts: 76, triceps_long: 78, triceps_lateral: 70, upper_chest: 38, traps: 54, rectus_abdominis: 54, obliques: 52 },
  curl: { biceps_long: 94, biceps_short: 86, brachialis: 70, forearms: 66, anterior_delts: 18 },
  lunge: { quads: 88, glutes: 86, hamstrings: 58, hip_adductors: 52, calves: 48, rectus_abdominis: 46, obliques: 46 },
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))

/**
 * Produces an anatomical workload estimate — it is not EMG, force, or injury assessment.
 * The movement determines anatomical involvement; observed repetition quality adjusts exposure.
 */
export function estimateMuscleLoad(exerciseId: string, reps: RepData[]): MuscleLoadSummary {
  const demand = EXERCISE_DEMAND[exerciseId] ?? {}
  const average = (key: keyof RepData) => reps.length
    ? reps.reduce((sum, rep) => sum + Number(rep[key] ?? 0), 0) / reps.length
    : 0
  const formSignal = clamp(average('formScore') / 100, 0.55, 1)
  const volumeSignal = clamp(reps.length / 10, 0, 1)
  const tempoSignal = clamp(average('tempo') / 3, 0.55, 1)
  const rangeScores = reps.map((rep) => clamp(rep.peakAngle / 100, 0.55, 1))
  const rangeSignal = rangeScores.length ? rangeScores.reduce((sum, value) => sum + value, 0) / rangeScores.length : 0
  const exposure = reps.length ? clamp(0.25 + volumeSignal * 0.35 + formSignal * 0.2 + tempoSignal * 0.1 + rangeSignal * 0.1) : 0

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
    disclaimer: 'Anatomical workload estimate based on the confirmed movement plus observed volume, range, tempo, and form. It is not direct EMG, force, or medical assessment.',
  }
}

export function aggregateMuscleLoad(summaries: MuscleLoadSummary[]): MuscleLoadSummary {
  const totals = new Map<MuscleId, number>()
  summaries.forEach((summary) => summary.entries.forEach((entry) => totals.set(entry.id, (totals.get(entry.id) ?? 0) + entry.score)))
  const peak = Math.max(...totals.values(), 1)
  return {
    modelVersion: '1.0', source: 'biomechanical-estimate',
    confidence: summaries.length && summaries.every((summary) => summary.confidence === 'moderate') ? 'moderate' : 'low',
    entries: [...totals.entries()].map(([id, total]) => ({ id, name: NAMES[id], score: Math.round(clamp((total / peak) * 100)), role: total / peak >= 0.7 ? 'primary' as const : 'secondary' as const })).sort((a, b) => b.score - a.score),
    disclaimer: 'Relative workout-wide anatomical demand, normalized across the logged sets. It is not direct EMG, force, or medical assessment.',
  }
}

export function emptyMuscleLoad(): MuscleLoadSummary {
  return estimateMuscleLoad('unknown', [])
}
