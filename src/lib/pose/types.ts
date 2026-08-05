export interface PoseLandmark {
  x: number
  y: number
  z?: number
  visibility?: number
}

export interface DetectedPose {
  landmarks: PoseLandmark[]
  worldLandmarks?: PoseLandmark[]
}

export interface PoseFrame {
  timestampMs: number
  poses: DetectedPose[]
}

export type PoseEstimatorStatus = 'idle' | 'loading' | 'ready' | 'error' | 'disposed'

export type PoseTrackingStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'tracking'
  | 'no-pose'
  | 'paused'
  | 'ended'
  | 'error'
  | 'disposed'

export type PoseEstimatorErrorCode =
  | 'asset-load-failed'
  | 'initialization-failed'
  | 'invalid-frame'
  | 'inference-failed'
  | 'not-ready'
  | 'disposed'

export interface PoseEstimatorError {
  code: PoseEstimatorErrorCode
  message: string
  recoverable: boolean
}

export class PoseEstimatorException extends Error {
  readonly details: PoseEstimatorError

  constructor(details: PoseEstimatorError) {
    super(details.message)
    this.name = 'PoseEstimatorException'
    this.details = details
  }
}

export interface PoseEstimator {
  readonly status: PoseEstimatorStatus
  initialize(): Promise<void>
  estimate(video: HTMLVideoElement, timestampMs: number): Promise<PoseFrame>
  dispose(): void
}
