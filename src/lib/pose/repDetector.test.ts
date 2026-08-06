import { describe, expect, it } from 'vitest'
import { EXERCISES } from '@/lib/simulation'
import { extractFrameAngles } from './jointAngles'
import { RepDetector } from './repDetector'
import type { PoseFrame, PoseLandmark } from './types'

const SQUAT = EXERCISES.find((exercise) => exercise.id === 'squat')!

/**
 * Builds a side-on skeleton whose knee angle is `kneeAngle`, by swinging the ankle
 * around the knee. Only the landmarks the detector reads are populated.
 */
function skeleton(kneeAngle: number): PoseLandmark[] {
  const landmarks: PoseLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    visibility: 0,
  }))

  const put = (index: number, x: number, y: number) => {
    landmarks[index] = { x, y, visibility: 0.95 }
  }

  const hip = { x: 0.5, y: 0.5 }
  const knee = { x: 0.5, y: 0.7 }
  // Thigh points straight up from the knee, so rotating the shin by (180 - angle)
  // off that direction yields the requested interior knee angle.
  const shinRadians = ((180 - kneeAngle) * Math.PI) / 180
  const shinLength = 0.2

  put(11, 0.5, 0.25) // shoulder
  put(13, 0.5, 0.38) // elbow
  put(15, 0.5, 0.5) // wrist
  put(23, hip.x, hip.y)
  put(25, knee.x, knee.y)
  put(27, knee.x + Math.sin(shinRadians) * shinLength, knee.y + Math.cos(shinRadians) * shinLength)

  return landmarks
}

function frameAt(timestampMs: number, kneeAngle: number): PoseFrame {
  return { timestampMs, poses: [{ landmarks: skeleton(kneeAngle) }] }
}

/** Plays one descend-and-stand cycle through the detector. */
function pushRep(
  detector: RepDetector,
  startMs: number,
  { top = 175, bottom = 90, steps = 8, stepMs = 90 } = {},
) {
  const emitted: ReturnType<RepDetector['push']>[] = []
  let timestampMs = startMs

  for (let step = 0; step <= steps; step += 1) {
    const angle = top - ((top - bottom) * step) / steps
    emitted.push(detector.push(frameAt(timestampMs, angle), 1))
    timestampMs += stepMs
  }
  for (let step = 0; step <= steps; step += 1) {
    const angle = bottom + ((top - bottom) * step) / steps
    emitted.push(detector.push(frameAt(timestampMs, angle), 1))
    timestampMs += stepMs
  }

  return { reps: emitted.filter((rep) => rep !== null), endMs: timestampMs }
}

describe('extractFrameAngles', () => {
  it('reads a straight leg as a near-180° knee angle', () => {
    const angles = extractFrameAngles(skeleton(180), 1)

    expect(angles).not.toBeNull()
    expect(Math.round(angles!.knee)).toBe(180)
  })

  it('reads a squat-depth leg as a near-90° knee angle', () => {
    const angles = extractFrameAngles(skeleton(90), 1)

    expect(Math.round(angles!.knee)).toBe(90)
  })

  it('rejects a frame whose landmarks are all occluded', () => {
    const hidden = skeleton(120).map((landmark) => ({ ...landmark, visibility: 0.1 }))

    expect(extractFrameAngles(hidden, 1)).toBeNull()
  })
})

describe('RepDetector', () => {
  it('counts one rep per descend-and-stand cycle', () => {
    const detector = new RepDetector(SQUAT)

    // Calibration completes on the way down, so the opening descent already counts.
    const first = pushRep(detector, 0)

    expect(first.reps).toHaveLength(1)
    expect(first.reps[0]!.rep).toBe(1)
  })

  it('does not count reps while the lifter stands still', () => {
    const detector = new RepDetector(SQUAT)

    for (let step = 0; step < 60; step += 1) {
      const jitter = step % 2 === 0 ? 176 : 174
      expect(detector.push(frameAt(step * 90, jitter), 1)).toBeNull()
    }

    expect(detector.snapshot.isCalibrated).toBe(false)
  })

  it('reports depth, tempo and a concentric/eccentric split for a counted rep', () => {
    const detector = new RepDetector(SQUAT)
    const warmup = pushRep(detector, 0)
    const rep = pushRep(detector, warmup.endMs).reps[0]!

    expect(rep.peakAngle).toBeGreaterThan(85)
    expect(rep.peakAngle).toBeLessThan(105)
    expect(rep.tempo).toBeGreaterThan(0)
    expect(+(rep.concentricTime + rep.eccentricTime).toFixed(2)).toBe(rep.tempo)
    expect(rep.velocity).toBeGreaterThan(0)
  })

  it('scores a rep that hits target depth above one that stops short', () => {
    const deep = new RepDetector(SQUAT)
    pushRep(deep, 0, { bottom: 95 })
    const deepRep = pushRep(deep, 2000, { bottom: 95 }).reps[0]!

    const shallow = new RepDetector(SQUAT)
    pushRep(shallow, 0, { bottom: 140 })
    const shallowRep = pushRep(shallow, 2000, { bottom: 140 }).reps[0]!

    expect(deepRep.formScore).toBeGreaterThan(shallowRep.formScore)
    expect(shallowRep.flaws?.length).toBeGreaterThan(0)
  })

  it('varies the coaching cue across consecutive reps with the same flaw, instead of repeating one sentence', () => {
    const detector = new RepDetector(SQUAT)
    let cursor = 0
    const cues: string[] = []

    for (let i = 0; i < 4; i += 1) {
      // Consistently shallow bottom (140°, well outside the 85-105° knee band) so every rep flaws the same way.
      const cycle = pushRep(detector, cursor, { bottom: 140 })
      cursor = cycle.endMs
      cues.push(...cycle.reps.map((rep) => rep.cue))
    }

    expect(cues.length).toBeGreaterThan(0)
    expect(new Set(cues).size).toBeGreaterThan(1)
    // The cue should reflect the actual angle miss, not the old flat template.
    expect(cues[0]).not.toBe('Knee depth over target')
  })

  it('numbers reps consecutively across a set', () => {
    const detector = new RepDetector(SQUAT)
    let cursor = 0
    const numbers: number[] = []

    for (let i = 0; i < 3; i += 1) {
      const cycle = pushRep(detector, cursor)
      cursor = cycle.endMs
      numbers.push(...cycle.reps.map((rep) => rep.rep))
    }

    expect(numbers).toEqual([1, 2, 3])
  })
})
