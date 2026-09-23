import { describe, expect, it } from 'vitest'
import { estimateMuscleLoad } from './muscleModel'
import type { RepData } from './simulation'

const reps: RepData[] = Array.from({ length: 5 }, (_, index) => ({
  rep: index + 1,
  tempo: 2.5,
  concentricTime: 1,
  eccentricTime: 1.5,
  peakAngle: 90 + index,
  velocity: 100,
  formScore: 90,
  effort: 60,
  cue: 'Good rep',
  severity: 'good',
}))

describe('estimateMuscleLoad', () => {
  it('ranks squat quads and glutes as primary demand', () => {
    const result = estimateMuscleLoad('squat', reps)
    expect(result.entries.slice(0, 2).map((entry) => entry.id)).toEqual(['quads', 'glutes'])
    expect(result.entries[0].role).toBe('primary')
  })

  it('reduces confidence when fewer than three reps are observed', () => {
    expect(estimateMuscleLoad('deadlift', reps.slice(0, 2)).confidence).toBe('low')
  })

  it('never presents estimates above 100', () => {
    expect(estimateMuscleLoad('bench', reps).entries.every((entry) => entry.score <= 100)).toBe(true)
  })
})
