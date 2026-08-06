import {
  EXERCISE_ANGLE_TARGETS,
  computeEffortIndex,
  computeSpeedDecay,
  describeJointFlaw,
  type AngleRange,
  type ExerciseBiomechanicsTargets,
  type ExerciseId,
} from '@/lib/biomechanics_v2'
import type { ExerciseDef, RepData } from '@/lib/simulation'
import {
  extractFrameAngles,
  keyAngleFor,
  resolveKeyJoint,
  type FrameAngles,
  type KeyJoint,
} from './jointAngles'
import type { PoseFrame } from './types'

/** Below this much travel the lifter is considered to be standing still, not repping. */
const MIN_RANGE_OF_MOTION_DEG = 25
/** Fractions of the observed range that arm the bottom and top of a rep. */
const BOTTOM_ENTER_RATIO = 0.3
const TOP_ENTER_RATIO = 0.7
/** Reps outside this window are jitter or a dropped tracking segment, not lifts. */
const MIN_REP_SECONDS = 0.4
const MAX_REP_SECONDS = 15
/** Exponential smoothing on the key angle; MediaPipe Lite is noisy frame to frame. */
const SMOOTHING = 0.45

type ScoredJoint = 'knee' | 'hip' | 'back'

interface JointVerdict {
  joint: ScoredJoint
  label: string
  score: number
  flaw: string | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isExerciseId(id: string): id is ExerciseId {
  return id in EXERCISE_ANGLE_TARGETS
}

/**
 * Scores one joint against its target band.
 *
 * Inside the band the score tapers from 100 at the ideal angle down to 85 at the
 * edges; outside it falls off proportionally to how far past the edge the lifter is.
 * `variantSeed` rotates the flaw phrasing (see describeJointFlaw) so the same
 * miss doesn't read as an identical sentence rep after rep.
 */
function scoreJoint(value: number, range: AngleRange, joint: ScoredJoint, variantSeed: number): JointVerdict {
  const halfRange = Math.max(1, (range.max - range.min) / 2)

  if (value >= range.min && value <= range.max) {
    const drift = Math.abs(value - range.ideal) / halfRange
    return { joint, label: range.label, score: 100 - clamp(drift, 0, 1) * 15, flaw: null }
  }

  const overshoot = value < range.min ? range.min - value : value - range.max
  const score = 85 - clamp(overshoot / halfRange, 0, 1) * 70
  return { joint, label: range.label, score, flaw: describeJointFlaw({ range, value, variantSeed }) }
}

export interface RepDetectorSnapshot {
  reps: RepData[]
  /** Degrees of travel seen so far — drives the "still calibrating" state in the UI. */
  observedRangeDeg: number
  isCalibrated: boolean
  phase: RepPhase
}

export type RepPhase = 'IDLE' | 'ECCENTRIC' | 'PEAK_CONTRACTION' | 'CONCENTRIC' | 'REP_COMPLETE'

/**
 * Turns a stream of pose frames into scored reps.
 *
 * Rep boundaries come from hysteresis on the exercise's key joint angle: the
 * detector calibrates the lifter's own range of motion as it goes, then counts a
 * rep each time the angle travels down past the bottom threshold and back up past
 * the top one. "Eccentric" is the descending half and "concentric" the ascending
 * one — for a curl those labels are reversed, but the durations still hold.
 */
export class RepDetector {
  private readonly exercise: ExerciseDef
  private readonly keyJoint: KeyJoint
  private readonly targets: ExerciseBiomechanicsTargets

  private smoothedKey: number | null = null
  private observedMin = Number.POSITIVE_INFINITY
  private observedMax = Number.NEGATIVE_INFINITY
  private state: 'top' | 'bottom' = 'top'
  private lastTopMs: number | null = null
  private bottom: { key: number; timestampMs: number; angles: FrameAngles } | null = null
  private bestRangeDeg = 0
  private reps: RepData[] = []
  private velocities: number[] = []
  private phase: RepPhase = 'IDLE'
  private previousKey: number | null = null

  constructor(exercise: ExerciseDef) {
    this.exercise = exercise
    this.keyJoint = resolveKeyJoint(exercise.keyJoint)
    this.targets = isExerciseId(exercise.id) ? EXERCISE_ANGLE_TARGETS[exercise.id] : {}
  }

  get snapshot(): RepDetectorSnapshot {
    const range = this.observedRangeDeg
    return {
      reps: this.reps,
      observedRangeDeg: range,
      isCalibrated: range >= MIN_RANGE_OF_MOTION_DEG,
      phase: this.phase,
    }
  }

  private get observedRangeDeg(): number {
    if (!Number.isFinite(this.observedMin) || !Number.isFinite(this.observedMax)) return 0
    return this.observedMax - this.observedMin
  }

