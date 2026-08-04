import { useEffect, useRef } from 'react'
import type { ExerciseDef } from '@/lib/simulation'
import { MIN_POSE_VISIBILITY } from '@/lib/pose/config'
import { POSE_CONNECTIONS } from '@/lib/pose/connections'
import { landmarkDisplayPoint, objectFitRect, type Size } from '@/lib/pose/geometry'
import type { DetectedPose } from '@/lib/pose/types'

interface PoseCanvasProps {
  exercise: ExerciseDef | null
  severity: 'good' | 'warn' | 'crit'
  active: boolean
  mode?: 'synthetic' | 'landmarks'
  pose?: DetectedPose | null
  videoSize?: Size | null
  mirrored?: boolean
}

interface LandmarkDrawingState {
  active: boolean
  mirrored: boolean
  pose: DetectedPose | null
  videoSize: Size | null
}

const COLORS = {
  good: '#FF4D00',
  warn: '#D97706',
  crit: '#DC2626',
}

function prepareCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const dpr = Math.max(1, window.devicePixelRatio || 1)
  const backingWidth = Math.round(width * dpr)
  const backingHeight = Math.round(height * dpr)

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth
    canvas.height = backingHeight
  }

  const context = canvas.getContext('2d')
  context?.setTransform(dpr, 0, 0, dpr, 0, 0)
  return context
}

function isVisible(visibility: number | undefined): boolean {
  return visibility === undefined || visibility >= MIN_POSE_VISIBILITY
}

function drawLandmarks(canvas: HTMLCanvasElement, state: LandmarkDrawingState): void {
  const context = prepareCanvas(canvas)
  if (!context) return

  const container = { width: canvas.clientWidth, height: canvas.clientHeight }
  context.clearRect(0, 0, container.width, container.height)
  if (!state.active || !state.pose || !state.videoSize) return

  const displayRect = objectFitRect(container, state.videoSize, 'cover')
  if (!displayRect) return

  const landmarks = state.pose.landmarks
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = '#FF4D00'
  context.lineWidth = 3
  context.globalAlpha = 0.9

  for (const [startIndex, endIndex] of POSE_CONNECTIONS) {
    const start = landmarks[startIndex]
    const end = landmarks[endIndex]
    if (!start || !end || !isVisible(start.visibility) || !isVisible(end.visibility)) continue
    const a = landmarkDisplayPoint(start, displayRect, state.mirrored)
    const b = landmarkDisplayPoint(end, displayRect, state.mirrored)
    context.beginPath()
    context.moveTo(a.x, a.y)
    context.lineTo(b.x, b.y)
    context.stroke()
  }

  context.globalAlpha = 1
  for (const landmark of landmarks) {
    if (!isVisible(landmark.visibility)) continue
    const point = landmarkDisplayPoint(landmark, displayRect, state.mirrored)
    context.beginPath()
    context.arc(point.x, point.y, 4, 0, Math.PI * 2)
    context.fillStyle = '#14110E'
    context.fill()
    context.lineWidth = 2
    context.strokeStyle = '#FF4D00'
    context.stroke()
  }
}

function LandmarkCanvas({
  active,
  mirrored,
  pose,
  videoSize,
}: Pick<PoseCanvasProps, 'active' | 'mirrored' | 'pose' | 'videoSize'>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef<LandmarkDrawingState>({
    active,
    mirrored: mirrored ?? false,
    pose: pose ?? null,
    videoSize: videoSize ?? null,
  })

  useEffect(() => {
    drawingRef.current = {
      active,
      mirrored: mirrored ?? false,
      pose: pose ?? null,
      videoSize: videoSize ?? null,
    }
    const canvas = canvasRef.current
    if (canvas) drawLandmarks(canvas, drawingRef.current)
  }, [active, mirrored, pose, videoSize])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const redraw = () => drawLandmarks(canvas, drawingRef.current)
    redraw()
    const observer = new ResizeObserver(redraw)
    if (canvas.parentElement) observer.observe(canvas.parentElement)
    return () => observer.disconnect()
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      aria-hidden="true"
    />
  )
}

