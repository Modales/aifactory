import type { DetectedPose, PoseLandmark } from './types'
import { computeJointAngle, type Vector2D } from '../biomechanics_v2'
import type { ExerciseDef, RepData } from '../simulation'

export type ActivationState =
  | 'NO_PERSON'
  | 'PERSON_DETECTED'
  | 'TRACKING_STABLE'
  | 'READY'
  | 'ARMED'
  | 'REP_DETECTION_ACTIVE'

export type RepPhase =
  | 'UNARMED'
  | 'CALIBRATING'
  | 'READY'
  | 'IDLE'
  | 'FLEXING'
  | 'BOTTOM_PEAK'
  | 'EXTENDING'
  | 'COMPLETED'

export interface TransitionLog {
  frameNumber: number
  timestampMs: number
  previousState: string
  newState: string
  rawAngle: number | null
  smoothedAngle: number | null
  topThreshold: number
  bottomThreshold: number
  reason: string
  repCount: number
}

export function computeAspectCorrectedAngle(
  a: PoseLandmark,
  vertex: PoseLandmark,
  b: PoseLandmark,
  aspectRatio: number = 1.0,
): number {
  const v1: Vector2D = { x: (a.x - vertex.x) * aspectRatio, y: a.y - vertex.y }
  const v2: Vector2D = { x: (b.x - vertex.x) * aspectRatio, y: b.y - vertex.y }
  const origin: Vector2D = { x: 0, y: 0 }
  return computeJointAngle(v1, origin, v2)
}

export class RealtimeRepCounter {
  private activationState: ActivationState = 'NO_PERSON'
  private phase: RepPhase = 'UNARMED'
  private previousPhase: RepPhase = 'UNARMED'
  private repStartTime: number | null = null
  private topAngle: number = 165
  private minAngleReached: number = 180
  private lastRepTimestamp: number = 0
  private minRepDurationMs = 700
  private angleWindow: number[] = []
  private smoothedAngle: number | null = null

  // Telemetry & Debug Instrumentation State
  private frameCounter = 0
  private transitionLogs: TransitionLog[] = []
  private lastTransitionReason = 'System initialized'
  private lastFailedCondition = 'Awaiting motion'

  // Activation & Stationary Guard tracking
  private trackingStartTime: number | null = null
  private lastCentroidX: number | null = null
  private lastCentroidY: number | null = null
  private lastTorsoScale: number | null = null
  private stationaryFrameCount = 0
  private calibrationSamples: number[] = []

  public reset() {
    this.activationState = 'NO_PERSON'
    this.phase = 'UNARMED'
    this.previousPhase = 'UNARMED'
    this.repStartTime = null
    this.topAngle = 165
    this.minAngleReached = 180
    this.lastRepTimestamp = 0
    this.angleWindow = []
    this.smoothedAngle = null
    this.trackingStartTime = null
    this.lastCentroidX = null
    this.lastCentroidY = null
    this.lastTorsoScale = null
    this.stationaryFrameCount = 0
    this.calibrationSamples = []
    this.frameCounter = 0
    this.transitionLogs = []
    this.lastTransitionReason = 'System reset'
    this.lastFailedCondition = 'None'
  }

  private logTransition(newState: RepPhase, reason: string, currentRepCount: number, timestampMs: number) {
    const rawAngle = this.angleWindow.length > 0 ? Math.round(this.angleWindow[this.angleWindow.length - 1]) : null
    const smoothedAngle = this.smoothedAngle !== null ? Math.round(this.smoothedAngle) : null

    const log: TransitionLog = {
      frameNumber: this.frameCounter,
      timestampMs,
      previousState: this.phase,
      newState,
      rawAngle,
      smoothedAngle,
      topThreshold: Math.round(this.topAngle),
      bottomThreshold: Math.round(this.topAngle - 25),
      reason,
      repCount: currentRepCount,
    }

    this.transitionLogs.unshift(log)
    if (this.transitionLogs.length > 30) this.transitionLogs.pop()

    this.previousPhase = this.phase
    this.phase = newState
    this.lastTransitionReason = reason

    console.log(
      `[REP DETECTOR DEBUG] Frame ${log.frameNumber} | ${log.previousState} -> ${log.newState} | Angle: ${log.smoothedAngle}° | Reason: ${reason} | Reps: ${currentRepCount}`,
    )
  }

