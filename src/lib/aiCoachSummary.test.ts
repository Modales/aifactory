import { describe, expect, it } from 'vitest'
import { buildCoachSummaryPrompt, CoachSummaryParseError, parseCoachSummaryBullets } from './aiCoachSummary'

describe('buildCoachSummaryPrompt', () => {
  it('includes the exercise context and every feed message in order', () => {
    const prompt = buildCoachSummaryPrompt(
      [
        { message: 'Nice depth', severity: 'good' },
        { message: 'Knees drifting inward', severity: 'warn' },
        { message: 'Form collapsed — reset your brace', severity: 'crit' },
      ],
      { exerciseName: 'Back Squat', totalReps: 8 },
    )

    expect(prompt).toContain('Back Squat')
    expect(prompt).toContain('Total reps: 8')
    expect(prompt.indexOf('Nice depth')).toBeLessThan(prompt.indexOf('Knees drifting inward'))
    expect(prompt.indexOf('Knees drifting inward')).toBeLessThan(prompt.indexOf('Form collapsed'))
    expect(prompt).toContain('[WARN]')
    expect(prompt).toContain('[CRIT]')
  })

  it('asks for exactly 3 JSON bullets', () => {
    const prompt = buildCoachSummaryPrompt([], { exerciseName: 'Back Squat', totalReps: 0 })

    expect(prompt).toContain('EXACTLY 3')
    expect(prompt).toContain('JSON array')
  })

  it('tells the model explicitly when the feed is empty, instead of leaving it to guess', () => {
    const prompt = buildCoachSummaryPrompt([], { exerciseName: 'Back Squat', totalReps: 3 })

    expect(prompt).toContain('no coaching cues were triggered')
  })
})

describe('parseCoachSummaryBullets', () => {
  it('parses a clean JSON array', () => {
    const bullets = parseCoachSummaryBullets('["one", "two", "three"]')

    expect(bullets).toEqual(['one', 'two', 'three'])
  })

  it('unwraps a fenced code block the model wrapped the JSON in anyway', () => {
    const bullets = parseCoachSummaryBullets('```json\n["one", "two", "three"]\n```')

    expect(bullets).toEqual(['one', 'two', 'three'])
  })

  it('rejects a non-JSON response', () => {
    expect(() => parseCoachSummaryBullets('Sure, here is your summary!')).toThrow(CoachSummaryParseError)
  })

  it('rejects the wrong number of bullets', () => {
    expect(() => parseCoachSummaryBullets('["only one"]')).toThrow(CoachSummaryParseError)
  })

  it('rejects non-string items', () => {
    expect(() => parseCoachSummaryBullets('["fine", "fine", 3]')).toThrow(CoachSummaryParseError)
  })
})
