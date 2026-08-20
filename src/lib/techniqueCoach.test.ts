import { describe, expect, it } from 'vitest'
import { TechniqueCoach } from './techniqueCoach'
import type { RepData } from './simulation'

function rep(index: number, severity: RepData['severity'], cue = 'Drive the floor away'): RepData {
  return {
    rep: index,
    tempo: 2,
    concentricTime: 1,
    eccentricTime: 1,
    peakAngle: 90,
    velocity: 80,
    formScore: severity === 'good' ? 90 : severity === 'warn' ? 72 : 50,
    effort: 50,
    cue,
    severity,
    flaws: severity === 'good' ? [] : ['Knee path'],
  }
}

describe('TechniqueCoach', () => {
  it('always delivers critical technique feedback immediately', () => {
    const coach = new TechniqueCoach()
    expect(coach.next(rep(1, 'crit'))?.speak).toBe(true)
    expect(coach.next(rep(2, 'crit'))?.severity).toBe('crit')
  })

  it('uses a bandwidth for repeated warnings', () => {
    const coach = new TechniqueCoach()
    expect(coach.next(rep(1, 'warn'))).not.toBeNull()
    expect(coach.next(rep(2, 'warn'))).toBeNull()
    expect(coach.next(rep(3, 'warn'))).not.toBeNull()
  })

  it('confirms a successful correction once', () => {
    const coach = new TechniqueCoach()
    coach.next(rep(1, 'warn'))
    expect(coach.next(rep(2, 'good'))?.message).toContain('Correction held')
    expect(coach.next(rep(3, 'good'))).toBeNull()
  })

  it('turns common errors into external-focus cues', () => {
    const coach = new TechniqueCoach()
    const feedback = coach.next(rep(1, 'crit', 'Knee valgus detected — push knees out'))
    expect(feedback?.message).toContain('floor apart')
  })
})
