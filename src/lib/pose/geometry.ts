import type { PoseLandmark } from './types'

export type ObjectFitMode = 'cover' | 'contain'

export interface Size {
  width: number
  height: number
}

export interface DisplayRect extends Size {
  x: number
  y: number
}

export interface DisplayPoint {
  x: number
  y: number
}

export function objectFitRect(
  container: Size,
  media: Size,
  fit: ObjectFitMode,
): DisplayRect | null {
  if (
    container.width <= 0 ||
    container.height <= 0 ||
    media.width <= 0 ||
    media.height <= 0
  ) {
    return null
  }

  const scale =
    fit === 'cover'
      ? Math.max(container.width / media.width, container.height / media.height)
      : Math.min(container.width / media.width, container.height / media.height)
  const width = media.width * scale
  const height = media.height * scale

  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  }
}

export function landmarkDisplayPoint(
  landmark: PoseLandmark,
  displayRect: DisplayRect,
  mirrored: boolean,
): DisplayPoint {
  const normalizedX = mirrored ? 1 - landmark.x : landmark.x
  return {
    x: displayRect.x + normalizedX * displayRect.width,
    y: displayRect.y + landmark.y * displayRect.height,
  }
}
