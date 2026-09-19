import * as THREE from 'three'
import { JOINTS, exercisePose } from './exerciseAnimation'
import type { Movement } from './exerciseLibrary'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const rotationX = (angle: number) => new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), angle)
// The atlas is NOT a palms-forward bind pose. Its fingers slope forward and
// palms face backward. This calibrated world rotation puts palms on the floor.
export const PALM_DOWN = rotationX(-1.12)
export const PALM_HEIGHT = .030
export const TOE_STAND = rotationX(1.15)

export function createExerciseRig() {
  const bones = JOINTS.map(joint => { const bone = new THREE.Bone(); bone.name = joint.name; return bone })
  JOINTS.forEach((joint, i) => {
    bones[i].position.fromArray(joint.at)
    if (joint.parent >= 0) {
      bones[i].position.sub(new THREE.Vector3().fromArray(JOINTS.at(joint.parent)!.at))
      bones[joint.parent].add(bones[i])
    }
  })
  bones[0].updateMatrixWorld(true)
  return bones
}

function worldRotation(bone: THREE.Bone, target: THREE.Quaternion) {
  const parent = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
  bone.quaternion.copy(parent.invert().multiply(target))
  bone.updateMatrixWorld(true)
}

/** Analytic two-bone IK; retains the actual atlas segment lengths, including lateral offsets. */
export function solveLimb(bones: THREE.Bone[], start: number, target: THREE.Vector3, pole: THREE.Vector3) {
  const upper = bones[start], lower = bones[start + 1], end = bones[start + 2]
  const origin = upper.getWorldPosition(new THREE.Vector3())
  const direction = target.clone().sub(origin)
  const first = lower.position.length(), second = end.position.length()
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(first - second) + .00001, first + second - .00001)
  direction.normalize()
  const bend = pole.clone().sub(origin)
  bend.addScaledVector(direction, -bend.dot(direction)).normalize()
  const along = (first * first - second * second + distance * distance) / (2 * distance)
  const elbow = origin.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, first * first - along * along)))
  const aim = (bone: THREE.Bone, rest: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3) => {
    const parent = bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert()
    const localDirection = to.clone().sub(from).normalize().applyQuaternion(parent)
    bone.quaternion.setFromUnitVectors(rest.clone().normalize(), localDirection)
    bone.updateMatrixWorld(true)
  }
  aim(upper, lower.position, origin, elbow)
  aim(lower, end.position, elbow, origin.clone().addScaledVector(direction, distance))
}

function anchor(bones: THREE.Bone[], index: number, local: THREE.Vector3, target: THREE.Vector3) {
  const current = bones[index].localToWorld(local.clone())
  bones[0].position.add(target.clone().sub(current))
  bones[0].updateMatrixWorld(true)
}

/** Apply authored motion, then solve its support constraints. Used by renderer and geometry tests. */
export function applyExercisePose(bones: THREE.Bone[], movement: Movement, cycle: number) {
  const pose = exercisePose(movement, cycle)
  const t = (1 - Math.cos(2 * Math.PI * cycle)) / 2
  bones[0].position.fromArray(JOINTS[0].at).add(new THREE.Vector3().fromArray(pose.offset))
  pose.rotations.forEach((rotation, i) => bones[i].rotation.set(...rotation))
  bones[0].updateMatrixWorld(true)
  const hand = (arm: number, target: THREE.Vector3, pole: THREE.Vector3, orientation = PALM_DOWN) => {
    solveLimb(bones, arm, target, pole)
    worldRotation(bones[arm + 2], orientation)
  }
  const foot = (leg: number, target: THREE.Vector3, pole: THREE.Vector3, orientation = new THREE.Quaternion()) => {
    solveLimb(bones, leg, target, pole)
    worldRotation(bones[leg + 2], orientation)
  }

  if (movement === 'pushup') {
    // Straight trunk/legs pivot about the toes; wrists stay fixed for the entire rep.
    for (const leg of [3, 6]) worldRotation(bones[leg + 2], TOE_STAND)
    anchor(bones, 5, v(.045, -.068, .156), v(.13, .012, -.84))
    for (const [arm, side] of [[9, 1], [12, -1]]) {
      hand(arm, v(side * .27, PALM_HEIGHT, .43), v(side * .55, .18, .42))
    }
  } else if (movement === 'bird-dog' || movement === 'cat-cow') {
    // Knees remain under hips; untucked feet lie behind the shins, not through the floor.
    for (const [arm, side] of [[9, 1], [12, -1]]) {
      const reaching = movement === 'bird-dog' && arm === 9 ? t : 0
      hand(arm, v(side * (.23 - .05 * reaching), PALM_HEIGHT + .46 * reaching, .45 + .48 * reaching), v(side * .4, .3, .1), rotationX(-1.12 - .4 * reaching))
    }
    for (const leg of [3, 6]) worldRotation(bones[leg + 2], rotationX(Math.PI - (movement === 'bird-dog' && leg === 6 ? .9 * t : 0)))
  } else if (movement === 'glute-bridge') {
    for (const [leg, side] of [[3, 1], [6, -1]]) {
      foot(leg, v(side * .085, .075, .60), v(side * .1, .9, .4))
      hand(side === 1 ? 9 : 12, v(side * .26, PALM_HEIGHT, -.08), v(side * .35, .10, -.3))
    }
  } else if (movement === 'thoracic-rotation') {
    hand(12, v(-.50, PALM_HEIGHT + .006, .45), v(-.25, .20, .3))
    const angle = Math.PI * t
    hand(9, v(-.50, .16 + .45 * Math.sin(angle), .45 * Math.cos(angle)), v(-.4, .6, 0), rotationX(-1.12 + angle))
  } else if (movement !== 'dead-bug') {
    // All standing demonstrations share planted soles instead of approximate root offsets.
    for (const [leg, side] of [[3, 1], [6, -1]]) {
      if (movement === 'split-squat' || movement === 'hip-flexor') {
        foot(leg, v(side * .085, leg === 3 ? .075 : .17, leg === 3 ? .28 : -.43), v(side * .1, .25, .55), leg === 3 ? new THREE.Quaternion() : TOE_STAND)
      } else if (movement === 'calf') {
        const orientation = rotationX(.5 * t)
        const toe = v(.045 * side, -.068, .156).applyQuaternion(orientation)
        foot(leg, v(.13 * side, .007, .136).sub(toe), v(side * .1, .45, .1), orientation)
      } else {
        foot(leg, v(side * .085, .075, -.02), v(side * .1, .45, .65))
      }
    }
    if (movement === 'overhead-press' || movement === 'wall-slide') {
      for (const [arm, side] of [[9, 1], [12, -1]]) {
        const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side * Math.PI / 2, side * Math.PI))
        hand(arm, v(side * (.28 - .10 * t), 1.43 + .46 * t, movement === 'wall-slide' ? -.04 : .08), v(side * .7, 1.3, 0), orientation)
      }
    }
  }
  bones[0].updateMatrixWorld(true)
  return pose
}
