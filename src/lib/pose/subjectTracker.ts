import type { DetectedPose, PoseLandmark } from './types'

export interface SubjectBoundingBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  centerX: number
  centerY: number
  area: number
}

export interface SkeletonSignature {
  torsoX: number
  torsoY: number
  shoulderWidth: number
  hipWidth: number
  bbox: SubjectBoundingBox
}

export function computePoseBoundingBox(landmarks: PoseLandmark[]): SubjectBoundingBox | null {
  if (!landmarks || landmarks.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const lm of landmarks) {
    if (lm.x < minX) minX = lm.x
    if (lm.y < minY) minY = lm.y
    if (lm.x > maxX) maxX = lm.x
    if (lm.y > maxY) maxY = lm.y
  }

  const width = Math.max(0, maxX - minX)
  const height = Math.max(0, maxY - minY)
  const centerX = minX + width / 2
  const centerY = minY + height / 2
  const area = width * height

  return { minX, minY, maxX, maxY, width, height, centerX, centerY, area }
}

export function computeSkeletonSignature(landmarks: PoseLandmark[]): SkeletonSignature | null {
  const bbox = computePoseBoundingBox(landmarks)
  if (!bbox) return null

  // MediaPipe shoulders (11, 12 / 5, 6) & hips (23, 24 / 11, 12)
  const sL = landmarks[11] ?? landmarks[5]
  const sR = landmarks[12] ?? landmarks[6]
  const hL = landmarks[23] ?? landmarks[11]
  const hR = landmarks[24] ?? landmarks[12]

  const pts = [sL, sR, hL, hR].filter((p): p is PoseLandmark => Boolean(p))
  if (pts.length === 0) {
    return {
      torsoX: bbox.centerX,
      torsoY: bbox.centerY,
      shoulderWidth: bbox.width * 0.4,
      hipWidth: bbox.width * 0.3,
      bbox,
    }
  }

  const torsoX = pts.reduce((sum, p) => sum + p.x, 0) / pts.length
  const torsoY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length
  const shoulderWidth = sL && sR ? Math.hypot(sR.x - sL.x, sR.y - sL.y) : bbox.width * 0.4
  const hipWidth = hL && hR ? Math.hypot(hR.x - hL.x, hR.y - hL.y) : bbox.width * 0.3

  return { torsoX, torsoY, shoulderWidth, hipWidth, bbox }
}

/**
 * Computes Intersection over Union (IoU) between two bounding boxes [0..1]
 */
export function computeIoU(boxA: SubjectBoundingBox, boxB: SubjectBoundingBox): number {
  const interX1 = Math.max(boxA.minX, boxB.minX)
  const interY1 = Math.max(boxA.minY, boxB.minY)
  const interX2 = Math.min(boxA.maxX, boxB.maxX)
  const interY2 = Math.min(boxA.maxY, boxB.maxY)

  const interWidth = Math.max(0, interX2 - interX1)
  const interHeight = Math.max(0, interY2 - interY1)
  const interArea = interWidth * interHeight

  if (interArea === 0) return 0

  const unionArea = boxA.area + boxB.area - interArea
  return unionArea > 0 ? interArea / unionArea : 0
}

export function computeMeanVisibility(landmarks: PoseLandmark[]): number {
  if (!landmarks || landmarks.length === 0) return 0
  let totalVis = 0
  let count = 0
  for (const lm of landmarks) {
    if (lm.visibility !== undefined) {
      totalVis += lm.visibility
      count++
    }
  }
  return count > 0 ? totalVis / count : 0.8
}

export function scoreSubjectProminence(pose: DetectedPose): number {
  const bbox = computePoseBoundingBox(pose.landmarks)
  if (!bbox || bbox.area === 0) return 0

  const distFromCenter = Math.hypot(bbox.centerX - 0.5, bbox.centerY - 0.5)
  const centralityScore = Math.max(0, 1 - distFromCenter * 1.4)
  const areaScore = Math.min(1, bbox.area / 0.35)
  const visibilityScore = computeMeanVisibility(pose.landmarks)

  return areaScore * 0.5 + centralityScore * 0.35 + visibilityScore * 0.15
}

/**
 * Finds which detected pose is closest to a normalized tap point (x, y) [0..1].
 */
export function findPoseNearPoint(point: { x: number; y: number }, poses: DetectedPose[]): number {
  if (!poses || poses.length === 0) return -1
  let minDistance = Infinity
  let bestIndex = -1

  for (let i = 0; i < poses.length; i++) {
    const bbox = computePoseBoundingBox(poses[i].landmarks)
    if (!bbox) continue

    // Check if tap point falls directly inside bounding box
    if (point.x >= bbox.minX && point.x <= bbox.maxX && point.y >= bbox.minY && point.y <= bbox.maxY) {
      return i
    }

    const dist = Math.hypot(bbox.centerX - point.x, bbox.centerY - point.y)
    if (dist < minDistance) {
      minDistance = dist
      bestIndex = i
    }
  }

  return bestIndex
}

export class SubjectTracker {
  private lastLockedSignature: SkeletonSignature | null = null
  private velocity: { vx: number; vy: number } = { vx: 0, vy: 0 }
  private lastSeenTimestamp = 0
  private lockTimeoutMs = 10000 // 10 seconds lock memory window
  private manualLockedPoint: { x: number; y: number } | null = null

