import type { CameraFocus } from './exerciseLibrary'

export interface CameraShot {
  label: string
  position: [number, number, number]
  target: [number, number, number]
  zoom: number
}

const focusSetup: Record<CameraFocus, { target: [number, number, number]; radius: number; height: number; baseAngle: number; zoom: number }> = {
  full: { target: [0, .82, 0], radius: 3.15, height: 1.35, baseAngle: .7, zoom: 1 },
  upper: { target: [0, 1.18, 0], radius: 2.35, height: 1.52, baseAngle: .62, zoom: 1.1 },
  lower: { target: [0, .6, 0], radius: 2.55, height: 1.02, baseAngle: .72, zoom: 1.06 },
  floor: { target: [0, .4, .1], radius: 2.75, height: 1.08, baseAngle: .82, zoom: 1 },
}

/** Continuous camera choreography: a slow orbit and eased zoom with no cuts. */
export function cameraShot(focus: CameraFocus, cycle: number, aspect: number): CameraShot {
  const setup = focusSetup[focus]
  const turn = Math.sin(cycle * Math.PI * 2) * .48
  const zoomPulse = (1 - Math.cos(cycle * Math.PI * 2)) / 2
  const angle = setup.baseAngle + turn
  const framing = Math.max(.76, Math.min(1.12, aspect))
  return {
    label: 'Smooth orbit + auto zoom',
    position: [Math.sin(angle) * setup.radius, setup.height, Math.cos(angle) * setup.radius],
    target: setup.target,
    zoom: setup.zoom * framing * (1 + zoomPulse * .2),
  }
}
