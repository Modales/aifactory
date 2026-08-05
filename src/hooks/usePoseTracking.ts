import { useCallback, useEffect, useRef, useState } from 'react'
import { MediaPipePoseEstimator } from '@/lib/pose/mediapipePoseEstimator'
import {
  PoseSampleTimeline,
  type PoseSampleSource,
  type PoseTrackingSample,
} from '@/lib/pose/poseSampleTimeline'
import {
  PoseEstimatorException,
  type PoseEstimatorError,
  type PoseFrame,
  type PoseTrackingStatus,
} from '@/lib/pose/types'

const TARGET_INFERENCE_FPS = 12
const MIN_INFERENCE_INTERVAL_MS = 1000 / TARGET_INFERENCE_FPS

interface PoseTrackingOptions {
  active: boolean
  lifecycleKey: string
  source: PoseSampleSource | null
  video: HTMLVideoElement | null
}

interface KeyedStatus {
  key: string
  value: PoseTrackingStatus
}

interface KeyedResult {
  key: string
  value: PoseTrackingSample | null
}

interface KeyedError {
  key: string
  value: PoseEstimatorError | null
}

interface KeyedTimelineRevision {
  key: string
  value: number
}

interface PoseTrackingController {
  status: PoseTrackingStatus
  latestResult: PoseFrame | null
  latestSample: PoseTrackingSample | null
  timelineRevision: number
  error: PoseEstimatorError | null
  isTracking: boolean
  retry: () => void
  stop: () => void
}

function unknownInferenceError(): PoseEstimatorError {
  return {
    code: 'inference-failed',
    message: 'Pose tracking stopped after an unexpected browser inference error.',
    recoverable: true,
  }
}

