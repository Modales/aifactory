import type { CameraFocus } from './exerciseLibrary'

export interface CameraShot {
  label: string
  position: [number, number, number]
  target: [number, number, number]
  zoom: number
}

/** Three purposeful views per repetition: establish, technique close-up, finish. */
export function cameraShot(focus: CameraFocus, cycle: number, aspect: number): CameraShot {
  const phase = cycle < .18 || cycle > .92 ? 0 : cycle < .56 ? 1 : 2
  const narrow = Math.max(.72, Math.min(1.15, aspect))
  const shots: Record<CameraFocus, CameraShot[]> = {
    full: [
      { label: 'Full movement', position: [2.15, 1.3, 2.75], target: [0, .82, 0], zoom: narrow },
      { label: 'Hip position', position: [1.72, 1.08, 1.9], target: [0, .8, -.02], zoom: narrow * 1.08 },
      { label: 'Finish position', position: [-1.85, 1.35, 2.5], target: [0, .9, 0], zoom: narrow },
    ],
    upper: [
      { label: 'Upper-body setup', position: [1.75, 1.55, 2.35], target: [0, 1.18, 0], zoom: narrow * 1.08 },
      { label: 'Grip and elbow', position: [.95, 1.43, 1.55], target: [0, 1.17, 0], zoom: narrow * 1.25 },
      { label: 'Shoulder control', position: [-1.55, 1.52, 2.05], target: [0, 1.2, 0], zoom: narrow * 1.1 },
    ],
    lower: [
      { label: 'Full lower body', position: [2.05, 1.16, 2.55], target: [0, .65, 0], zoom: narrow },
      { label: 'Knee and hip', position: [1.22, .83, 1.5], target: [0, .57, .02], zoom: narrow * 1.23 },
      { label: 'Foot pressure', position: [-1.35, .72, 1.78], target: [0, .36, .02], zoom: narrow * 1.15 },
    ],
    floor: [
      { label: 'Full movement', position: [2.35, 1.15, 1.9], target: [0, .38, .12], zoom: narrow },
      { label: 'Trunk control', position: [1.35, .82, 1.25], target: [0, .48, .08], zoom: narrow * 1.18 },
      { label: 'Alignment view', position: [-1.9, 1.25, 1.55], target: [0, .42, .08], zoom: narrow * 1.04 },
    ],
  }
  return shots[focus][phase]
}
