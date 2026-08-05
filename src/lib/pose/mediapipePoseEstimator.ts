import type {
  Landmark as MediaPipeLandmark,
  NormalizedLandmark as MediaPipeNormalizedLandmark,
  PoseLandmarker,
  PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'
import { POSE_ASSETS } from './config'
import {
  PoseEstimatorException,
  type DetectedPose,
  type PoseEstimator,
  type PoseEstimatorErrorCode,
  type PoseEstimatorStatus,
  type PoseFrame,
  type PoseLandmark,
} from './types'

function estimatorFailure(
  code: PoseEstimatorErrorCode,
  message: string,
  recoverable: boolean,
): PoseEstimatorException {
  return new PoseEstimatorException({ code, message, recoverable })
}

function mapLandmark(landmark: MediaPipeNormalizedLandmark | MediaPipeLandmark): PoseLandmark {
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: landmark.visibility,
  }
}

function mapResult(result: PoseLandmarkerResult, timestampMs: number): PoseFrame {
  const poses: DetectedPose[] = result.landmarks.map((landmarks: any, index: number) => {
    const worldLandmarks = result.worldLandmarks[index]
    return {
      landmarks: landmarks.map(mapLandmark),
      ...(worldLandmarks ? { worldLandmarks: worldLandmarks.map(mapLandmark) } : {}),
    }
  })

  return { timestampMs, poses }
}

export class MediaPipePoseEstimator implements PoseEstimator {
  private landmarker: PoseLandmarker | null = null
  private initialization: Promise<void> | null = null
  private currentStatus: PoseEstimatorStatus = 'idle'
  private isDisposed = false
  private lastTimestampMs = -1

  get status(): PoseEstimatorStatus {
    return this.currentStatus
  }

  initialize(): Promise<void> {
    if (this.isDisposed) {
      return Promise.reject(
        estimatorFailure('disposed', 'Pose tracking has already been disposed.', false),
      )
    }
    if (this.landmarker) return Promise.resolve()
    if (this.initialization) return this.initialization

    this.currentStatus = 'loading'
    this.initialization = this.createLandmarker()
      .then((landmarker) => {
        if (this.isDisposed) {
          landmarker.close()
          throw estimatorFailure('disposed', 'Pose tracking was disposed while loading.', false)
        }
        this.landmarker = landmarker
        this.currentStatus = 'ready'
      })
      .catch((error: unknown) => {
        if (!this.isDisposed) this.currentStatus = 'error'
        if (error instanceof PoseEstimatorException) throw error
        throw estimatorFailure(
          'asset-load-failed',
          'Pose tracking could not load its browser runtime or model assets.',
          true,
        )
      })
      .finally(() => {
        this.initialization = null
      })

    return this.initialization
  }

  async estimate(video: HTMLVideoElement, timestampMs: number): Promise<PoseFrame> {
    if (this.isDisposed) {
      throw estimatorFailure('disposed', 'Pose tracking has already been disposed.', false)
    }
    if (!this.landmarker || this.currentStatus !== 'ready') {
      throw estimatorFailure('not-ready', 'Pose tracking is not ready yet.', true)
    }
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      throw estimatorFailure('invalid-frame', 'The video does not have a ready frame yet.', true)
    }
    if (!Number.isFinite(timestampMs) || timestampMs <= this.lastTimestampMs) {
      throw estimatorFailure(
        'invalid-frame',
        'Video frame timestamps must increase monotonically.',
        true,
      )
    }

    try {
      const result = this.landmarker.detectForVideo(video, timestampMs)
      this.lastTimestampMs = timestampMs
      return mapResult(result, timestampMs)
    } catch {
      throw estimatorFailure('inference-failed', 'Pose tracking could not analyze this frame.', true)
    }
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.landmarker?.close()
    this.landmarker = null
    this.currentStatus = 'disposed'
  }

  private async createLandmarker(): Promise<PoseLandmarker> {
    try {
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(POSE_ASSETS.wasmBaseUrl)
      return await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: POSE_ASSETS.modelUrl,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        outputSegmentationMasks: false,
      })
    } catch {
      throw estimatorFailure(
        'initialization-failed',
        'Pose tracking could not initialize in this browser.',
        true,
      )
    }
  }
}
