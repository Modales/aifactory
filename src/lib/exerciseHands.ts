import type { Movement } from './exerciseLibrary'

export type HandRotation = [number, number, number]
export interface ExerciseHandPose {
  left: HandRotation
  right: HandRotation
  leftGrip: HandRotation
  rightGrip: HandRotation
}

interface HandProfile {
  rest: [HandRotation, HandRotation]
  work?: [HandRotation, HandRotation]
  grip?: [HandRotation, HandRotation]
}

const PI = Math.PI
const pair = (left: HandRotation, right: HandRotation, work?: [HandRotation, HandRotation], grip?: [HandRotation, HandRotation]): HandProfile => ({
  rest: [left, right],
  work,
  grip,
})
const mirrored = (twist: number, flex = 0, deviation = 0, workTwist = twist, workFlex = flex): HandProfile => pair(
  [flex, twist, deviation],
  [flex, -twist, -deviation],
  [[workFlex, workTwist, deviation], [workFlex, -workTwist, -deviation]],
)

/**
 * Per-exercise wrist intent in local joint space. Keeping these values separate
 * from the body animation makes grip direction easy to tune without rewriting a movement.
 */
export const EXERCISE_HANDS: Record<Movement, HandProfile> = {
  squat: mirrored(PI / 2, -.08, -.08),
  pushup: mirrored(0),
  hinge: mirrored(PI / 2, .04),
  'split-squat': mirrored(PI / 2, -.04),
  'glute-bridge': mirrored(0),
  'overhead-press': mirrored(PI / 2, 0, 0, PI / 2, -.08),
  'bent-row': mirrored(PI / 2, .06, 0, PI / 2, -.08),
  deadlift: mirrored(PI / 2, .04),
  curl: mirrored(PI, 0, 0, PI, -.10),
  'hammer-curl': mirrored(PI / 2, 0, 0, PI / 2, -.06),
  raise: mirrored(PI / 2, 0, 0, 0, -.10),
  'front-raise': mirrored(PI / 2, 0, 0, 0, -.10),
  'reverse-fly': mirrored(PI / 2, .05, 0, 0, -.08),
  'triceps-extension': mirrored(PI / 2, -.08),
  calf: mirrored(PI / 2, -.03),
  kickback: mirrored(PI / 2, .05, 0, PI / 2, -.10),
  'bird-dog': mirrored(0),
  'dead-bug': mirrored(0, 0, 0, 0, -.12),
  'wall-slide': mirrored(0, 0, 0, 0, -.08),
  'hip-flexor': mirrored(PI / 2, -.04),
  'thoracic-rotation': mirrored(0),
  'external-rotation': mirrored(PI / 2, 0, 0, PI / 2, -.06),
  'ankle-rock': mirrored(PI / 2, -.03),
  'cat-cow': mirrored(0),
}

const mixRotation = (from: HandRotation, to: HandRotation, amount: number): HandRotation => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
]

export function exerciseHandPose(movement: Movement, effort: number): ExerciseHandPose {
  const profile = EXERCISE_HANDS[movement]
  const work = profile.work ?? profile.rest
  const grip = profile.grip ?? [[0, 0, 0], [0, 0, 0]]
  return {
    left: mixRotation(profile.rest[0], work[0], effort),
    right: mixRotation(profile.rest[1], work[1], effort),
    leftGrip: grip[0],
    rightGrip: grip[1],
  }
}
