import { describe, expect, it } from 'vitest'
import {
  buildRepAnalysis,
  computeEffortIndex,
  computeFacialColorShift,
  computeJointAngle,
  computeSpeedDecay,
  describeJointFlaw,
  evaluateExerciseFormTolerance,
  evaluateFormTolerance,
  initCoachingHysteresis,
  normalizeFormToleranceMode,
  stabilizeCoachingSeverity,
  type AngleRange,
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

  it('measures speed decay as a percentage drop between baseline and recent windows', () => {
    const decay = computeSpeedDecay([1, 0.82, 0.71, 0.66])

    expect(decay).toBeGreaterThan(15)
    expect(decay).toBeLessThan(35)
  })

  it('does not let a single anomalous rep spike the decay reading', () => {
    // A steady set with one glitchy slow rep as the most recent sample.
    const spiky = computeSpeedDecay([1, 1, 1, 1, 1, 0.3])
    // A true sustained slowdown across the whole recent window.
    const sustained = computeSpeedDecay([1, 1, 1, 0.3, 0.3, 0.3])

    expect(spiky).toBeLessThan(sustained)
    expect(spiky).toBeLessThan(30)
  })

  it('returns zero facial shift for the same skin tone', () => {
    const shift = computeFacialColorShift(
      { r: 180, g: 150, b: 136 },
      { r: 180, g: 150, b: 136 },
    )

    expect(shift).toBe(0)
  })

  it('normalizes the UI sensitivity setting into the tolerance model', () => {
    expect(normalizeFormToleranceMode('Standard')).toBe('Moderate')
    expect(normalizeFormToleranceMode('Strict')).toBe('Strict')
    expect(normalizeFormToleranceMode('Lenient')).toBe('Lenient')
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

  it('renormalizes over the remaining signals instead of treating a missing facial signal as zero', () => {
    // Maximal speed decay and total form breakdown with no facial signal available
    // should be able to reach the top of the scale, not cap out at 65 because a
    // phantom 0 was silently mixed in for the missing 0.35-weighted facial term.
    const withoutFacial = computeEffortIndex({ speedDecayPct: 100, formScore: 0 })
    expect(withoutFacial.value).toBe(100)
    expect(withoutFacial.level).toBe('HIGH')

    // Passing an explicit 0 (a real, weak facial signal) is different from omitting
    // it entirely, and should still be weighted rather than dropped.
    const withZeroFacial = computeEffortIndex({ speedDecayPct: 100, facialColorShiftPct: 0, formScore: 0 })
    expect(withZeroFacial.value).toBeLessThan(withoutFacial.value)
  })

  it('debounces a single noisy frame but commits a sustained escalation after the hysteresis window', () => {
    let state = initCoachingHysteresis()
    expect(state.stableSeverity).toBe('good')

    // A single noisy frame reporting 'crit' shouldn't flip the HUD immediately.
    state = stabilizeCoachingSeverity(state, 'crit', 1000)
    expect(state.stableSeverity).toBe('good')

    // ...and recovering right away cancels the pending escalation.
    state = stabilizeCoachingSeverity(state, 'good', 1100)
    expect(state.stableSeverity).toBe('good')

    // A sustained problem that persists past the hysteresis window does commit.
    state = stabilizeCoachingSeverity(state, 'warn', 2000)
    expect(state.stableSeverity).toBe('good')
    state = stabilizeCoachingSeverity(state, 'warn', 2600)
    expect(state.stableSeverity).toBe('warn')

    // Recovering to 'good' is applied immediately, without waiting.
    state = stabilizeCoachingSeverity(state, 'good', 2650)
    expect(state.stableSeverity).toBe('good')
  })

  describe('describeJointFlaw', () => {
    const KNEE_RANGE: AngleRange = { min: 85, max: 105, ideal: 90, label: 'Knee depth' }

    it('returns null for a value inside the target band', () => {
      expect(describeJointFlaw({ range: KNEE_RANGE, value: 92, variantSeed: 0 })).toBeNull()
    })

    it('names the joint in plain language, without exposing raw degree numbers', () => {
      const message = describeJointFlaw({ range: KNEE_RANGE, value: 70, variantSeed: 0 })

      expect(message).toContain('Knee depth')
      expect(message).not.toMatch(/\d/)
    })

    it('picks a different phrasing for a small miss than a large one', () => {
      const mild = describeJointFlaw({ range: KNEE_RANGE, value: 80, variantSeed: 0 }) // 5° under, mild
      const severe = describeJointFlaw({ range: KNEE_RANGE, value: 60, variantSeed: 0 }) // 25° under, severe

      expect(mild).not.toBe(severe)
    })

    it('rotates through several phrasings across reps instead of repeating one sentence', () => {
      const seen = new Set(
        Array.from({ length: 6 }, (_, i) => describeJointFlaw({ range: KNEE_RANGE, value: 70, variantSeed: i })),
      )

      expect(seen.size).toBeGreaterThan(1)
    })

    it('phrases an overshoot differently from an undershoot', () => {
      const under = describeJointFlaw({ range: KNEE_RANGE, value: 70, variantSeed: 0 })
      const over = describeJointFlaw({ range: KNEE_RANGE, value: 120, variantSeed: 0 })

      expect(under).not.toBe(over)
    })
  })
})
