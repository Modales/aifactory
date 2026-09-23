import type { CameraView } from '@/lib/analysisApi'

export interface CaptureConfig { id: string; kind: 'camera' | 'upload'; deviceId: string; file: File | null; view: CameraView; offsetMs: number }

export const makeConfig = (n: number, kind: 'camera' | 'upload' = 'camera'): CaptureConfig =>
  ({ id: `Camera ${n}`, kind, deviceId: '', file: null, view: n === 1 ? 'side' : 'frontal', offsetMs: 0 })
