import { useCallback, useState } from 'react'
import type { CoachFeedEntry } from '@/lib/aiCoachSummary'

export type CoachSummaryStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'

interface CoachSummaryState {
  status: CoachSummaryStatus
  bullets: string[]
  error: string | null
}

interface GenerateArgs {
  feed: CoachFeedEntry[]
  exerciseName: string
  totalReps: number
}

export interface CoachSummaryController extends CoachSummaryState {
  generate: (args: GenerateArgs) => void
  reset: () => void
}

const IDLE_STATE: CoachSummaryState = { status: 'idle', bullets: [], error: null }

interface CoachSummaryResponseBody {
  bullets?: string[]
  error?: string
}

/**
 * Fetches the post-workout 3-bullet AI summary from the local /api/coach-summary
 * dev endpoint (see vite-plugins/aiCoachSummaryApi.ts), which keeps the actual
 * Anthropic API key server-side.
 */
export function useCoachSummary(): CoachSummaryController {
  const [state, setState] = useState<CoachSummaryState>(IDLE_STATE)

  const generate = useCallback((args: GenerateArgs) => {
    setState({ status: 'loading', bullets: [], error: null })

    fetch('/api/coach-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as CoachSummaryResponseBody

        if (res.status === 503) {
          setState({ status: 'unavailable', bullets: [], error: data.error ?? 'AI summary is not configured.' })
          return
        }
        if (!res.ok) {
          setState({ status: 'error', bullets: [], error: data.error ?? `Request failed (${res.status})` })
          return
        }
        setState({ status: 'ready', bullets: data.bullets ?? [], error: null })
      })
      .catch((error: unknown) => {
        setState({ status: 'error', bullets: [], error: error instanceof Error ? error.message : String(error) })
      })
  }, [])

  const reset = useCallback(() => setState(IDLE_STATE), [])

  return { ...state, generate, reset }
}
