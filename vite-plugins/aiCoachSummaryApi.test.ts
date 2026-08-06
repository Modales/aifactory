import { describe, expect, it } from 'vitest'
import { handleCoachSummaryRequest } from './aiCoachSummaryApi'

const VALID_BODY = {
  feed: [
    { message: 'Nice depth', severity: 'good' },
    { message: 'Knees drifting inward', severity: 'warn' },
  ],
  exerciseName: 'Back Squat',
  totalReps: 8,
}

describe('handleCoachSummaryRequest', () => {
  it('returns 400 for a malformed body', async () => {
    const result = await handleCoachSummaryRequest({ nonsense: true }, {})

    expect(result.status).toBe(400)
  })

  it('returns 503 when the provider API key is not set', async () => {
    const result = await handleCoachSummaryRequest(VALID_BODY, {})

    expect(result.status).toBe(503)
    expect(result.body).toMatchObject({ error: expect.stringContaining('ANTHROPIC_API_KEY') })
  })

  it('returns the parsed bullets from the completion function on success', async () => {
    const complete = async (name: string, prompt: string, apiKey: string) => {
      expect(name).toBe('anthropic')
      expect(prompt).toContain('Back Squat')
      expect(apiKey).toBe('test-key')
      return '["one", "two", "three"]'
    }

    const result = await handleCoachSummaryRequest(VALID_BODY, { ANTHROPIC_API_KEY: 'test-key' }, complete)

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ bullets: ['one', 'two', 'three'] })
  })

  it('returns 502 when the model response cannot be parsed into 3 bullets', async () => {
    const complete = async () => 'not json at all'

    const result = await handleCoachSummaryRequest(VALID_BODY, { ANTHROPIC_API_KEY: 'test-key' }, complete)

    expect(result.status).toBe(502)
  })

  it('returns 502 when the completion call itself throws', async () => {
    const complete = async () => {
      throw new Error('network blew up')
    }

    const result = await handleCoachSummaryRequest(VALID_BODY, { ANTHROPIC_API_KEY: 'test-key' }, complete)

    expect(result.status).toBe(502)
    expect(result.body).toMatchObject({ error: expect.stringContaining('network blew up') })
  })

  it('uses OpenAI instead when AI_COACH_PROVIDER=openai, checking its own key', async () => {
    const result503 = await handleCoachSummaryRequest(VALID_BODY, { AI_COACH_PROVIDER: 'openai' })
    expect(result503.status).toBe(503)
    expect(result503.body).toMatchObject({ error: expect.stringContaining('OPENAI_API_KEY') })

    const complete = async (name: string, _prompt: string, apiKey: string) => {
      expect(name).toBe('openai')
      expect(apiKey).toBe('openai-test-key')
      return '["one", "two", "three"]'
    }
    const result = await handleCoachSummaryRequest(
      VALID_BODY,
      { AI_COACH_PROVIDER: 'openai', OPENAI_API_KEY: 'openai-test-key' },
      complete,
    )
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ bullets: ['one', 'two', 'three'] })
  })
})