  public getArmStatusText(): string {
    switch (this.activationState) {
      case 'NO_PERSON':
        return 'NO ATHLETE IN FRAME'
      case 'PERSON_DETECTED':
        return 'ATHLETE DETECTED — UNRACK & HOLD STARTING LOCKOUT'
      case 'TRACKING_STABLE':
        return 'HOLD STARTING POSTURE…'
      case 'READY':
        return 'READY — BEGIN SET'
      case 'ARMED':
      case 'REP_DETECTION_ACTIVE':
        return 'SYSTEM ARMED & TRACKING REPS'
      default:
        return 'TRACKING REPS LIVE'
    }
  }

  public getDebugState() {
    return {
      frameNumber: this.frameCounter,
      activationState: this.activationState,
      phase: this.phase,
      currentState: this.phase,
      previousState: this.previousPhase,
      topAngle: Math.round(this.topAngle),
      bottomThreshold: Math.round(this.topAngle - 25),
      minAngleReached: Math.round(this.minAngleReached),
      smoothedAngle: this.smoothedAngle !== null ? Math.round(this.smoothedAngle) : null,
      rawAngle: this.angleWindow.length > 0 ? Math.round(this.angleWindow[this.angleWindow.length - 1]) : null,
      isArmed: this.activationState === 'ARMED' || this.activationState === 'REP_DETECTION_ACTIVE',
      armStatus: this.getArmStatusText(),
      lastTransitionReason: this.lastTransitionReason,
      lastFailedCondition: this.lastFailedCondition,
      recentLogs: [...this.transitionLogs.slice(0, 8)],
    }
  }

  /**
   * Evaluates whole-body centroid position & scale to detect walking into camera or setup movement.
   * Only used during initial UNARMED/CALIBRATING setup sequence.
   */
  private checkIsStationary(pose: DetectedPose): boolean {
    if (!pose || !pose.landmarks || pose.landmarks.length < 15) return false

    const lm = pose.landmarks
    const is33 = lm.length >= 33

    const leftShoulder = lm[is33 ? 11 : 5]
    const rightShoulder = lm[is33 ? 12 : 6]
    const leftHip = lm[is33 ? 23 : 11]
    const rightHip = lm[is33 ? 24 : 12]

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return false

    const currentCentroidX = (leftShoulder.x + rightShoulder.x + leftHip.x + rightHip.x) / 4
    const currentCentroidY = (leftShoulder.y + rightShoulder.y + leftHip.y + rightHip.y) / 4
    const currentScale = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - leftHip.y)

    if (this.lastCentroidX === null || this.lastCentroidY === null || this.lastTorsoScale === null) {
      this.lastCentroidX = currentCentroidX
      this.lastCentroidY = currentCentroidY
      this.lastTorsoScale = currentScale
      return true
    }

    const deltaX = Math.abs(currentCentroidX - this.lastCentroidX)
    const deltaY = Math.abs(currentCentroidY - this.lastCentroidY)
    const deltaScale = Math.abs(currentScale - this.lastTorsoScale)

    this.lastCentroidX = currentCentroidX
    this.lastCentroidY = currentCentroidY
    this.lastTorsoScale = currentScale