export function usePoseTracking({
  active,
  lifecycleKey,
  source,
  video,
}: PoseTrackingOptions): PoseTrackingController {
  const [statusState, setStatusState] = useState<KeyedStatus>({ key: '', value: 'idle' })
  const [resultState, setResultState] = useState<KeyedResult>({ key: '', value: null })
  const [errorState, setErrorState] = useState<KeyedError>({ key: '', value: null })
  const [timelineState, setTimelineState] = useState<KeyedTimelineRevision>({ key: '', value: 0 })
  const [retryVersion, setRetryVersion] = useState(0)
  const generationRef = useRef(0)
  const stopLifecycleRef = useRef<() => void>(() => undefined)

  const retry = useCallback(() => setRetryVersion((version) => version + 1), [])
  const stop = useCallback(() => stopLifecycleRef.current(), [])

  useEffect(() => {
    const generation = ++generationRef.current
    if (!active || !source || !video) return

    const estimator = new MediaPipePoseEstimator()
    const timeline = new PoseSampleTimeline(lifecycleKey)
    let cancelled = false
    let animationFrame: number | null = null
    let inferencePending = false
    let forceNextFrame = true
    let lastInferenceAt = Number.NEGATIVE_INFINITY
    let lastVideoTime = Number.NaN
    let lastEstimatorTimestamp = Number.NEGATIVE_INFINITY

    const isCurrent = () => !cancelled && generation === generationRef.current
    const publishStatus = (value: PoseTrackingStatus) => {
      if (!isCurrent()) return
      setStatusState((current) =>
        current.key === lifecycleKey && current.value === value
          ? current
          : { key: lifecycleKey, value },
      )
    }
    const publishTimelineRevision = () => {
      if (!isCurrent()) return
      setTimelineState({ key: lifecycleKey, value: timeline.timelineRevision })
    }
    const cancelFrame = () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      animationFrame = null
    }

    const requestFrame = () => {
      if (!isCurrent() || animationFrame !== null) return
      animationFrame = window.requestAnimationFrame(processFrame)
    }

    const processFrame = (now: number) => {
      animationFrame = null
      if (!isCurrent()) return
      if (document.hidden) {
        publishStatus('paused')
        return
      }
      if (video.ended) {
        publishStatus('ended')
        return
      }
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        publishStatus('ready')
        requestFrame()
        return
      }
      if (video.paused && !forceNextFrame) {
        publishStatus('paused')
        return
      }
      if (inferencePending) {
        requestFrame()
        return
      }
      if (!forceNextFrame && now - lastInferenceAt < MIN_INFERENCE_INTERVAL_MS) {
        requestFrame()
        return
      }

      const videoTime = video.currentTime
      if (!forceNextFrame && videoTime === lastVideoTime) {
        requestFrame()
        return
      }

      forceNextFrame = false
      inferencePending = true
      lastInferenceAt = now
      lastVideoTime = videoTime
      const timestampMs = Math.max(now, lastEstimatorTimestamp + 0.01)
      lastEstimatorTimestamp = timestampMs
      const metadata = timeline.capture(source, videoTime, timestampMs)
      if (!metadata) {
        inferencePending = false
        requestFrame()
        return
      }
      publishTimelineRevision()
      publishStatus('tracking')

      void estimator
        .estimate(video, timestampMs)
        .then((result) => {
          if (!isCurrent() || !timeline.isCurrent(metadata.timelineRevision)) return
          setResultState({
            key: lifecycleKey,
            value: { ...metadata, frame: result },
          })
          setErrorState((current) =>
            current.key === lifecycleKey && current.value === null
              ? current
              : { key: lifecycleKey, value: null },
          )
          publishStatus(
            video.ended
              ? 'ended'
              : video.paused || document.hidden
                ? 'paused'
                : result.poses.length
                  ? 'tracking'
                  : 'no-pose',
          )
        })
        .catch((thrown: unknown) => {
          if (!isCurrent()) return
          const failure =
            thrown instanceof PoseEstimatorException ? thrown.details : unknownInferenceError()
          if (failure.code === 'invalid-frame' || failure.code === 'not-ready') {
            publishStatus(video.ended ? 'ended' : video.paused ? 'paused' : 'ready')
            return
          }
          setErrorState({ key: lifecycleKey, value: failure })
          publishStatus('error')
        })
        .finally(() => {
          inferencePending = false
          if (isCurrent() && !video.paused && !video.ended) requestFrame()
        })
    }

    const handlePlay = () => {
      if (source === 'upload' && timeline.markPlay()) {
        setResultState({ key: lifecycleKey, value: null })
        publishTimelineRevision()
      }
      forceNextFrame = true
      publishStatus('ready')
      requestFrame()
    }
    const handlePause = () => {
      cancelFrame()
      if (!video.ended) publishStatus('paused')
    }
    const handleEnded = () => {
      cancelFrame()
      if (source === 'upload') timeline.markEnded()
      publishStatus('ended')
    }
    const handleSeeked = () => {
      if (source === 'upload') {
        timeline.markSeeked(video.currentTime)
        setResultState({ key: lifecycleKey, value: null })
        publishTimelineRevision()
      }
      forceNextFrame = true
      requestFrame()
    }
    const handleVisibility = () => {
      if (document.hidden) {
        cancelFrame()
        publishStatus('paused')
      } else {
        forceNextFrame = true
        requestFrame()
      }
    }

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('seeked', handleSeeked)
    document.addEventListener('visibilitychange', handleVisibility)

    const disposeLifecycle = () => {
      if (cancelled) return
      if (isCurrent()) setStatusState({ key: lifecycleKey, value: 'disposed' })
      cancelled = true
      generationRef.current += 1
      cancelFrame()
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('seeked', handleSeeked)
      document.removeEventListener('visibilitychange', handleVisibility)
      estimator.dispose()
    }
    stopLifecycleRef.current = disposeLifecycle

    void Promise.resolve().then(async () => {
      if (!isCurrent()) return
      setStatusState({ key: lifecycleKey, value: 'loading' })
      setResultState({ key: lifecycleKey, value: null })
      setErrorState({ key: lifecycleKey, value: null })
      setTimelineState({ key: lifecycleKey, value: 0 })
      try {
        await estimator.initialize()
        if (!isCurrent()) return
        publishStatus('ready')
        requestFrame()
      } catch (thrown: unknown) {
        if (!isCurrent()) return
        const failure =
          thrown instanceof PoseEstimatorException ? thrown.details : unknownInferenceError()
        setErrorState({ key: lifecycleKey, value: failure })
        publishStatus('error')
      }
    })

    return () => {
      disposeLifecycle()
      if (stopLifecycleRef.current === disposeLifecycle) {
        stopLifecycleRef.current = () => undefined
      }
    }
  }, [active, lifecycleKey, retryVersion, source, video])

  const status =
    active && statusState.key === lifecycleKey ? statusState.value : active ? 'loading' : 'idle'
  const latestSample = resultState.key === lifecycleKey ? resultState.value : null
  const latestResult = latestSample?.frame ?? null
  const error = errorState.key === lifecycleKey ? errorState.value : null
  const timelineRevision = timelineState.key === lifecycleKey ? timelineState.value : 0

  return {
    status,
    latestResult,
    latestSample,
    timelineRevision,
    error,
    isTracking: status === 'tracking' || status === 'no-pose',
    retry,
    stop,
  }
}
