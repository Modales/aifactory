import type { FeedItem } from './simulation'

/** What the prompt needs from each feed entry — chronological order, oldest first. */
export type CoachFeedEntry = Pick<FeedItem, 'message' | 'severity'>

export interface CoachSummaryContext {
  exerciseName: string
  totalReps: number
}

const EXPECTED_BULLET_COUNT = 3

/**
 * Formats the session's live coaching feed into a prompt asking for a 3-bullet
 * post-workout summary. Deliberately built from just the feed messages (what the
 * lifter actually saw during the set) rather than raw per-rep telemetry — the
 * feed already is the coaching narrative, so the model just needs to distill it.
 */
export function buildCoachSummaryPrompt(feed: CoachFeedEntry[], context: CoachSummaryContext): string {
  const feedLines = feed.length
    ? feed.map((entry, i) => `${i + 1}. [${entry.severity.toUpperCase()}] ${entry.message}`).join('\n')
    : '(no coaching cues were triggered during this set)'

  return (
    "You are a strength coach writing a short post-workout note for a lifter, based on the " +
    'live coaching feed their app showed them during the set — messages that were triggered ' +
    'as issues came up, in order.\n\n' +
    `Exercise: ${context.exerciseName}\n` +
    `Total reps: ${context.totalReps}\n\n` +
    'Live coaching feed (chronological):\n' +
    `${feedLines}\n\n` +
    'Respond with EXACTLY 3 bullet points as a JSON array of 3 strings, most important first. ' +
    'Each bullet is one short, specific sentence the lifter would actually want to read — plain ' +
    'language, no jargon, no markdown formatting. Call out real patterns (e.g. "Form collapsed ' +
    'on rep 7 as fatigue set in") rather than just repeating individual feed lines verbatim. ' +
    'If the feed is empty or all positive, say so plainly instead of inventing problems. ' +
    'Respond with ONLY the JSON array, nothing else.'
  )
}

export class CoachSummaryParseError extends Error {}

/** Parses the model's response into exactly 3 bullets, tolerating a fenced code block. */
export function parseCoachSummaryBullets(raw: string): string[] {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new CoachSummaryParseError(`Model response was not valid JSON: ${raw}`)
  }

  if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === 'string')) {
    throw new CoachSummaryParseError(`Model response was not a JSON array of strings: ${raw}`)
  }

  if (parsed.length !== EXPECTED_BULLET_COUNT) {
    throw new CoachSummaryParseError(`Expected ${EXPECTED_BULLET_COUNT} bullets, got ${parsed.length}: ${raw}`)
  }

  return parsed
}