  public reset() {
    this.lastLockedSignature = null
    this.velocity = { vx: 0, vy: 0 }
    this.lastSeenTimestamp = 0
    this.manualLockedPoint = null
  }

  /**
   * Explicitly lock tracking onto a specific pose object
   */
  public lockSpecificPose(pose: DetectedPose, timestampMs: number = Date.now()) {
    const sig = computeSkeletonSignature(pose.landmarks)
    if (sig) {
      if (this.lastLockedSignature && timestampMs > this.lastSeenTimestamp) {
        const dt = Math.max(0.01, (timestampMs - this.lastSeenTimestamp) / 1000)
        this.velocity = {
          vx: (sig.torsoX - this.lastLockedSignature.torsoX) / dt,
          vy: (sig.torsoY - this.lastLockedSignature.torsoY) / dt,
        }
      } else {
        this.velocity = { vx: 0, vy: 0 }
      }
      this.lastLockedSignature = sig
      this.lastSeenTimestamp = timestampMs
    }
  }

  /**
   * Lock tracking onto whichever athlete is standing nearest to a normalized screen click/tap (x, y) [0..1]
   */
  public selectPoseByTapPoint(
    point: { x: number; y: number },
    poses: DetectedPose[],
    timestampMs: number = Date.now(),
  ): DetectedPose | null {
    if (!poses || poses.length === 0) return null
    const index = findPoseNearPoint(point, poses)
    if (index !== -1) {
      const selected = poses[index]
      this.manualLockedPoint = point
      this.lockSpecificPose(selected, timestampMs)
      return selected
    }
    return null
  }

  /**
   * Cycle to the next detected pose candidate in the current frame.
   */
  public cycleNextTarget(poses: DetectedPose[], timestampMs: number = Date.now()): DetectedPose | null {
    if (!poses || poses.length === 0) return null
    if (poses.length === 1) {
      this.lockSpecificPose(poses[0], timestampMs)
      return poses[0]
    }

    const { selectedIndex } = this.selectPrimarySubject(poses, timestampMs)
    const nextIndex = (selectedIndex + 1) % poses.length
    const targetPose = poses[nextIndex]
    this.lockSpecificPose(targetPose, timestampMs)
    return targetPose
  }

  /**
   * Robust Torso Centroid & Skeleton Signature Tracker:
   * Tracks horizontal torso position (x) and shoulder width signature across frames so squatting/lunging never triggers a switch!
   */
  public selectPrimarySubject(
    poses: DetectedPose[],
    timestampMs: number = Date.now(),
  ): { selectedPose: DetectedPose | null; selectedIndex: number } {
    if (!poses || poses.length === 0) {
      return { selectedPose: null, selectedIndex: -1 }
    }

    if (poses.length === 1) {
      this.lockSpecificPose(poses[0], timestampMs)
      return { selectedPose: poses[0], selectedIndex: 0 }
    }

    // Handle manual tap point lock if set
    if (this.manualLockedPoint && (!this.lastLockedSignature || timestampMs - this.lastSeenTimestamp >= this.lockTimeoutMs)) {
      const index = findPoseNearPoint(this.manualLockedPoint, poses)
      if (index !== -1) {
        const selected = poses[index]
        this.lockSpecificPose(selected, timestampMs)
        return { selectedPose: selected, selectedIndex: index }
      }
    }

    // Skeleton Signature & Horizontal Torso Lock (within 10s timeout)
    if (this.lastLockedSignature && timestampMs - this.lastSeenTimestamp < this.lockTimeoutMs) {
      const dt = Math.max(0, (timestampMs - this.lastSeenTimestamp) / 1000)
      
      const predictedTorsoX = this.lastLockedSignature.torsoX + this.velocity.vx * dt

      let bestIndex = -1
      let minCost = Infinity

      for (let i = 0; i < poses.length; i++) {
        const candSig = computeSkeletonSignature(poses[i].landmarks)
        if (!candSig) continue

        // Horizontal shift is strictly penalized (distX * 4.0), while vertical squatting movement (distY * 0.5) is allowed
        const distX = Math.abs(candSig.torsoX - predictedTorsoX)
        const distY = Math.abs(candSig.torsoY - this.lastLockedSignature.torsoY)
        const shoulderDiff = Math.abs(candSig.shoulderWidth - this.lastLockedSignature.shoulderWidth)

        const matchCost = distX * 4.0 + distY * 0.5 + shoulderDiff * 2.0

        if (matchCost < minCost && distX < 0.3) {
          minCost = matchCost
          bestIndex = i
        }
      }

      if (bestIndex !== -1) {
        const selected = poses[bestIndex]
        this.lockSpecificPose(selected, timestampMs)
        return { selectedPose: selected, selectedIndex: bestIndex }
      }
    }

    // Fallback / Initial Frame: Pick candidate with highest prominence score
    let bestIndex = 0
    let maxScore = -Infinity

    for (let i = 0; i < poses.length; i++) {
      const score = scoreSubjectProminence(poses[i])
      if (score > maxScore) {
        maxScore = score
        bestIndex = i
      }
    }

    const selected = poses[bestIndex] ?? poses[0]
    this.lockSpecificPose(selected, timestampMs)
    return { selectedPose: selected, selectedIndex: bestIndex }
  }
}
