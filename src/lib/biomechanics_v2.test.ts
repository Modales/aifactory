import { describe, expect, it } from 'vitest'
import {
  buildRepAnalysis,
  computeEffortIndex,
  computeFacialColorShift,
  computeJointAngle,
  computeSpeedDecay,
  evaluateExerciseFormTolerance,
  evaluateFormTolerance,
  type FormToleranceMode,
} from './biomechanics_v2'

describe('biomechanics_v2 utilities', () => {
  it('computes a right angle from three vectors', () => {
    const angle = computeJointAngle(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    )

    expect(Math.round(angle)).toBe(90)
  })

  it('flags perfect depth under strict tolerances', () => {
    const result = evaluateFormTolerance({
      mode: 'Strict' as FormToleranceMode,
      knee_angle: 86,
      hip_angle: 74,
      back_angle: 32,
    })

    expect(result.status).toContain('PERFECT DEPTH')
  })

  it('uses exercise-specific angle ranges instead of a single fixed target', () => {
    const result = evaluateExerciseFormTolerance({
      mode: 'Moderate' as FormToleranceMode,
      exerciseId: 'squat',
      knee_angle: 90,
      hip_angle: 100,
      back_angle: 35,
    })

    expect(result.status).toContain('PERFECT DEPTH')
    expect(result.status).toContain('HIP STACKED')
    expect(result.status).toContain('BACK NEUTRAL')
  })

  it('ignores irrelevant joint scores for curl and bench', () => {
    const bench = evaluateExerciseFormTolerance({
      mode: 'Strict' as FormToleranceMode,
      exerciseId: 'bench',
      knee_angle: 20,
      hip_angle: 20,
      back_angle: 30,
    })

    expect(bench.details.knee).toContain('not scored')
    expect(bench.details.hip).toContain('not scored')
    expect(bench.details.back).toContain('not scored')
  })

  it('measures speed decay as a percentage drop', () => {
    const decay = computeSpeedDecay([1, 0.82, 0.71, 0.66])

    expect(decay).toBeGreaterThan(30)
    expect(decay).toBeLessThan(50)
  })

  it('returns zero facial shift for the same skin tone', () => {
    const shift = computeFacialColorShift(
      { r: 180, g: 150, b: 136 },
      { r: 180, g: 150, b: 136 },
    )

    expect(shift).toBe(0)
  })

  it('derives a live rep score from joint angles and effort inputs', () => {
    const result = buildRepAnalysis({
      exerciseId: 'squat',
      mode: 'Moderate',
      knee_angle: 90,
      hip_angle: 100,
      back_angle: 35,
      speedDecayPct: 44,
      facialColorShiftPct: 36,
      formScore: 80,
    })

    expect(result.formResult.status).toContain('PERFECT DEPTH')
    expect(result.formScore).toBeGreaterThan(70)
    expect(result.effortResult.level).toBe('MODERATE')
    expect(result.severity).toBe('warn')
  })

  it('maps effort indexes to the right band', () => {
    expect(computeEffortIndex({ speedDecayPct: 10, facialColorShiftPct: 8, formScore: 82 }).level).toBe('LOW')
    expect(computeEffortIndex({ speedDecayPct: 42, facialColorShiftPct: 35, formScore: 68 }).level).toBe('MODERATE')
    expect(computeEffortIndex({ speedDecayPct: 65, facialColorShiftPct: 62, formScore: 45 }).level).toBe('HIGH')
  })
})