    const isStationary = deltaX < 0.018 && deltaY < 0.025 && deltaScale < 0.022
    return isStationary
  }

  /**
   * Multi-Joint Biomechanical Pattern Validation:
   */
  public validateMovementPattern(pose: DetectedPose, exerciseId: string): boolean {
    if (!pose || !pose.landmarks || pose.landmarks.length < 15) return false

    const lm = pose.landmarks
    const is33 = lm.length >= 33

    const noseIdx = 0
    const leftShoulderIdx = is33 ? 11 : 5
    const rightShoulderIdx = is33 ? 12 : 6
    const leftElbowIdx = is33 ? 13 : 7
    const rightElbowIdx = is33 ? 14 : 8
    const leftWristIdx = is33 ? 15 : 9
    const rightWristIdx = is33 ? 16 : 10
    const leftHipIdx = is33 ? 23 : 11
    const rightHipIdx = is33 ? 24 : 12

    const nose = lm[noseIdx]
    const leftWrist = lm[leftWristIdx]
    const rightWrist = lm[rightWristIdx]
    const leftShoulder = lm[leftShoulderIdx]
    const rightShoulder = lm[rightShoulderIdx]

    // Universal Hair-Fixing / Head-Touching Rejection Check (Standing Lifts Only)
    if (exerciseId !== 'bench') {
      if (nose && leftWrist && leftWrist.y <= nose.y + 0.02) return false
      if (nose && rightWrist && rightWrist.y <= nose.y + 0.02) return false
    }

    if (exerciseId === 'curl') {
      if (leftShoulder && lm[leftElbowIdx] && lm[leftElbowIdx].y < leftShoulder.y - 0.05) return false
      if (rightShoulder && lm[rightElbowIdx] && lm[rightElbowIdx].y < rightShoulder.y - 0.05) return false
      if (leftShoulder && leftWrist && leftWrist.y < leftShoulder.y - 0.08) return false
      if (rightShoulder && rightWrist && rightWrist.y < rightShoulder.y - 0.08) return false
      return true
    }

    if (exerciseId === 'squat' || exerciseId === 'lunge' || exerciseId === 'deadlift') {
      const leftHip = lm[leftHipIdx]
      const rightHip = lm[rightHipIdx]
      if (!leftHip && !rightHip) return false
      return true
    }

    return true
  }

  /**
   * Calculates joint angle from the most visible limb (Left or Right).
   */
  public getPrimaryJointAngle(
    pose: DetectedPose,
    exerciseId: string,
    aspectRatio: number = 1.0,
  ): number | null {
    if (!pose || !pose.landmarks || pose.landmarks.length < 15) return null

    const lm = pose.landmarks
    const is33 = lm.length >= 33

    let leftIndices: [number, number, number]
    let rightIndices: [number, number, number]

    const isLegExercise = exerciseId === 'squat' || exerciseId === 'lunge' || exerciseId === 'deadlift'

    if (isLegExercise) {
      leftIndices = is33 ? [23, 25, 27] : [11, 13, 15]
      rightIndices = is33 ? [24, 26, 28] : [12, 14, 16]
    } else {
      leftIndices = is33 ? [11, 13, 15] : [5, 7, 9]
      rightIndices = is33 ? [12, 14, 16] : [6, 8, 10]
    }

    const getLimbPoints = (indices: [number, number, number]) => {
      const p0 = lm[indices[0]]
      const p1 = lm[indices[1]]
      const p2 = lm[indices[2]]
      if (!p0 || !p1 || !p2) return null
      const vis = ((p0.visibility ?? 0.8) + (p1.visibility ?? 0.8) + (p2.visibility ?? 0.8)) / 3
      return { p0, p1, p2, vis }
    }

    const leftLimb = getLimbPoints(leftIndices)
    const rightLimb = getLimbPoints(rightIndices)

    if (!leftLimb && !rightLimb) return null

    const selectedLimb =
      leftLimb && rightLimb
        ? leftLimb.vis >= rightLimb.vis
          ? leftLimb
          : rightLimb
        : (leftLimb ?? rightLimb!)

    return computeAspectCorrectedAngle(selectedLimb.p0, selectedLimb.p1, selectedLimb.p2, aspectRatio)
  }

  /**
   * Instrumented processFrame:
   * Requires Full-Extension Lockout (>=150 deg) to Arm Detector before first rep begins!
   */
  public processFrame(
    pose: DetectedPose,
    exercise: ExerciseDef,
    currentRepCount: number,
    timestampMs: number = Date.now(),
    aspectRatio: number = 1.0,
  ): RepData | null {
    this.frameCounter++

    if (!pose || !pose.landmarks || pose.landmarks.length < 15) {
      if (this.activationState !== 'NO_PERSON') {
        this.activationState = 'NO_PERSON'
        this.logTransition('UNARMED', 'No athlete detected in frame (tracking lost)', currentRepCount, timestampMs)
      }
      this.lastFailedCondition = 'No person detected'
      return null
    }

    if (this.trackingStartTime === null) {
      this.trackingStartTime = timestampMs
      this.activationState = 'PERSON_DETECTED'
    }

    // Centroid Motion Check ONLY during initial UNARMED/CALIBRATING setup phase
    if (this.activationState !== 'ARMED' && this.activationState !== 'REP_DETECTION_ACTIVE') {
      const isStationary = this.checkIsStationary(pose)
      if (!isStationary) {
        this.stationaryFrameCount = 0
        this.calibrationSamples = []
        this.activationState = 'PERSON_DETECTED'
        this.lastFailedCondition = 'Athlete unstationary during setup (walking into frame)'
        return null
      }
    }

    if (!this.validateMovementPattern(pose, exercise.id)) {
      if (this.phase === 'FLEXING' || this.phase === 'BOTTOM_PEAK') {
        this.logTransition('IDLE', 'Movement pattern invalid (non-workout gesture)', currentRepCount, timestampMs)
      }
      this.lastFailedCondition = 'Multi-joint pattern invalid (non-workout gesture)'
      return null
    }

    const rawAngle = this.getPrimaryJointAngle(pose, exercise.id, aspectRatio)
    if (rawAngle === null || isNaN(rawAngle)) {
      this.lastFailedCondition = 'Joint angle calculation returned null'
      return null
    }

    this.angleWindow.push(rawAngle)
    if (this.angleWindow.length > 5) this.angleWindow.shift()

    const sortedWindow = [...this.angleWindow].sort((a, b) => a - b)
    const medianAngle = sortedWindow[Math.floor(sortedWindow.length / 2)]

    if (this.smoothedAngle === null) {
      this.smoothedAngle = medianAngle
    } else {
      this.smoothedAngle = 0.5 * this.smoothedAngle + 0.5 * medianAngle
    }

    const angle = this.smoothedAngle
    const isLegExercise = exercise.id === 'squat' || exercise.id === 'lunge' || exercise.id === 'deadlift'
    const minRomDip = 25

    // Enforce Full-Extension Starting Lockout (>=150 deg) before Arming Detector
    if (this.activationState !== 'ARMED' && this.activationState !== 'REP_DETECTION_ACTIVE') {
      const minLockoutStartAngle = 150

      if (angle >= minLockoutStartAngle) {
        this.activationState = 'TRACKING_STABLE'
        this.calibrationSamples.push(angle)
        this.stationaryFrameCount++

        if (this.stationaryFrameCount >= 3) {
          this.activationState = 'READY'
        }

        if (this.stationaryFrameCount >= 6) {
          const avgTop = this.calibrationSamples.reduce((a, b) => a + b, 0) / this.calibrationSamples.length
          this.topAngle = Math.min(180, Math.max(155, avgTop))
          this.activationState = 'ARMED'
          this.logTransition('IDLE', 'System armed at extended lockout position', currentRepCount, timestampMs)
        }
      } else {
        // Athlete is still unracking, setting back, or holding bent elbows (setup phase)
        this.stationaryFrameCount = 0
        this.calibrationSamples = []
        this.activationState = 'PERSON_DETECTED'
        this.lastFailedCondition = `Setup phase: Angle ${Math.round(angle)}° below required start lockout ${minLockoutStartAngle}°`
      }
      return null
    }

    this.activationState = 'REP_DETECTION_ACTIVE'

    switch (this.phase) {
      case 'IDLE':
        if (angle > this.topAngle) {
          this.topAngle = Math.min(180, Math.max(155, angle))
        }

        if (this.topAngle - angle >= 15) {
          this.logTransition('FLEXING', `Joint angle dipped >=15° (${Math.round(angle)}° vs top ${Math.round(this.topAngle)}°)`, currentRepCount, timestampMs)
          this.repStartTime = timestampMs
          this.minAngleReached = angle
        } else {
          this.lastFailedCondition = `In IDLE: Dip is ${Math.round(this.topAngle - angle)}° (needs >=15°)`
        }
        break

      case 'FLEXING':
        if (angle < this.minAngleReached) this.minAngleReached = angle

        if (this.topAngle - angle >= minRomDip || (isLegExercise && angle <= 130)) {
          this.logTransition('BOTTOM_PEAK', `Reached bottom flexion (${Math.round(angle)}°, dip ${Math.round(this.topAngle - angle)}°)`, currentRepCount, timestampMs)
        } else if (angle >= this.topAngle - 4) {
          this.logTransition('IDLE', 'Flexion aborted — returned to top standing', currentRepCount, timestampMs)
        } else {
          this.lastFailedCondition = `In FLEXING: Angle is ${Math.round(angle)}° (needs dip >=${minRomDip}° to reach BOTTOM_PEAK)`
        }
        break

      case 'BOTTOM_PEAK':
        if (angle < this.minAngleReached) this.minAngleReached = angle

        if (angle >= this.minAngleReached + 10) {
          this.logTransition('EXTENDING', `Extending upward (+10° above trough ${Math.round(this.minAngleReached)}°)`, currentRepCount, timestampMs)
        } else {
          this.lastFailedCondition = `In BOTTOM_PEAK: Trough ${Math.round(this.minAngleReached)}° (needs ascent >=${Math.round(this.minAngleReached + 10)}°)`
        }
        break

      case 'EXTENDING':
        if (angle >= this.topAngle - 8 || angle >= 148) {
          const durationMs = timestampMs - (this.repStartTime ?? timestampMs)
          const timeSinceLastRep = timestampMs - this.lastRepTimestamp

          if (durationMs >= 700 && timeSinceLastRep >= this.minRepDurationMs) {
            const nextIndex = currentRepCount + 1
            const tempo = Math.max(1.0, Math.min(8.0, durationMs / 1000))
            const eccentricTime = Number((tempo * 0.55).toFixed(1))
            const concentricTime = Number((tempo * 0.45).toFixed(1))

            const rom = this.topAngle - this.minAngleReached
            const formScore = rom >= 40 ? 98 : rom >= 30 ? 88 : 75

            const severity: 'good' | 'warn' | 'crit' =
              formScore >= 90 ? 'good' : formScore >= 80 ? 'warn' : 'crit'

            const cues: Record<string, string> = {
              good: 'Great depth & control — rep locked in',
              warn: 'Acceptable range — drive through the heel',
              crit: 'Shallow depth — hit full range of motion',
            }

            const repData: RepData = {
              rep: nextIndex,
              tempo: Number(tempo.toFixed(1)),
              concentricTime,
              eccentricTime,
              peakAngle: Math.round(this.minAngleReached),
              velocity: Math.round(180 / (concentricTime || 1)),
              formScore,
              effort: Math.min(98, 45 + nextIndex * 6),
              cue: cues[severity],
              severity,
            }

            this.lastRepTimestamp = timestampMs
            this.topAngle = Math.max(150, angle)
            this.logTransition('COMPLETED', `Rep #${nextIndex} complete! Duration: ${durationMs}ms`, nextIndex, timestampMs)
            return repData
          } else {
            this.logTransition('IDLE', `Rep too fast (${durationMs}ms < 700ms), resetting to IDLE`, currentRepCount, timestampMs)
            this.lastFailedCondition = `Rep duration ${durationMs}ms < min required 700ms`
          }
        } else {
          this.lastFailedCondition = `In EXTENDING: Angle ${Math.round(angle)}° (needs >=${Math.round(this.topAngle - 8)}° to complete)`
        }
        break

      case 'COMPLETED':
        if (angle >= this.topAngle - 6 && timestampMs - this.lastRepTimestamp >= 400) {
          this.logTransition('IDLE', 'Lockout hold cleared — ready for next rep', currentRepCount, timestampMs)
        } else {
          this.lastFailedCondition = `In COMPLETED: Hold lockout (${timestampMs - this.lastRepTimestamp}ms / 400ms)`
        }
        break
    }

    return null
  }
}
