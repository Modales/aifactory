import type { RepDraft } from './stateMachine.ts'
import type { SquatAnalyzerConfig, SquatFormSignal } from './types.ts'

export function buildRepSignals(draft: RepDraft, config: SquatAnalyzerConfig): SquatFormSignal[] {
  const signals: SquatFormSignal[] = []
  if (draft.depth === 'reached') {
    signals.push({
      code: 'depth-reached',
      message: 'Squat depth was observed on this rep.',
      confidence: draft.confidence,
      evidence: { maximumNormalizedDepth: draft.maximumDepth },
    })
  } else if (draft.depth === 'not-reached') {
    signals.push({
      code: 'depth-not-reached',
      message: 'Squat depth was not clearly observed on this rep.',
      confidence: draft.confidence,
      evidence: { maximumNormalizedDepth: draft.maximumDepth },
    })
  }

  const torsoDelta = draft.maximumTorsoInclination - draft.baselineTorsoInclination
  if (!draft.interrupted && torsoDelta >= config.torsoInclinationDeltaDeg) {
    signals.push({
      code: 'torso-inclination',
      message: 'Your torso leaned farther forward near the bottom.',
      confidence: draft.confidence,
      evidence: { baselineDegrees: draft.baselineTorsoInclination, maximumDegrees: draft.maximumTorsoInclination },
    })
  }

  if (Number.isFinite(draft.durationMs) && draft.durationMs >= config.minimumRepDurationMs) {
    signals.push({
      code: 'tempo',
      message: `Rep tempo: ${(draft.durationMs / 1000).toFixed(1)} s.`,
      confidence: draft.confidence,
      evidence: { durationMs: draft.durationMs },
    })
  }

  if (!draft.interrupted && draft.movementControlObserved) {
    signals.push({
      code: 'movement-control',
      message: 'Movement speed changed sharply during the descent.',
      confidence: draft.confidence,
    })
  }
  return signals
}
