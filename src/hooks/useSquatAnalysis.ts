import { useEffect, useState, useSyncExternalStore } from 'react'
import { SquatAnalysisController } from '@/lib/analysis/squatIntegration'
import type { PoseTrackingSample } from '@/lib/pose/poseSampleTimeline'

interface UseSquatAnalysisOptions {
  exerciseId: string | null
  mediaLifecycleKey: string
  timelineRevision: number
  sample: PoseTrackingSample | null
  videoSize: { width: number; height: number } | null
}

export function useSquatAnalysis({
  exerciseId,
  mediaLifecycleKey,
  timelineRevision,
  sample,
  videoSize,
}: UseSquatAnalysisOptions) {
  const [controller] = useState(() => new SquatAnalysisController())
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)

  useEffect(() => {
    controller.configure(exerciseId, mediaLifecycleKey)
  }, [controller, exerciseId, mediaLifecycleKey])

  useEffect(() => {
    controller.setTimelineRevision(timelineRevision)
  }, [controller, timelineRevision])

  useEffect(() => {
    if (sample && videoSize) controller.process(sample, videoSize)
  }, [controller, sample, videoSize])

  useEffect(() => () => controller.dispose(), [controller])

  return state
}
