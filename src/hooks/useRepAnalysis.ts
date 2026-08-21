import { useEffect, useRef, useState } from 'react'
import { ExerciseClassifier, type ExerciseClassification } from '@/lib/pose/exerciseClassifier'
import { RepDetector } from '@/lib/pose/repDetector'
import type { RepPhase } from '@/lib/pose/repDetector'
import type { PoseTrackingSample } from '@/lib/pose/poseSampleTimeline'
import type { ExerciseDef, RepData } from '@/lib/simulation'
import type { VideoDimensions } from './useMediaSource'

interface RepAnalysisOptions {
  active: boolean
  exercise: ExerciseDef | null
  /** Changes whenever the media source is replaced, which restarts calibration. */
  lifecycleKey: string
  sample: PoseTrackingSample | null
  videoSize: VideoDimensions | null
  onRep: (rep: RepData) => void
  onSample?: (analysis: RepAnalysisSample) => void
}

interface RepAnalysisController {
  /** True once the lifter has moved through enough range for rep counting to arm. */
  isCalibrated: boolean
  phase: RepPhase
  repCount: number
  classification: ExerciseClassification
}

export interface RepAnalysisSample {
  sample: PoseTrackingSample
  classification: ExerciseClassification
  phase: RepPhase
  repCount: number
  completedRep: RepData | null
}

const UNKNOWN_CLASSIFICATION: ExerciseClassification = {
  label: 'UNKNOWN',
  confidence: 0,
  source: 'heuristic',
}

/**
 * Drives a {@link RepDetector} from the live pose stream and reports finished reps
 * through `onRep`. The detector is rebuilt whenever the source or exercise changes
 * so range-of-motion calibration never leaks across sets.
 */
export function useRepAnalysis({
  active,
  exercise,
  lifecycleKey,
  sample,
  videoSize,
  onRep,
  onSample,
}: RepAnalysisOptions): RepAnalysisController {
  const detectorRef = useRef<RepDetector | null>(null)
  const classifierRef = useRef(new ExerciseClassifier())
  const signatureRef = useRef<string | null>(null)
  const lastSequenceRef = useRef<number | null>(null)
  const calibratedRef = useRef(false)
  const onRepRef = useRef(onRep)
  const onSampleRef = useRef(onSample)
  const [isCalibrated, setIsCalibrated] = useState(false)
  const [phase, setPhase] = useState<RepPhase>('IDLE')
  const [repCount, setRepCount] = useState(0)
  const [classification, setClassification] = useState(UNKNOWN_CLASSIFICATION)

  useEffect(() => {
    onRepRef.current = onRep
    onSampleRef.current = onSample
  }, [onRep, onSample])

  useEffect(() => {
    const signature = active && sample
      ? `${lifecycleKey}:${sample.timelineRevision}:${exercise?.id ?? 'detect-only'}`
      : null
    if (signatureRef.current !== signature) {
      signatureRef.current = signature
      detectorRef.current = signature && exercise ? new RepDetector(exercise) : null
      classifierRef.current.reset()
      lastSequenceRef.current = null
      calibratedRef.current = false
      setIsCalibrated(false)
      setPhase('IDLE')
      setRepCount(0)
      setClassification(UNKNOWN_CLASSIFICATION)
    }

    const detector = detectorRef.current
    if (!sample || !videoSize?.height || lastSequenceRef.current === sample.sequence) return
    if (sample.lifecycleKey !== lifecycleKey) return
    lastSequenceRef.current = sample.sequence

    const pose = sample.frame.poses[0]
    if (!pose) return
    const aspectRatio = videoSize.width / videoSize.height
    const nextClassification = classifierRef.current.classify(pose.landmarks, aspectRatio)
    const completedRep = detector
      ? detector.push({ ...sample.frame, timestampMs: sample.mediaTimeMs }, aspectRatio)
      : null
    const snapshot = detector?.snapshot
    if (completedRep) onRepRef.current(completedRep)
    onSampleRef.current?.({
      sample,
      classification: nextClassification,
      phase: snapshot?.phase ?? 'IDLE',
      repCount: snapshot?.reps.length ?? 0,
      completedRep,
    })

    const calibrated = snapshot?.isCalibrated ?? false
    const nextPhase = snapshot?.phase ?? 'IDLE'
    const nextRepCount = snapshot?.reps.length ?? 0

    if (calibrated !== calibratedRef.current) {
      calibratedRef.current = calibrated
      setIsCalibrated(calibrated)
    }
    setPhase((current) => current === nextPhase ? current : nextPhase)
    setRepCount((current) => current === nextRepCount ? current : nextRepCount)
    setClassification((current) =>
      current.label === nextClassification.label &&
      Math.abs(current.confidence - nextClassification.confidence) < 0.05
        ? current
        : nextClassification,
    )
  }, [active, exercise, lifecycleKey, sample, videoSize])

  return { isCalibrated, phase, repCount, classification }
}