  /**
   * Feeds one pose frame in. Returns a completed rep on the frame that closes it,
   * and null on every other frame.
   */
  push(frame: PoseFrame, aspectRatio: number): RepData | null {
    const pose = frame.poses[0]
    if (!pose) return null

    const angles = extractFrameAngles(pose.landmarks, aspectRatio)
    if (!angles) return null

    const rawKey = keyAngleFor(this.keyJoint, angles)
    this.smoothedKey =
      this.smoothedKey === null ? rawKey : this.smoothedKey + SMOOTHING * (rawKey - this.smoothedKey)
    const key = this.smoothedKey
    const previousKey = this.previousKey
    this.previousKey = key

    this.observedMin = Math.min(this.observedMin, key)
    this.observedMax = Math.max(this.observedMax, key)

    const range = this.observedRangeDeg
    if (range < MIN_RANGE_OF_MOTION_DEG) {
      this.phase = 'IDLE'
      this.lastTopMs = frame.timestampMs
      return null
    }

    const bottomEnter = this.observedMin + range * BOTTOM_ENTER_RATIO
    const topEnter = this.observedMin + range * TOP_ENTER_RATIO

    if (this.state === 'top') {
      this.phase = previousKey !== null && key < previousKey ? this.downwardPhase : 'IDLE'
      if (key > topEnter) this.lastTopMs = frame.timestampMs
      if (key < bottomEnter) {
        this.state = 'bottom'
        this.bottom = { key, timestampMs: frame.timestampMs, angles }
        this.phase = 'PEAK_CONTRACTION'
      }
      return null
    }

    // Descending or held at the bottom: keep the deepest frame of this rep.
    if (this.bottom && key < this.bottom.key) {
      this.bottom = { key, timestampMs: frame.timestampMs, angles }
    }

    if (previousKey !== null && key > previousKey) this.phase = this.upwardPhase
    else if (this.phase !== this.upwardPhase) this.phase = 'PEAK_CONTRACTION'

    if (key <= topEnter) return null

    const bottom = this.bottom
    this.state = 'top'
    this.bottom = null
    const topMs = this.lastTopMs
    this.lastTopMs = frame.timestampMs
    if (!bottom || topMs === null) return null

    const eccentricTime = (bottom.timestampMs - topMs) / 1000
    const concentricTime = (frame.timestampMs - bottom.timestampMs) / 1000
    const tempo = eccentricTime + concentricTime
    if (tempo < MIN_REP_SECONDS || tempo > MAX_REP_SECONDS) {
      this.phase = 'IDLE'
      return null
    }

    const rep = this.buildRep(bottom, key, eccentricTime, concentricTime, tempo)
    this.reps = [...this.reps, rep]
    this.velocities = [...this.velocities, rep.velocity]
    this.phase = 'REP_COMPLETE'
    return rep
  }

  /** Elbow flexion is the lifting half of a curl; the other supported lifts descend as their key angle closes. */
  private get downwardPhase(): Exclude<RepPhase, 'IDLE' | 'PEAK_CONTRACTION' | 'REP_COMPLETE'> {
    return this.exercise.id === 'curl' ? 'CONCENTRIC' : 'ECCENTRIC'
  }

  private get upwardPhase(): Exclude<RepPhase, 'IDLE' | 'PEAK_CONTRACTION' | 'REP_COMPLETE'> {
    return this.exercise.id === 'curl' ? 'ECCENTRIC' : 'CONCENTRIC'
  }

  private buildRep(
    bottom: { key: number; angles: FrameAngles },
    topKey: number,
    eccentricTime: number,
    concentricTime: number,
    tempo: number,
  ): RepData {
    const repIndex = this.reps.length + 1
    const travelled = Math.max(0, topKey - bottom.key)
    this.bestRangeDeg = Math.max(this.bestRangeDeg, travelled)

    const { formScore, flaws } = this.scoreForm(bottom.angles, travelled, repIndex)
    const velocity = +(travelled / Math.max(0.1, concentricTime)).toFixed(1)

    // Effort normally fuses rep-speed decay, facial colour shift and form loss.
    // No facial signal exists in the browser pipeline, so it's omitted here and
    // computeEffortIndex renormalizes the remaining two terms over their own total.
    const speedDecay = computeSpeedDecay([...this.velocities, velocity])
    const effort = computeEffortIndex({ speedDecayPct: speedDecay, formScore }).value

    const severity: RepData['severity'] =
      formScore < 60 || flaws.length >= 2 ? 'crit' : formScore < 82 || flaws.length ? 'warn' : 'good'
    const pool = this.exercise.cues[severity]
    const cue = flaws[0] ?? pool[(repIndex - 1) % pool.length]

    return {
      rep: repIndex,
      tempo: +tempo.toFixed(2),
      concentricTime: +concentricTime.toFixed(2),
      eccentricTime: +eccentricTime.toFixed(2),
      peakAngle: Math.round(bottom.key),
      velocity,
      formScore: Math.round(formScore),
      effort,
      cue,
      severity,
      flaws,
    }
  }

  /**
   * Averages every joint this exercise defines a target for. Lifts with no angle
   * targets (bench, curl) are scored on how much of their best range of motion
   * the rep reached instead.
   */
  private scoreForm(
    angles: FrameAngles,
    travelled: number,
    repIndex: number,
  ): { formScore: number; flaws: string[] } {
    const verdicts: JointVerdict[] = []
    // Offset the seed per joint so a rep with multiple flaws doesn't pick the
    // same phrasing slot for each one.
    if (this.targets.knee) verdicts.push(scoreJoint(angles.knee, this.targets.knee, 'knee', repIndex))
    if (this.targets.hip) verdicts.push(scoreJoint(angles.hip, this.targets.hip, 'hip', repIndex + 1))
    if (this.targets.back) verdicts.push(scoreJoint(angles.back, this.targets.back, 'back', repIndex + 2))

    if (!verdicts.length) {
      const reference = Math.max(this.bestRangeDeg, travelled, 1)
      return { formScore: clamp((travelled / reference) * 100, 40, 100), flaws: [] }
    }

    const formScore = verdicts.reduce((total, v) => total + v.score, 0) / verdicts.length
    const flaws = verdicts.flatMap((v) => (v.flaw ? [v.flaw] : []))
    return { formScore, flaws }
  }
}

export { MIN_RANGE_OF_MOTION_DEG }
