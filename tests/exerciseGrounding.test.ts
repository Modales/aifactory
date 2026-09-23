import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { EXERCISES } from '../src/lib/exerciseLibrary'
import { JOINTS, skinWeight } from '../src/lib/exerciseAnimation'
import { applyExercisePose, createExerciseRig, PALM_DOWN } from '../src/lib/exerciseKinematics'
import type { AnatomyAtlas } from '../src/lib/anatomyAtlas'

const atlas: AnatomyAtlas = JSON.parse(readFileSync('public/models/exercise-atlas.json', 'utf8'))
const bytes = gunzipSync(readFileSync(`public${atlas.chunks[0].gzip}`))
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
const points = atlas.parts.flatMap(part => {
  const positions = new Float32Array(buffer, part.positions, part.vertexCount * 3)
  const center = part.bounds[0].map((value, i) => (value + part.bounds[1][i]) / 2)
  return Array.from({ length: part.vertexCount }, (_, i) => {
    const point = Array.from(positions.subarray(i * 3, i * 3 + 3))
    return { point: new THREE.Vector3(...point), name: part.name, ...skinWeight(part.name, part.system === 'skeletal', center, point) }
  })
})

function posedMinimum(bones: THREE.Bone[], subset = points) {
  const matrices = bones.map((bone, i) => bone.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(...JOINTS[i].at.map(value => -value) as [number, number, number])))
  let min = Infinity, name = ''
  const point = new THREE.Vector3(), transformed = new THREE.Vector3()
  for (const vertex of subset) {
    point.set(0, 0, 0)
    vertex.weights.forEach((weight, i) => {
      if (weight) point.addScaledVector(transformed.copy(vertex.point).applyMatrix4(matrices[vertex.indices[i]]), weight)
    })
    if (point.y < min) { min = point.y; name = vertex.name }
  }
  return { min, name }
}

describe('library support geometry', () => {
  for (const exercise of EXERCISES) {
    it(`${exercise.name}: actual deformed atlas stays above the floor throughout a rep`, () => {
      const bones = createExerciseRig()
      for (const cycle of Array.from({ length: 33 }, (_, frame) => frame / 32)) {
        applyExercisePose(bones, exercise.id, cycle)
        const result = posedMinimum(bones)
        expect(result.min, `${exercise.id} cycle ${cycle}: ${result.name}`).toBeGreaterThanOrEqual(0)
      }
    })
  }
  it('plants both push-up wrists and toes without sliding and points fingers forward', () => {
    const bones = createExerciseRig()
    const anchors: THREE.Vector3[] = []
    for (let frame = 0; frame <= 40; frame++) {
      applyExercisePose(bones, 'pushup', frame / 40)
      const contacts = [11, 14].map(i => bones[i].getWorldPosition(new THREE.Vector3()))
      contacts.push(bones[5].localToWorld(new THREE.Vector3(.045, -.068, .156)), bones[8].localToWorld(new THREE.Vector3(-.045, -.068, .156)))
      if (!frame) anchors.push(...contacts.map(point => point.clone()))
      contacts.forEach((point, i) => expect(point.distanceTo(anchors[i])).toBeLessThan(.001))
      for (const i of [11, 14]) {
        expect(bones[i].getWorldQuaternion(new THREE.Quaternion()).angleTo(PALM_DOWN)).toBeLessThan(.00001)
        const fingers = new THREE.Vector3(0, -.147, .07).applyQuaternion(bones[i].getWorldQuaternion(new THREE.Quaternion()))
        expect(fingers.z).toBeGreaterThan(.15)
        expect(Math.abs(fingers.y)).toBeLessThan(.01)
      }
    }
  })
  it('keeps the push-up symmetric and lowers the torso between fixed supports', () => {
    const bones = createExerciseRig()
    applyExercisePose(bones, 'pushup', 0)
    const openingShoulder = (bones[9].getWorldPosition(new THREE.Vector3()).y + bones[12].getWorldPosition(new THREE.Vector3()).y) / 2
    applyExercisePose(bones, 'pushup', .5)
    const workingShoulder = (bones[9].getWorldPosition(new THREE.Vector3()).y + bones[12].getWorldPosition(new THREE.Vector3()).y) / 2
    expect(workingShoulder).toBeLessThan(openingShoulder - .15)
    expect(bones[10].getWorldPosition(new THREE.Vector3()).x).toBeGreaterThan(0)
    expect(bones[13].getWorldPosition(new THREE.Vector3()).x).toBeLessThan(0)
    expect(bones[9].getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(bones[12].getWorldPosition(new THREE.Vector3()).y, 6)
  })
  it('keeps all four cat-cow supports and the bird-dog support diagonal fixed', () => {
    const support: Record<'cat-cow' | 'bird-dog', number[]> = { 'cat-cow': [11, 14, 4, 7], 'bird-dog': [14, 4] }
    for (const movement of ['cat-cow', 'bird-dog'] as const) {
      const bones = createExerciseRig()
      const opening: THREE.Vector3[] = []
      for (let frame = 0; frame <= 40; frame++) {
        applyExercisePose(bones, movement, frame / 40)
        const contacts = support[movement].map(index => bones[index].getWorldPosition(new THREE.Vector3()))
        if (!frame) opening.push(...contacts.map(point => point.clone()))
        contacts.forEach((point, index) => expect(point.distanceTo(opening[index]), movement).toBeLessThan(.001))
      }
    }
  })
  it('keeps standing soles and calf-raise toe pivots planted', () => {
    for (const exercise of EXERCISES.filter(item => item.cameraFocus !== 'floor' && !['split-squat', 'hip-flexor'].includes(item.id))) {
      const bones = createExerciseRig()
      const opening: THREE.Vector3[] = []
      for (let frame = 0; frame <= 40; frame++) {
        applyExercisePose(bones, exercise.id, frame / 40)
        const contacts = [5, 8].map((index, side) => exercise.id === 'calf'
          ? bones[index].localToWorld(new THREE.Vector3(side ? -.045 : .045, -.068, .156))
          : bones[index].getWorldPosition(new THREE.Vector3()))
        if (!frame) opening.push(...contacts.map(point => point.clone()))
        contacts.forEach((point, i) => expect(point.distanceTo(opening[i]), exercise.id).toBeLessThan(.001))
      }
    }
  })
  it('keeps every solved movement finite and closes its animation loop', () => {
    for (const exercise of EXERCISES) {
      const bones = createExerciseRig()
      applyExercisePose(bones, exercise.id, 0)
      const opening = bones.map(bone => bone.matrixWorld.clone())
      for (let frame = 0; frame <= 40; frame++) {
        applyExercisePose(bones, exercise.id, frame / 40)
        expect(bones.every(bone => bone.matrixWorld.elements.every(Number.isFinite))).toBe(true)
      }
      bones.forEach((bone, i) => bone.matrixWorld.elements.forEach((value, j) => expect(value).toBeCloseTo(opening[i].elements[j], 8)))
    }
  })
})
