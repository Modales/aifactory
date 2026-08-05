export type FormToleranceMode = 'Strict' | 'Moderate' | 'Lenient'

export type ExerciseId = 'squat' | 'deadlift' | 'bench' | 'ohp' | 'curl' | 'lunge'

export interface Vector2D {
  x: number
  y: number
}

export interface JointAngles {
  knee_angle: number
  hip_angle: number
  back_angle: number
}

export interface AngleRange {
  min: number
  max: number
  ideal: number
  label: string
}

export interface ExerciseBiomechanicsTargets {
  knee?: AngleRange
  hip?: AngleRange
  back?: AngleRange
}

export interface FormToleranceResult {
  status: string
  severity: 'good' | 'warn' | 'crit'
  details: {
    knee: string
    hip: string
    back: string
  }
}

const TOLERANCE_TABLE: Record<FormToleranceMode, { knee: number; hip: number; back: number }> = {
  Strict: { knee: 8, hip: 10, back: 8 },
  Moderate: { knee: 12, hip: 15, back: 12 },
  Lenient: { knee: 16, hip: 20, back: 16 },
}

export const EXERCISE_ANGLE_TARGETS: Record<ExerciseId, ExerciseBiomechanicsTargets> = {
  squat: {
    knee: { min: 85, max: 105, ideal: 90, label: 'Knee depth' },
    hip: { min: 95, max: 115, ideal: 100, label: 'Hip depth' },
    back: { min: 25, max: 45, ideal: 35, label: 'Torso angle' },
  },
  deadlift: {
    knee: { min: 65, max: 85, ideal: 75, label: 'Knee bend' },
    hip: { min: 100, max: 125, ideal: 110, label: 'Hip hinge' },
    back: { min: 35, max: 48, ideal: 42, label: 'Torso angle' },
  },
  bench: {
    knee: undefined,
    hip: undefined,
    back: undefined,
  },
  ohp: {
    knee: { min: 70, max: 95, ideal: 80, label: 'Knee bend' },
    hip: { min: 85, max: 108, ideal: 95, label: 'Hip stability' },
    back: { min: 20, max: 35, ideal: 28, label: 'Torso lean' },
  },
  curl: {
    knee: undefined,
    hip: undefined,
    back: undefined,
  },
  lunge: {
    knee: { min: 88, max: 102, ideal: 95, label: 'Front knee depth' },
    hip: { min: 98, max: 112, ideal: 105, label: 'Front hip depth' },
    back: { min: 25, max: 40, ideal: 33, label: 'Torso angle' },
  },
}

export function computeJointAngle(a: Vector2D, vertex: Vector2D, b: Vector2D): number {
  const v1x = a.x - vertex.x
  const v1y = a.y - vertex.y
  const v2x = b.x - vertex.x
  const v2y = b.y - vertex.y

  const dot = v1x * v2x + v1y * v2y
  const magnitude1 = Math.hypot(v1x, v1y)
  const magnitude2 = Math.hypot(v2x, v2y)

  if (magnitude1 === 0 || magnitude2 === 0) return 0

  const cosine = Math.max(-1, Math.min(1, dot / (magnitude1 * magnitude2)))
  return (Math.acos(cosine) * 180) / Math.PI
}

function scoreJointAgainstRange(
  value: number,
  range: AngleRange,
  mode: FormToleranceMode,
  idealLabel: string,
): { status: string; detail: string; isIdeal: boolean } {
  const threshold = TOLERANCE_TABLE[mode]
  const centerDelta = Math.abs(value - range.ideal)

  if (centerDelta <= threshold.knee) {
    return {
      status: `${idealLabel.toUpperCase()} ON TARGET`,
      detail: `${range.label} within ±${threshold.knee}° of ideal`,
      isIdeal: true,
    }
  }

  if (value < range.min - threshold.knee) {
    return {
      status: `${range.label.toUpperCase()} TOO LOW`,
      detail: `${range.label} below target range — increase motion`,
      isIdeal: false,
    }
  }

  if (value > range.max + threshold.knee) {
    return {
      status: `${range.label.toUpperCase()} TOO HIGH`,
      detail: `${range.label} above target range — reduce motion`,
      isIdeal: false,
    }
  }

  return {
    status: `${range.label.toUpperCase()} ACCEPTABLE`,
    detail: `${range.label} is inside the acceptable range but not at the ideal angle`,
    isIdeal: false,
  }
}

