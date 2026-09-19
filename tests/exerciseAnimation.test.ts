import { describe, expect, it } from 'vitest'
import { EXERCISES, ROUTINES, DEMO_SECONDS, exerciseById, playbackPosition } from '../src/lib/exerciseLibrary'
import { JOINTS, exercisePose, skinWeight } from '../src/lib/exerciseAnimation'
import { cameraShot } from '../src/lib/exerciseCamera'

describe('guided exercise demonstrations', () => {
  it('gives every routine a valid sequence and training prescription', () => {
    for (const routine of ROUTINES) {
      expect(routine.steps.length).toBeGreaterThanOrEqual(3)
      for (const step of routine.steps) {
        expect(exerciseById(step.exerciseId)).toBeDefined()
        expect(step.prescription).toMatch(/reps/)
      }
    }
  })
  it('organizes a broad catalog into the requested training categories', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(24)
    expect(new Set(EXERCISES.map(exercise => exercise.category))).toEqual(new Set(['Strength foundations', 'Bodybuilding accessories', 'Mobility & rehab']))
  })
  it('cuts through distinct camera views during each repetition', () => {
    const opening = cameraShot('upper', 0, 1.5)
    const detail = cameraShot('upper', .4, 1.5)
    const finish = cameraShot('upper', .75, 1.5)
    expect(new Set([opening.label, detail.label, finish.label]).size).toBe(3)
    expect(detail.zoom).toBeGreaterThan(opening.zoom)
  })
  it('scrubs exactly to a chapter and clamps the endpoint', () => {
    const sequence = ROUTINES[0].steps.map(s => exerciseById(s.exerciseId))
    expect(playbackPosition(DEMO_SECONDS, sequence).exercise.id).toBe('pushup')
    expect(playbackPosition(DEMO_SECONDS, sequence).cycle).toBe(0)
    const end = playbackPosition(1000, sequence)
    expect(end.index).toBe(sequence.length - 1)
    expect(end.cycle).toBe(0)
    expect(playbackPosition(-10, sequence).index).toBe(0)
  })
  it('moves each rig through a finite, continuous repetition', () => {
    for (const exercise of EXERCISES) {
      const start = exercisePose(exercise.id, 0)
      const work = exercisePose(exercise.id, .5)
      const end = exercisePose(exercise.id, 1)
      expect(start.rotations).toHaveLength(JOINTS.length)
      expect(work.rotations).not.toEqual(start.rotations)
      expect(end).toEqual(start)
      for (let cycle = 0; cycle <= 1; cycle += .05) {
        const pose = exercisePose(exercise.id, cycle)
        expect([...pose.rotations.flat(), ...pose.offset].every(Number.isFinite)).toBe(true)
      }
    }
  })
  it('keeps muscle skin weights normalized and bone assignments rigid', () => {
    for (const y of [.02, .1, .45, .82, .95, 1.05, 1.13, 1.4, 1.6]) {
      for (const x of [-.22, -.09, .09, .22]) {
        const weight = skinWeight('reference muscle', false, [x, y, 0], [x, y, 0])
        expect(weight.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
        expect(weight.weights.every(w => w >= 0 && w <= 1)).toBe(true)
        expect(weight.indices.every(i => i >= 0 && i < JOINTS.length)).toBe(true)
      }
    }
    expect(skinWeight('Left humerus', true, [.19, 1.25, 0], [.19, 1.12, 0]).weights[0]).toBe(1)
    expect(skinWeight('Left femur', true, [.1, .67, 0], [.1, .45, 0]).indices[0]).toBe(3)
  })
})
