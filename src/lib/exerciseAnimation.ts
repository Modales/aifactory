import type { Movement } from './exerciseLibrary'

/** BodyParts3D's standing reference, meters, Y-up; left is +X. */
export const JOINTS = [
  { name: 'pelvis', parent: -1, at: [0, .9, -.03] },
  { name: 'torso', parent: 0, at: [0, .97, -.03] },
  { name: 'head', parent: 1, at: [0, 1.47, -.02] },
  { name: 'left thigh', parent: 0, at: [.095, .885, -.03] },
  { name: 'left shin', parent: 3, at: [.08, .45, -.015] },
  { name: 'left foot', parent: 4, at: [.085, .075, -.02] },
  { name: 'right thigh', parent: 0, at: [-.095, .885, -.03] },
  { name: 'right shin', parent: 6, at: [-.08, .45, -.015] },
  { name: 'right foot', parent: 7, at: [-.085, .075, -.02] },
  { name: 'left upper arm', parent: 1, at: [.16, 1.4, -.025] },
  { name: 'left forearm', parent: 9, at: [.215, 1.115, -.025] },
  { name: 'left hand', parent: 10, at: [.245, .885, .015] },
  { name: 'right upper arm', parent: 1, at: [-.16, 1.4, -.025] },
  { name: 'right forearm', parent: 12, at: [-.215, 1.115, -.025] },
  { name: 'right hand', parent: 13, at: [-.245, .885, .015] },
] as const

export interface ExercisePose { rotations: [number, number, number][]; offset: [number, number, number]; intensity: number }
/** Deterministic educational motion, not captured biomechanics or form-scoring targets. */
export function exercisePose(movement: Movement, cycle: number): ExercisePose {
  const t = (1 - Math.cos(Math.PI * 2 * cycle)) / 2
  const rotations: [number, number, number][] = JOINTS.map(() => [0, 0, 0])
  const offset: [number, number, number] = [0, 0, 0]
  const legs = (thigh: number, shin: number) => {
    for (const i of [3, 6]) {
      rotations[i][0] = thigh
      rotations[i + 1][0] = shin
      rotations[i + 2][0] = -thigh - shin
    }
    // Keep the ankle on the floor throughout the sagittal leg chain.
    offset[1] = -.435 * (1 - Math.cos(thigh)) - .375 * (1 - Math.cos(thigh + shin))
    offset[2] = .435 * Math.sin(thigh) + .375 * Math.sin(thigh + shin)
  }
  if (movement === 'squat') {
    legs(-1.12 * t, 1.52 * t)
    rotations[1][0] = .3 * t
    rotations[2][0] = -.15 * t
    rotations[9][0] = rotations[12][0] = -1.2 - .3 * t
    rotations[10][0] = rotations[13][0] = -.15
  } else if (movement === 'hinge') {
    legs(-.45 * t, .65 * t)
    rotations[1][0] = .9 * t
    rotations[9][0] = rotations[12][0] = -.9 * t
  } else if (movement === 'curl') {
    rotations[10][0] = rotations[13][0] = -.12 - 2.05 * t
  } else if (movement === 'raise') {
    rotations[9][2] = 1.35 * t
    rotations[12][2] = -1.35 * t
    rotations[10][0] = rotations[13][0] = -.14
  } else if (movement === 'calf') {
    offset[1] = .065 * t
    rotations[5][0] = rotations[8][0] = -.5 * t
  } else if (movement === 'pushup') {
    const tilt = 1.2 + .19 * t
    rotations[0][0] = tilt
    offset[1] = -.56 - .15 * t
    for (const arm of [9, 12]) {
      rotations[arm][0] = -tilt + .78 * t
      rotations[arm + 1][0] = -1.56 * t
      rotations[arm + 2][0] = -Math.PI / 2 + .78 * t
    }
    rotations[5][0] = rotations[8][0] = -.35
  }
  return { rotations, offset, intensity: .45 + .55 * t }
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))
/** Two-joint weights for muscles; long bones stay rigid rather than bending. */
export function skinWeight(name: string, skeletal: boolean, center: number[], point: number[]): { indices: number[]; weights: number[] } {
  const n = name.toLowerCase(), side = center[0] >= 0 ? 0 : 1, y = point[1]
  const pair = (a: number, b: number, weight: number) => ({ indices: [a, b, 0, 0], weights: [1 - weight, weight, 0, 0] })
  const rigid = (i: number) => pair(i, i, 0)
  const arm = (Math.abs(center[0]) > .165 && center[1] > .65) || /deltoid|biceps brachii|triceps brachii|brachialis/.test(n)
  const leg = center[1] < .83 || /gluteus|rectus femoris|vastus|adductor|biceps femoris|semitendinosus|semimembranosus/.test(n)
  if (arm) {
    const upper = side ? 12 : 9
    if (skeletal) return rigid(center[1] < .87 ? upper + 2 : center[1] < 1.13 ? upper + 1 : upper)
    if (y > 1.34) return pair(1, upper, clamp((1.43 - y) / .09))
    if (y > 1.02) return pair(upper, upper + 1, clamp((1.16 - y) / .1))
    return pair(upper + 1, upper + 2, clamp((.92 - y) / .08))
  }
  if (leg) {
    const thigh = side ? 6 : 3
    if (skeletal) return rigid(/femur|patella/.test(n) ? thigh : center[1] > .15 ? thigh + 1 : thigh + 2)
    if (y > .8) return pair(0, thigh, clamp((.94 - y) / .14))
    if (y > .32) return pair(thigh, thigh + 1, clamp((.51 - y) / .12))
    return pair(thigh + 1, thigh + 2, clamp((.12 - y) / .08))
  }
  if (center[1] > 1.48) return rigid(2)
  if (skeletal) return rigid(center[1] > 1.03 ? 1 : 0)
  return pair(0, 1, clamp((y - .92) / .17))
}
