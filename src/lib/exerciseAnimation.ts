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

export interface ExercisePose {
  rotations: [number, number, number][]
  offset: [number, number, number]
  intensity: number
  gripRotation: [number, number, number]
}

/** Deterministic educational motion, not captured biomechanics or form-scoring targets. */
export function exercisePose(movement: Movement, cycle: number): ExercisePose {
  const t = (1 - Math.cos(Math.PI * 2 * cycle)) / 2
  const rotations: [number, number, number][] = JOINTS.map(() => [0, 0, 0])
  const offset: [number, number, number] = [0, 0, 0]
  let gripRotation: [number, number, number] = [0, 0, 0]
  const both = (left: number, right: number, axis: 0 | 1 | 2, value: number, mirrored = false) => {
    rotations[left][axis] = value
    rotations[right][axis] = mirrored ? -value : value
  }
  const legs = (thigh: number, shin: number) => {
    for (const i of [3, 6]) {
      rotations[i][0] = thigh
      rotations[i + 1][0] = shin
      rotations[i + 2][0] = -thigh - shin
    }
    offset[1] = -.435 * (1 - Math.cos(thigh)) - .375 * (1 - Math.cos(thigh + shin))
    offset[2] = .435 * Math.sin(thigh) + .375 * Math.sin(thigh + shin)
  }
  const floorBody = (tilt = 1.2, height = -.56) => {
    rotations[0][0] = tilt
    offset[1] = height
    rotations[5][0] = rotations[8][0] = -.35
  }

  if (movement === 'squat') {
    legs(-1.08 * t, 1.48 * t); rotations[1][0] = .28 * t; rotations[2][0] = -.12 * t
    both(9, 12, 0, -1.15 - .3 * t); both(10, 13, 0, -.12)
  } else if (movement === 'hinge' || movement === 'deadlift') {
    legs(-.38 * t, .52 * t); rotations[1][0] = .88 * t
    if (movement === 'deadlift') both(9, 12, 0, -.12)
  } else if (movement === 'split-squat' || movement === 'hip-flexor') {
    rotations[3][0] = -.88 * t; rotations[4][0] = 1.25 * t; rotations[5][0] = -.37 * t
    rotations[6][0] = .5 * t; rotations[7][0] = .72 * t; rotations[8][0] = -.35 * t
    offset[1] = -.32 * t; offset[2] = .12 * t
    if (movement === 'hip-flexor') { rotations[1][0] = -.08 * t; both(9, 12, 0, -.45) }
  } else if (movement === 'glute-bridge') {
    floorBody(Math.PI / 2, -.46); rotations[3][0] = rotations[6][0] = -1.05 + .22 * t
    rotations[4][0] = rotations[7][0] = 1.55 - .18 * t; offset[1] += .18 * t
    both(9, 12, 0, -1.35)
  } else if (movement === 'pushup') {
    const tilt = 1.2 + .16 * t; floorBody(tilt, -.56 - .14 * t)
    for (const arm of [9, 12]) { rotations[arm][0] = -tilt + .7 * t; rotations[arm + 1][0] = -1.5 * t; rotations[arm + 2][0] = -Math.PI / 2 + .72 * t }
  } else if (movement === 'overhead-press') {
    both(9, 12, 2, 1.12 + .43 * t, true); both(10, 13, 0, -1.55 + 1.4 * t)
    both(11, 14, 1, Math.PI / 2, true); gripRotation = [0, 0, Math.PI / 2]
  } else if (movement === 'bent-row') {
    legs(-.25, .34); rotations[1][0] = .78
    both(9, 12, 0, -.15 + .7 * t); both(10, 13, 0, -1.65 * t)
  } else if (movement === 'curl' || movement === 'hammer-curl') {
    both(10, 13, 0, -.1 - 2.0 * t)
    both(11, 14, 1, movement === 'hammer-curl' ? 0 : Math.PI / 2, true)
    gripRotation = movement === 'hammer-curl' ? [0, Math.PI / 2, 0] : [0, 0, 0]
  } else if (movement === 'raise') {
    both(9, 12, 2, 1.35 * t, true); both(10, 13, 0, -.14); both(11, 14, 1, Math.PI / 2, true)
  } else if (movement === 'front-raise') {
    both(9, 12, 0, -1.4 * t); both(10, 13, 0, -.1); both(11, 14, 1, Math.PI / 2, true)
  } else if (movement === 'reverse-fly') {
    legs(-.22, .3); rotations[1][0] = .82
    both(9, 12, 2, 1.28 * t, true); both(10, 13, 0, -.12)
  } else if (movement === 'triceps-extension') {
    both(9, 12, 0, -2.8); both(9, 12, 2, .18, true); both(10, 13, 0, -1.8 + 1.68 * t)
    both(11, 14, 1, Math.PI / 2, true); gripRotation = [0, 0, Math.PI / 2]
  } else if (movement === 'kickback') {
    legs(-.22, .3); rotations[1][0] = .82; both(9, 12, 0, .72); both(10, 13, 0, -1.5 + 1.43 * t)
  } else if (movement === 'calf') {
    offset[1] = .065 * t; rotations[5][0] = rotations[8][0] = -.5 * t
  } else if (movement === 'bird-dog') {
    floorBody(Math.PI / 2, -.56); rotations[3][0] = -.95; rotations[4][0] = 1.35; rotations[6][0] = -.95 + 1.15 * t; rotations[7][0] = 1.35 - 1.15 * t
    rotations[9][0] = -1.45 * t; rotations[12][0] = -.55; rotations[13][0] = -1.15
  } else if (movement === 'dead-bug') {
    floorBody(-Math.PI / 2, -.42); both(3, 6, 0, -1.45); both(4, 7, 0, 1.45)
    rotations[3][0] += .75 * t; rotations[4][0] -= .75 * t; rotations[12][0] = -1.45 + 1.25 * t
    rotations[9][0] = -1.45; rotations[10][0] = rotations[13][0] = -.12
  } else if (movement === 'wall-slide') {
    both(9, 12, 2, .65 + .85 * t, true); both(10, 13, 0, -1.5 + 1.35 * t); both(11, 14, 1, Math.PI / 2, true)
  } else if (movement === 'thoracic-rotation') {
    floorBody(1.4, -.48); rotations[1][1] = .85 * t; rotations[2][1] = .35 * t
    rotations[9][0] = -1.2; rotations[12][0] = -1.2 + .6 * t; rotations[12][2] = -1.25 * t
  } else if (movement === 'external-rotation') {
    both(9, 12, 2, .18, true); both(10, 13, 0, -1.5); both(10, 13, 1, .78 * t, true)
    both(11, 14, 1, Math.PI / 2, true)
  } else if (movement === 'ankle-rock') {
    rotations[3][0] = -.18 * t; rotations[4][0] = .52 * t; rotations[5][0] = -.34 * t
    rotations[6][0] = .1; rotations[7][0] = -.05; rotations[1][0] = .08 * t
  } else if (movement === 'cat-cow') {
    floorBody(Math.PI / 2, -.55); both(3, 6, 0, -.95); both(4, 7, 0, 1.38)
    both(9, 12, 0, -.55); both(10, 13, 0, -1.15); rotations[1][0] = -.3 + .6 * t; rotations[2][0] = .2 - .42 * t
  }
  return { rotations, offset, intensity: .45 + .55 * t, gripRotation }
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))
/** Two-joint soft-tissue weights with explicit rigid bone assignment. */
export function skinWeight(name: string, skeletal: boolean, center: number[], point: number[]): { indices: number[]; weights: number[] } {
  const n = name.toLowerCase(), side = center[0] >= 0 ? 0 : 1, y = point[1]
  const pair = (a: number, b: number, weight: number) => ({ indices: [a, b, 0, 0], weights: [1 - weight, weight, 0, 0] })
  const rigid = (i: number) => pair(i, i, 0)
  const upper = side ? 12 : 9, thigh = side ? 6 : 3
  if (skeletal) {
    if (/humerus/.test(n)) return rigid(upper)
    if (/radius|ulna/.test(n)) return rigid(upper + 1)
    if (/carpal|metacarpal|finger|thumb|hand/.test(n)) return rigid(upper + 2)
    if (/femur|patella/.test(n)) return rigid(thigh)
    if (/tibia|fibula/.test(n)) return rigid(thigh + 1)
    if (/foot|tarsal|metatarsal|toe|calcaneus|talus|sesamoid/.test(n)) return rigid(thigh + 2)
  }
  const arm = (Math.abs(center[0]) > .165 && center[1] > .65) || /deltoid|biceps brachii|triceps brachii|brachialis/.test(n)
  const leg = center[1] < .83 || /gluteus|rectus femoris|vastus|adductor|biceps femoris|semitendinosus|semimembranosus/.test(n)
  if (arm) {
    if (skeletal) return rigid(center[1] < .87 ? upper + 2 : center[1] < 1.13 ? upper + 1 : upper)
    if (y > 1.34) return pair(1, upper, clamp((1.43 - y) / .09))
    if (y > 1.02) return pair(upper, upper + 1, clamp((1.16 - y) / .1))
    return pair(upper + 1, upper + 2, clamp((.92 - y) / .08))
  }
  if (leg) {
    if (skeletal) return rigid(center[1] > .44 ? thigh : center[1] > .08 ? thigh + 1 : thigh + 2)
    if (y > .8) return pair(0, thigh, clamp((.94 - y) / .14))
    if (y > .32) return pair(thigh, thigh + 1, clamp((.51 - y) / .12))
    return pair(thigh + 1, thigh + 2, clamp((.12 - y) / .08))
  }
  if (center[1] > 1.48) return rigid(2)
  if (skeletal) return rigid(center[1] > 1.03 ? 1 : 0)
  return pair(0, 1, clamp((y - .92) / .17))
}
