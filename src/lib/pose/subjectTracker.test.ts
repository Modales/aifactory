import { describe, expect, it } from 'vitest'
import { SubjectTracker, scoreSubjectProminence, computeIoU, computePoseBoundingBox } from './subjectTracker'
import { RealtimeRepCounter } from './repCounter'
import type { DetectedPose } from './types'
import { EXERCISES } from '../simulation'

describe('SubjectTracker Torso Centroid & Skeleton Signature Engine', () => {
  it('correctly scores candidate prominence favoring central, larger subjects', () => {
    const backgroundPerson: DetectedPose = {
      landmarks: [
        { x: 0.05, y: 0.05, visibility: 0.7 },
        { x: 0.15, y: 0.25, visibility: 0.7 },
      ],
    }

    const primaryAthlete: DetectedPose = {
      landmarks: [
        { x: 0.3, y: 0.1, visibility: 0.95 },
        { x: 0.7, y: 0.9, visibility: 0.95 },
      ],
    }

    const bgScore = scoreSubjectProminence(backgroundPerson)
    const athleteScore = scoreSubjectProminence(primaryAthlete)

    expect(athleteScore).toBeGreaterThan(bgScore)
  })

  it('computes Intersection over Union (IoU) correctly', () => {
    const boxA = computePoseBoundingBox([
      { x: 0.0, y: 0.0 },
      { x: 0.5, y: 0.5 },
    ])!
    const boxB = computePoseBoundingBox([
      { x: 0.25, y: 0.0 },
      { x: 0.75, y: 0.5 },
    ])!

    const iou = computeIoU(boxA, boxB)
    expect(iou).toBeGreaterThan(0.3)
    expect(iou).toBeLessThan(0.4)
  })

  it('selects the primary athlete when multiple poses are detected', () => {
    const tracker = new SubjectTracker()

    const backgroundPerson: DetectedPose = {
      landmarks: [
        { x: 0.01, y: 0.01, visibility: 0.5 },
        { x: 0.1, y: 0.1, visibility: 0.5 },
      ],
    }

    const primaryAthlete: DetectedPose = {
      landmarks: [
        { x: 0.35, y: 0.2, visibility: 0.9 },
        { x: 0.65, y: 0.8, visibility: 0.9 },
      ],
    }

    const poses = [backgroundPerson, primaryAthlete]
    const { selectedPose } = tracker.selectPrimarySubject(poses, 1000)

    expect(selectedPose).toBe(primaryAthlete)
  })

  it('retains lock on athlete during deep squat when height shrinks and bystander is standing', () => {
    const tracker = new SubjectTracker()

    const standingAthlete: DetectedPose = {
      landmarks: [
        { x: 0.5, y: 0.2 },
        { x: 0.5, y: 0.8 },
      ],
    }

    const standingBystander: DetectedPose = {
      landmarks: [
        { x: 0.8, y: 0.2 },
        { x: 0.8, y: 0.8 },
      ],
    }

    // Frame 1: Locked on standing athlete at x=0.5
    const { selectedPose: f1 } = tracker.selectPrimarySubject([standingAthlete, standingBystander], 1000)
    expect(f1).toBe(standingAthlete)

    // Frame 2: Athlete does a deep squat (height drops down to y=0.5..0.9, x remains 0.5)
    const squattingAthlete: DetectedPose = {
      landmarks: [
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.9 },
      ],
    }

    const { selectedPose: f2 } = tracker.selectPrimarySubject([standingBystander, squattingAthlete], 1050)
    expect(f2).toBe(squattingAthlete)
  })

  it('allows tap point selection to explicitly lock onto targeted person', () => {
    const tracker = new SubjectTracker()

    const personLeft: DetectedPose = {
      landmarks: [{ x: 0.2, y: 0.5 }],
    }
    const personRight: DetectedPose = {
      landmarks: [{ x: 0.8, y: 0.5 }],
    }

    const selected = tracker.selectPoseByTapPoint({ x: 0.8, y: 0.5 }, [personLeft, personRight], 1000)
    expect(selected).toBe(personRight)
  })

  it('requires baseline calibration before arming, ignoring initial setup movements', () => {
    const repCounter = new RealtimeRepCounter()
    const squatDef = EXERCISES.find((e) => e.id === 'squat')!

    const buildPoseAtKneeX = (kneeX: number, scaleOffset = 0): DetectedPose => {
      const landmarks = new Array(33).fill({ x: 0.5, y: 0.5, visibility: 0.9 })
      landmarks[0] = { x: 0.5, y: 0.1, visibility: 0.9 }  // Nose
      landmarks[11] = { x: 0.4 - scaleOffset, y: 0.25, visibility: 0.9 } // Left Shoulder
      landmarks[12] = { x: 0.6 + scaleOffset, y: 0.25, visibility: 0.9 } // Right Shoulder
      landmarks[15] = { x: 0.4, y: 0.55, visibility: 0.9 } // Left Wrist (below nose)
      landmarks[16] = { x: 0.6, y: 0.55, visibility: 0.9 } // Right Wrist (below nose)
      landmarks[23] = { x: 0.4, y: 0.5, visibility: 0.9 }  // Left Hip
      landmarks[24] = { x: 0.6, y: 0.5, visibility: 0.9 }  // Right Hip
      landmarks[25] = { x: kneeX, y: 0.7, visibility: 0.9 } // Knee
      landmarks[27] = { x: 0.5, y: 0.9, visibility: 0.9 }  // Ankle
      return { landmarks }
    }

    // Phase starts UNARMED
    expect(repCounter.getDebugState().phase).toBe('UNARMED')

    // Bending down while picking up weight (kneeX = 0.8 -> 90 deg) should NOT trigger calibration or reps
    const rSetup = repCounter.processFrame(buildPoseAtKneeX(0.8), squatDef, 0, 1000)
    expect(rSetup).toBeNull()
    expect(repCounter.getDebugState().phase).toBe('UNARMED')

    // Standing tall (kneeX = 0.5 -> 180 deg) for 15 frames calibrates baseline & arms system
    let t = 1100
    for (let i = 0; i < 15; i++) {
      t += 100
      repCounter.processFrame(buildPoseAtKneeX(0.5), squatDef, 0, t)
    }

    // Now system is ARMED / READY (phase transitioned out of UNARMED/CALIBRATING)
    expect(repCounter.getDebugState().phase).not.toBe('UNARMED')

    // Now performing a full squat rep
    let repCount = 0
    // Flexing down
    for (let i = 0; i < 10; i++) {
      t += 100
      const kneeX = 0.5 + (0.3 * i) / 10
      if (repCounter.processFrame(buildPoseAtKneeX(kneeX), squatDef, repCount, t)) repCount++
    }
    // Driving up
    for (let i = 0; i < 10; i++) {
      t += 100
      const kneeX = 0.8 - (0.3 * i) / 10
      if (repCounter.processFrame(buildPoseAtKneeX(kneeX), squatDef, repCount, t)) repCount++
    }
    // Holding top
    for (let i = 0; i < 5; i++) {
      t += 100
      if (repCounter.processFrame(buildPoseAtKneeX(0.5), squatDef, repCount, t)) repCount++
    }

    expect(repCount).toBe(1)
  })

  it('remains armed during active workout movements without disarming mid-set', () => {
    const repCounter = new RealtimeRepCounter()
    const benchDef = EXERCISES.find((e) => e.id === 'bench')!

    const buildBenchPose = (wristY: number, centroidShift = 0): DetectedPose => {
      const landmarks = new Array(33).fill({ x: 0.5, y: 0.5, visibility: 0.9 })
      landmarks[0] = { x: 0.5, y: 0.5, visibility: 0.9 } // Nose (head on bench at y=0.5)
      landmarks[11] = { x: 0.4, y: 0.5 + centroidShift, visibility: 0.9 } // Left Shoulder
      landmarks[12] = { x: 0.6, y: 0.5 + centroidShift, visibility: 0.9 } // Right Shoulder
      landmarks[13] = { x: 0.37, y: 0.4, visibility: 0.9 } // Left Elbow (straight arm lockout angle ~ 166 deg)
      landmarks[14] = { x: 0.63, y: 0.4, visibility: 0.9 } // Right Elbow
      landmarks[15] = { x: 0.4, y: wristY, visibility: 0.9 } // Left Wrist (bench press motion)
      landmarks[16] = { x: 0.6, y: wristY, visibility: 0.9 } // Right Wrist
      landmarks[23] = { x: 0.4, y: 0.7, visibility: 0.9 } // Left Hip
      landmarks[24] = { x: 0.6, y: 0.7, visibility: 0.9 } // Right Hip
      return { landmarks }
    }

    let t = 1000
    // 1. Calibration phase (arms extended on bench press)
    for (let i = 0; i < 10; i++) {
      t += 100
      repCounter.processFrame(buildBenchPose(0.2), benchDef, 0, t)
    }

    // System MUST be ARMED
    expect(repCounter.getDebugState().isArmed).toBe(true)

    // 2. Perform bench press rep (wrists lowering to chest at y=0.5 -> rising back to y=0.2)
    let repCount = 0
    for (let i = 0; i < 8; i++) {
      t += 100
      const wY = 0.2 + (0.3 * i) / 8
      if (repCounter.processFrame(buildBenchPose(wY, 0.05), benchDef, repCount, t)) repCount++
    }

    for (let i = 0; i < 8; i++) {
      t += 100
      const wY = 0.5 - (0.3 * i) / 8
      if (repCounter.processFrame(buildBenchPose(wY, 0), benchDef, repCount, t)) repCount++
    }

    for (let i = 0; i < 5; i++) {
      t += 100
      if (repCounter.processFrame(buildBenchPose(0.2, 0), benchDef, repCount, t)) repCount++
    }

    // System MUST REMAIN ARMED throughout the set without returning to UNARMED
    expect(repCounter.getDebugState().isArmed).toBe(true)
    expect(repCounter.getDebugState().phase).not.toBe('UNARMED')
    expect(repCount).toBe(1)
  })

  it('ignores setup adjustments on bench at bent angles without counting false reps', () => {
    const repCounter = new RealtimeRepCounter()
    const benchDef = EXERCISES.find((e) => e.id === 'bench')!

    const buildBenchPose = (wristY: number): DetectedPose => {
      const landmarks = new Array(33).fill({ x: 0.5, y: 0.5, visibility: 0.9 })
      landmarks[0] = { x: 0.5, y: 0.5, visibility: 0.9 }
      landmarks[11] = { x: 0.4, y: 0.5, visibility: 0.9 }
      landmarks[12] = { x: 0.6, y: 0.5, visibility: 0.9 }
      landmarks[13] = { x: 0.35, y: 0.4, visibility: 0.9 }
      landmarks[14] = { x: 0.65, y: 0.4, visibility: 0.9 }
      landmarks[15] = { x: 0.4, y: wristY, visibility: 0.9 }
      landmarks[16] = { x: 0.6, y: wristY, visibility: 0.9 }
      landmarks[23] = { x: 0.4, y: 0.7, visibility: 0.9 }
      landmarks[24] = { x: 0.6, y: 0.7, visibility: 0.9 }
      return { landmarks }
    }

    let t = 1000
    let repCount = 0

    // Setup phase: athlete adjusts back on bench with bent elbows (wristY = 0.35 -> angle ~ 125 deg)
    for (let i = 0; i < 15; i++) {
      t += 100
      const r = repCounter.processFrame(buildBenchPose(0.35), benchDef, repCount, t)
      if (r) repCount++
    }

    // Setup adjustments at bent angles MUST NOT arm detector or count reps
    expect(repCount).toBe(0)
    expect(repCounter.getDebugState().isArmed).toBe(false)
  })

  it('rejects walking toward the camera without counting false reps', () => {
    const repCounter = new RealtimeRepCounter()
    const squatDef = EXERCISES.find((e) => e.id === 'squat')!

    let repCount = 0
    let t = 1000

    // Simulate walking toward camera: torso scale expands rapidly every frame
    for (let i = 0; i < 10; i++) {
      t += 100
      const scaleOffset = i * 0.04 // Rapid camera distance change
      const landmarks = new Array(33).fill({ x: 0.5, y: 0.5, visibility: 0.9 })
      landmarks[0] = { x: 0.5, y: 0.1 }
      landmarks[11] = { x: 0.4 - scaleOffset, y: 0.25 }
      landmarks[12] = { x: 0.6 + scaleOffset, y: 0.25 }
      landmarks[23] = { x: 0.4 - scaleOffset, y: 0.5 }
      landmarks[24] = { x: 0.6 + scaleOffset, y: 0.5 }
      landmarks[25] = { x: 0.5, y: 0.7 }
      landmarks[27] = { x: 0.5, y: 0.9 }
      const pose: DetectedPose = { landmarks }

      if (repCounter.processFrame(pose, squatDef, repCount, t)) repCount++
    }

    // Walking toward camera MUST NOT trigger rep counts
    expect(repCount).toBe(0)
    expect(repCounter.getDebugState().activationState).toBe('PERSON_DETECTED')
  })

  it('rejects non-exercise movements like fixing hair or touching head', () => {
    const repCounter = new RealtimeRepCounter()

    const landmarks = new Array(33).fill({ x: 0.5, y: 0.5, visibility: 0.9 })
    landmarks[0] = { x: 0.5, y: 0.25 }  // Nose
    landmarks[11] = { x: 0.4, y: 0.35 } // Left Shoulder
    landmarks[12] = { x: 0.6, y: 0.35 } // Right Shoulder
    landmarks[15] = { x: 0.5, y: 0.15 } // Left Wrist (ABOVE NOSE at y=0.15 - fixing hair!)
    landmarks[16] = { x: 0.5, y: 0.15 } // Right Wrist (ABOVE NOSE)

    const fixingHairPose: DetectedPose = { landmarks }

    const isValidCurl = repCounter.validateMovementPattern(fixingHairPose, 'curl')
    expect(isValidCurl).toBe(false)
  })
})
