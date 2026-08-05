import { describe, expect, it } from 'vitest'
import {
  computeEffortIndex,
  computeFacialColorShift,
  computeJointAngle,
  computeSpeedDecay,
  evaluateFormTolerance,
  type FormToleranceMode,
} from './biomechanics'

describe('biomechanics utilities', () => {
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

  it('maps effort indexes to the right band', () => {
    expect(computeEffortIndex({ speedDecayPct: 10, facialColorShiftPct: 8, formScore: 82 }).level).toBe('LOW')
    expect(computeEffortIndex({ speedDecayPct: 42, facialColorShiftPct: 35, formScore: 68 }).level).toBe('MODERATE')
    expect(computeEffortIndex({ speedDecayPct: 65, facialColorShiftPct: 62, formScore: 45 }).level).toBe('HIGH')
  })
})
