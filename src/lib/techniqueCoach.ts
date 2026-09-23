import type { RepData } from './simulation'

export interface TechniqueFeedback {
  message: string
  severity: RepData['severity']
  speak: boolean
}

const FEEDBACK_GAP_REPS = 2
const POSITIVE_FEEDBACK_INTERVAL = 3

function externalFocusCue(rep: RepData): string {
  const cue = rep.cue.toLowerCase()
  if (cue.includes('knee') && (cue.includes('inward') || cue.includes('valgus') || cue.includes('collaps'))) {
    return 'Drive the floor apart and keep your knees tracking over your toes.'
  }
  if (cue.includes('bar') && (cue.includes('drift') || cue.includes('path'))) {
    return 'Keep the bar tracing the same line close to your body.'
  }
  if (cue.includes('heel') || cue.includes('mid-foot')) {
    return 'Keep pressure through your whole foot as you move the load.'
  }
  if (cue.includes('shallow') || cue.includes('short') || cue.includes('range')) {
    return 'Reach the same end-range marker, then reverse smoothly.'
  }
  if (cue.includes('past target') || cue.includes('overshoot') || cue.includes('beyond target')) {
    return 'Stop at the target marker, then reverse smoothly.'
  }
  return rep.cue
}

/**
 * Prioritizes one actionable technique cue at a time.
 * Critical errors are immediate; lower-severity feedback uses a bandwidth so
 * the athlete is not prompted to make a new correction after every rep.
 */
export class TechniqueCoach {
  private lastFeedbackRep = 0
  private lastSeverity: RepData['severity'] = 'good'
  private activeIssue: string | null = null
  private goodStreak = 0

  reset() {
    this.lastFeedbackRep = 0
    this.lastSeverity = 'good'
    this.activeIssue = null
    this.goodStreak = 0
  }

  next(rep: RepData): TechniqueFeedback | null {
    const priorSeverity = this.lastSeverity
    this.lastSeverity = rep.severity

    if (rep.severity === 'crit') {
      this.goodStreak = 0
      this.activeIssue = rep.flaws?.[0] ?? rep.cue
      this.lastFeedbackRep = rep.rep
      return { message: externalFocusCue(rep), severity: 'crit', speak: true }
    }

    if (rep.severity === 'warn') {
      this.goodStreak = 0
      const issue = rep.flaws?.[0] ?? rep.cue
      const issueChanged = issue !== this.activeIssue
      const bandwidthElapsed = rep.rep - this.lastFeedbackRep >= FEEDBACK_GAP_REPS
      this.activeIssue = issue

      if (issueChanged || bandwidthElapsed) {
        this.lastFeedbackRep = rep.rep
        return { message: externalFocusCue(rep), severity: 'warn', speak: true }
      }
      return null
    }

    this.goodStreak += 1
    if (priorSeverity !== 'good') {
      this.activeIssue = null
      this.lastFeedbackRep = rep.rep
      return {
        message: 'Correction held — keep the load moving on that same path.',
        severity: 'good',
        speak: true,
      }
    }

    if (this.goodStreak % POSITIVE_FEEDBACK_INTERVAL === 0) {
      this.lastFeedbackRep = rep.rep
      return { message: externalFocusCue(rep), severity: 'good', speak: false }
    }

    return null
  }
}
