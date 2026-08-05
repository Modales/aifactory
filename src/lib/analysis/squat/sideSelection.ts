import type { DetectedPose } from '../../pose/types.ts'
import { bilateralSeparation } from './geometry.ts'
import { sideQuality } from './landmarks.ts'
import type { SquatAnalyzerConfig, SquatSide } from './types.ts'

export interface SideSelectionResult {
  selectedSide: SquatSide | null
  quality: number
  viewSuitable: boolean
  switched: boolean
}

export class SquatSideSelector {
  private readonly config: SquatAnalyzerConfig
  private selected: SquatSide | null = null
  private lastSelectedValidAt: number | null = null
  private challenger: SquatSide | null = null
  private challengerFrames = 0

  constructor(config: SquatAnalyzerConfig) {
    this.config = config
  }

  update(
    pose: DetectedPose,
    videoSize: { width: number; height: number },
    timestampMs: number,
  ): SideSelectionResult {
    const left = sideQuality(pose, 'left')
    const right = sideQuality(pose, 'right')
    const separation = bilateralSeparation(pose, videoSize)
    const viewSuitable = separation !== null && separation <= this.config.unsuitableViewSeparation
    const valid = {
      left: left >= this.config.minimumSideScore,
      right: right >= this.config.minimumSideScore,
    }

    if (!this.selected) {
      const acquired = valid.left || valid.right
        ? valid.left && (!valid.right || left >= right) ? 'left' : 'right'
        : null
      this.selected = acquired
      this.lastSelectedValidAt = acquired ? timestampMs : null
      return { selectedSide: acquired, quality: acquired === 'left' ? left : acquired === 'right' ? right : 0, viewSuitable, switched: false }
    }

    const current = this.selected
    const other: SquatSide = current === 'left' ? 'right' : 'left'
    const scores = { left, right }
    if (valid[current]) this.lastSelectedValidAt = timestampMs

    if (valid[other] && scores[other] >= scores[current] + this.config.sideSwitchAdvantage) {
      if (this.challenger === other) this.challengerFrames += 1
      else {
        this.challenger = other
        this.challengerFrames = 1
      }
      if (this.challengerFrames >= this.config.sideSwitchFrames) {
        this.selected = other
        this.lastSelectedValidAt = timestampMs
        this.clearChallenge()
        return { selectedSide: other, quality: scores[other], viewSuitable, switched: true }
      }
    } else {
      this.clearChallenge()
    }

    if (!valid[current]) {
      const held = this.lastSelectedValidAt !== null && timestampMs - this.lastSelectedValidAt <= this.config.sideOcclusionHoldMs
      if (!held) {
        this.selected = null
        this.clearChallenge()
        return { selectedSide: null, quality: 0, viewSuitable, switched: false }
      }
    }

    return { selectedSide: this.selected, quality: scores[this.selected], viewSuitable, switched: false }
  }

  reset(): void {
    this.selected = null
    this.lastSelectedValidAt = null
    this.clearChallenge()
  }

  private clearChallenge(): void {
    this.challenger = null
    this.challengerFrames = 0
  }
}
