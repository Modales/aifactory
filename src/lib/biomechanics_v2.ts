export type FormToleranceMode = 'Strict' | 'Moderate' | 'Lenient'
export type FormSensitivityMode = 'Strict' | 'Standard' | 'Lenient'

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
  Strict: { knee: 10, hip: 12, back: 10 },
  Moderate: { knee: 14, hip: 17, back: 14 },
  Lenient: { knee: 18, hip: 22, back: 18 },
}

export function normalizeFormToleranceMode(mode: FormSensitivityMode | FormToleranceMode): FormToleranceMode {
  if (mode === 'Standard') return 'Moderate'
  return mode === 'Strict' || mode === 'Moderate' || mode === 'Lenient' ? mode : 'Moderate'
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

export type FlawDirection = 'under' | 'over'

/**
 * Coaching phrasing for a joint outside its target band, in two tiers: `mild`
 * for a small miss, `severe` for a large one. Deliberately exercise- and
 * joint-agnostic (no claims like "you're squatting a good morning") since the
 * angle geometry alone doesn't tell us the movement pattern behind a miss —
 * the {label} placeholder keeps each line grounded in the joint's own name.
 * Plain coaching language only: the lifter sees a key message, not the raw
 * degree numbers behind it (those still drive which line gets picked, via
 * describeJointFlaw's direction/magnitude classification below).
 */
const FLAW_TEMPLATES: Record<FlawDirection, { mild: string[]; severe: string[] }> = {
  under: {
    mild: [
      '{label} just short of target — a little more range',
      'Close on {label} — ease a touch further',
      '{label} a bit shy of target',
    ],
    severe: [
      '{label} well short of target — chase the full range',
      '{label} cutting it short — go noticeably further',
      'Stopping well before target on {label}',
    ],
  },
  over: {
    mild: [
      '{label} just past target — ease back slightly',
      'Slightly over on {label} — back off a touch',
      '{label} a hair beyond target',
    ],
    severe: [
      '{label} well past target — reduce the motion',
      '{label} overshooting — reel it back in',
      'Well beyond target on {label}',
    ],
  },
}

/** Deviation past the edge of the band, past which a miss reads as "severe" rather than "mild". */
const SEVERE_OVERSHOOT_RATIO = 0.6

/**
 * Builds a varied, magnitude-aware coaching line for a joint that landed
 * outside its target band — a single fixed sentence per (joint, direction)
 * pair reads as a broken record, so this picks from a small pool of plain-
 * language phrasings instead. `variantSeed` (e.g. the rep number) rotates
 * through the pool so consecutive reps with the same flaw don't read
 * identically. Returns null when the joint is in range.
 */
export function describeJointFlaw({
  range,
  value,
  variantSeed,
}: {
  range: AngleRange
  value: number
  variantSeed: number
}): string | null {
  if (value >= range.min && value <= range.max) return null

  const direction: FlawDirection = value < range.min ? 'under' : 'over'
  const halfRange = Math.max(1, (range.max - range.min) / 2)
  const overshoot = direction === 'under' ? range.min - value : value - range.max
  const tier = overshoot / halfRange >= SEVERE_OVERSHOOT_RATIO ? 'severe' : 'mild'

  const pool = FLAW_TEMPLATES[direction][tier]
  const template = pool[((variantSeed % pool.length) + pool.length) % pool.length]

  return template.replaceAll('{label}', range.label)
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

    const result = scoreJointAgainstRange(
      value,
      target,
      mode,
      key === 'knee' ? 'PERFECT DEPTH' : key === 'hip' ? 'HIP STACKED' : 'BACK NEUTRAL',
    )

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

export function buildRepAnalysis({
  exerciseId,
  mode,
  knee_angle,
  hip_angle,
  back_angle,
  speedDecayPct,
  facialColorShiftPct,
  formScore,
}: {
  exerciseId: ExerciseId
  mode: FormToleranceMode
  speedDecayPct: number
  facialColorShiftPct?: number | null
  formScore: number
} & JointAngles): {
  formResult: FormToleranceResult
  effortResult: ReturnType<typeof computeEffortIndex>
  formScore: number
  effortScore: number
  severity: 'good' | 'warn' | 'crit'
} {
  const formResult = evaluateExerciseFormTolerance({
    mode,
    exerciseId,
    knee_angle,
    hip_angle,
    back_angle,
  })

  const effortResult = computeEffortIndex({
    speedDecayPct,
    facialColorShiftPct,
    formScore,
  })

  const severity: 'good' | 'warn' | 'crit' =
    formResult.severity === 'crit' || effortResult.level === 'HIGH'
      ? 'crit'
      : formResult.severity === 'warn' || effortResult.level === 'MODERATE'
        ? 'warn'
        : 'good'

  return {
    formResult,
    effortResult,
    formScore,
    effortScore: effortResult.value,
    severity,
  }
}

/** Window size for the baseline/recent averages in {@link computeSpeedDecay}. */
const SPEED_DECAY_WINDOW = 3

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Compares a lifter's recent rep velocity against their early-set baseline.
 *
 * Both ends are averaged over a short window (rather than read from a single
 * rep) so one noisy or mistimed rep doesn't swing the decay reading — a single
 * bad "last" sample used to spike this to a false decay, and a single unlucky
 * first rep used to permanently mis-anchor the baseline for the whole set.
 */
export function computeSpeedDecay(velocities: number[]): number {
  if (velocities.length < 2) return 0

  const baselineSize = Math.min(SPEED_DECAY_WINDOW, Math.max(1, Math.floor(velocities.length / 2)))
  const recentSize = Math.min(SPEED_DECAY_WINDOW, velocities.length - baselineSize)

  const baseline = average(velocities.slice(0, baselineSize))
  const recent = average(velocities.slice(-recentSize))
  if (baseline <= 0) return 0

  return Math.max(0, Math.min(100, ((baseline - recent) / baseline) * 100))
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

/**
 * Base fusion weights, calibrated assuming all three signals are present.
 * When a signal is unavailable it must be dropped and the rest renormalized
 * over their own total — never substituted with a raw 0, which understates
 * effort by exactly that signal's weight (e.g. capping the score at 65 when
 * facial data is missing, regardless of how hard the lifter is working).
 */
const EFFORT_WEIGHTS = {
  speedDecay: 0.45,
  facialColorShift: 0.35,
  formLoss: 0.2,
} as const

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function computeEffortIndex({
  speedDecayPct,
  facialColorShiftPct,
  formScore,
}: {
  speedDecayPct: number
  /** Omit (or pass null/undefined) when no facial signal is available — do not pass 0 as a stand-in. */
  facialColorShiftPct?: number | null
  formScore: number
}): { value: number; level: 'LOW' | 'MODERATE' | 'HIGH'; confidence: number } {
  const hasFacialSignal = facialColorShiftPct !== undefined && facialColorShiftPct !== null

  const signals = [
    { weight: EFFORT_WEIGHTS.speedDecay, pct: clampPct(speedDecayPct) },
    { weight: EFFORT_WEIGHTS.formLoss, pct: clampPct(100 - formScore) },
    ...(hasFacialSignal ? [{ weight: EFFORT_WEIGHTS.facialColorShift, pct: clampPct(facialColorShiftPct) }] : []),
  ]

  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0)
  const weighted = signals.reduce((sum, signal) => sum + (signal.weight / totalWeight) * signal.pct, 0)

  const value = Math.max(0, Math.min(100, Math.round(weighted)))
  const confidence = Math.max(0, Math.min(100, Math.round((value + (100 - formScore)) / 2)))

  return { value, level: effortLevelForValue(value), confidence }
}

/** Shared value→band mapping, so any effort score (live or per-rep) reads the same way. */
export function effortLevelForValue(value: number): 'LOW' | 'MODERATE' | 'HIGH' {
  if (value >= 60) return 'HIGH'
  if (value >= 35) return 'MODERATE'
  return 'LOW'
}

export type FormSeverity = FormToleranceResult['severity']

const SEVERITY_RANK: Record<FormSeverity, number> = { good: 0, warn: 1, crit: 2 }

/** Minimum time an escalated (warn/crit) severity must persist before the HUD commits to it. */
export const COACHING_HYSTERESIS_MS = 500

export interface CoachingHysteresisState {
  /** The severity currently shown to the lifter. */
  stableSeverity: FormSeverity
  /** A worse severity that's been observed but hasn't persisted long enough yet, if any. */
  pendingSeverity: FormSeverity | null
  pendingSinceMs: number | null
}

export function initCoachingHysteresis(initialSeverity: FormSeverity = 'good'): CoachingHysteresisState {
  return { stableSeverity: initialSeverity, pendingSeverity: null, pendingSinceMs: null }
}

/**
 * Debounces flicker in per-frame form severity coming from noisy pose landmarks.
 *
 * Recovering to a better (or equal) severity is applied immediately, so corrected
 * form is reflected right away. Escalating to a worse severity only commits once
 * it has persisted continuously for `COACHING_HYSTERESIS_MS` — a single noisy
 * frame that dips out of tolerance and back no longer flips the HUD into a warning.
 */
export function stabilizeCoachingSeverity(
  state: CoachingHysteresisState,
  candidateSeverity: FormSeverity,
  nowMs: number,
): CoachingHysteresisState {
  if (SEVERITY_RANK[candidateSeverity] <= SEVERITY_RANK[state.stableSeverity]) {
    return { stableSeverity: candidateSeverity, pendingSeverity: null, pendingSinceMs: null }
  }

  if (state.pendingSeverity !== candidateSeverity) {
    return { ...state, pendingSeverity: candidateSeverity, pendingSinceMs: nowMs }
  }

  if (state.pendingSinceMs !== null && nowMs - state.pendingSinceMs >= COACHING_HYSTERESIS_MS) {
    return { stableSeverity: candidateSeverity, pendingSeverity: null, pendingSinceMs: null }
  }

  return state
}