export function evaluateFormTolerance({
  mode,
  knee_angle,
  hip_angle,
  back_angle,
}: { mode: FormToleranceMode } & JointAngles): FormToleranceResult {
  const thresholds = TOLERANCE_TABLE[mode]
  const statusParts: string[] = []
  const details = { knee: '', hip: '', back: '' }

  if (Math.abs(knee_angle - 90) <= thresholds.knee) {
    statusParts.push('PERFECT DEPTH')
    details.knee = `Knee depth within ±${thresholds.knee}° of target`
  } else if (knee_angle < 90 - thresholds.knee) {
    details.knee = 'Knee angle too shallow — increase depth'
  } else {
    details.knee = 'Knee angle too deep — reduce depth'
  }

  if (Math.abs(hip_angle - 100) <= thresholds.hip) {
    statusParts.push('HIP STACKED')
    details.hip = `Hip angle within ±${thresholds.hip}° of target`
  } else if (hip_angle < 100 - thresholds.hip) {
    details.hip = 'Hip angle collapsing — drive hips back'
  } else {
    details.hip = 'Hip angle too extended — stay balanced'
  }

  if (Math.abs(back_angle - 35) <= thresholds.back) {
    statusParts.push('BACK NEUTRAL')
    details.back = `Back angle within ±${thresholds.back}° of target`
  } else if (back_angle > 35 + thresholds.back) {
    details.back = 'Back angle too extended — keep torso neutral'
  } else {
    details.back = 'Back angle too flexed — brace and lift'
  }

  let severity: FormToleranceResult['severity'] = 'good'
  if (statusParts.length < 2) severity = 'warn'
  if (statusParts.length === 0) severity = 'crit'

  return {
    status: statusParts.length ? statusParts.join(' • ') : 'FORM ALERT',
    severity,
    details,
  }
}

export function evaluateExerciseFormTolerance({
  mode,
  exerciseId,
  knee_angle,
  hip_angle,
  back_angle,
}: { mode: FormToleranceMode; exerciseId: ExerciseId } & JointAngles): FormToleranceResult {
  const targetMap = EXERCISE_ANGLE_TARGETS[exerciseId]
  const details = { knee: '', hip: '', back: '' }
  const statusParts: string[] = []

  const scoreField = (key: 'knee' | 'hip' | 'back', value: number) => {
    const target = targetMap[key]
    if (!target) {
      details[key] = `${key.toUpperCase()} not scored for ${exerciseId}`
      return
    }

    const result = scoreJointAgainstRange(value, target, mode, key === 'knee' ? 'PERFECT DEPTH' : key === 'hip' ? 'HIP STACKED' : 'BACK NEUTRAL')
    details[key] = result.detail
    if (result.isIdeal) statusParts.push(result.status)
  }

  scoreField('knee', knee_angle)
  scoreField('hip', hip_angle)
  scoreField('back', back_angle)

  let severity: FormToleranceResult['severity'] = 'good'
  if (statusParts.length < 1) severity = 'warn'
  if (statusParts.length === 0) severity = 'crit'

  return {
    status: statusParts.length ? statusParts.join(' • ') : 'FORM ALERT',
    severity,
    details,
  }
}

export function computeSpeedDecay(velocities: number[]): number {
  if (velocities.length < 2) return 0

  const first = velocities[0]
  const last = velocities[velocities.length - 1]
  if (first <= 0) return 0

  return Math.max(0, Math.min(100, ((first - last) / first) * 100))
}

export function computeFacialColorShift(
  before: { r: number; g: number; b: number },
  after: { r: number; g: number; b: number },
): number {
  const deltaR = Math.abs(after.r - before.r)
  const deltaG = Math.abs(after.g - before.g)
  const deltaB = Math.abs(after.b - before.b)

  const rgbDistance = Math.sqrt(deltaR ** 2 + deltaG ** 2 + deltaB ** 2)
  const maxDistance = Math.sqrt(255 ** 2 * 3)

  return Math.max(0, Math.min(100, (rgbDistance / maxDistance) * 100))
}

export function computeEffortIndex({
  speedDecayPct,
  facialColorShiftPct,
  formScore,
}: {
  speedDecayPct: number
  facialColorShiftPct: number
  formScore: number
}): { value: number; level: 'LOW' | 'MODERATE' | 'HIGH'; confidence: number } {
  const weighted =
    0.45 * Math.max(0, Math.min(100, speedDecayPct)) +
    0.35 * Math.max(0, Math.min(100, facialColorShiftPct)) +
    0.2 * Math.max(0, Math.min(100, 100 - formScore))

  const value = Math.max(0, Math.min(100, Math.round(weighted)))

  let level: 'LOW' | 'MODERATE' | 'HIGH' = 'LOW'
  if (value >= 60) level = 'HIGH'
  else if (value >= 35) level = 'MODERATE'

  const confidence = Math.max(0, Math.min(100, Math.round((value + (100 - formScore)) / 2)))

  return { value, level, confidence }
}