function SyntheticPoseCanvas({
  exercise,
  severity,
  active,
}: Pick<PoseCanvasProps, 'exercise' | 'severity' | 'active'>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let animationFrame = 0
    const start = performance.now()

    const resize = () => {
      prepareCanvas(canvas)
    }
    resize()
    const observer = new ResizeObserver(resize)
    if (canvas.parentElement) observer.observe(canvas.parentElement)

    const draw = (now: number) => {
      const context = prepareCanvas(canvas)
      if (!context) return
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      context.clearRect(0, 0, width, height)
      if (!exercise || !active) return

      const tempo = exercise.baseTempo * 1000
      const progress = ((now - start) % tempo) / tempo
      const depth = (1 - Math.cos(progress * Math.PI * 2)) / 2
      const color = COLORS[severity]
      const centerX = width * 0.5
      const ground = height * 0.9
      const unit = height / 100
      const hipDrop = 14 * depth * unit
      const lean =
        (exercise.id === 'deadlift' ? 10 : exercise.id === 'squat' ? 5 : 2) * depth * unit
      const ankle = { x: centerX - 4 * unit, y: ground }
      const knee = { x: centerX + (3 + 7 * depth) * unit, y: ground - 22 * unit }
      const hip = { x: centerX - 2 * unit + 2 * depth * unit, y: ground - 40 * unit + hipDrop }
      const shoulder = { x: centerX + lean, y: hip.y - 26 * unit }
      const head = { x: shoulder.x + 1.5 * unit, y: shoulder.y - 8 * unit }
      let elbow = { x: shoulder.x + 6 * unit, y: shoulder.y + 10 * unit }
      let wrist = { x: shoulder.x + 4 * unit, y: shoulder.y + 18 * unit }

      if (exercise.id === 'ohp') {
        wrist = { x: shoulder.x + unit, y: shoulder.y + 14 * unit - 22 * (1 - depth) * unit }
        elbow = { x: shoulder.x + 5 * unit, y: (shoulder.y + wrist.y) / 2 + 3 * unit }
      } else if (exercise.id === 'bench') {
        wrist = { x: shoulder.x + 10 * unit, y: shoulder.y + 12 * unit - 12 * (1 - depth) * unit }
        elbow = { x: shoulder.x + 9 * unit, y: shoulder.y + 12 * unit }
      } else if (exercise.id === 'curl') {
        wrist = { x: shoulder.x + 7 * unit, y: shoulder.y + 20 * unit - 11 * (1 - depth) * unit }
        elbow = { x: shoulder.x + 5 * unit, y: shoulder.y + 11 * unit }
      } else if (exercise.id === 'squat' || exercise.id === 'deadlift') {
        wrist = { x: shoulder.x + 8 * unit, y: shoulder.y + 2 * unit }
        elbow = { x: shoulder.x + 6 * unit, y: shoulder.y + 6 * unit }
      }

      const bones = [
        [ankle, knee],
        [knee, hip],
        [hip, shoulder],
        [shoulder, elbow],
        [elbow, wrist],
      ]
      context.lineCap = 'round'
      context.strokeStyle = color
      context.lineWidth = 4
      context.globalAlpha = 0.85
      for (const [a, b] of bones) {
        context.beginPath()
        context.moveTo(a.x, a.y)
        context.lineTo(b.x, b.y)
        context.stroke()
      }
      context.globalAlpha = 1
      context.beginPath()
      context.arc(head.x, head.y, 5.5 * unit, 0, Math.PI * 2)
      context.stroke()

      for (const point of [ankle, knee, hip, shoulder, elbow, wrist]) {
        context.beginPath()
        context.arc(point.x, point.y, 4.5, 0, Math.PI * 2)
        context.fillStyle = '#14110E'
        context.fill()
        context.lineWidth = 2.5
        context.strokeStyle = color
        context.stroke()
      }
      animationFrame = window.requestAnimationFrame(draw)
    }

    if (exercise && active) animationFrame = window.requestAnimationFrame(draw)
    else {
      const context = prepareCanvas(canvas)
      context?.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    }

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
    }
  }, [active, exercise, severity])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      aria-hidden="true"
    />
  )
}

export default function PoseCanvas(props: PoseCanvasProps) {
  if (props.mode === 'landmarks') {
    return (
      <LandmarkCanvas
        active={props.active}
        mirrored={props.mirrored}
        pose={props.pose}
        videoSize={props.videoSize}
      />
    )
  }

  return (
    <SyntheticPoseCanvas
      exercise={props.exercise}
      severity={props.severity}
      active={props.active}
    />
  )
}
