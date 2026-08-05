import { useEffect, useRef } from 'react'
import type { CameraAngle, ExerciseDef } from '@/lib/simulation'
import { MIN_POSE_VISIBILITY } from '@/lib/pose/config'
import { POSE_CONNECTIONS } from '@/lib/pose/connections'
import { landmarkDisplayPoint, objectFitRect, type Size } from '@/lib/pose/geometry'
import type { DetectedPose } from '@/lib/pose/types'

interface PoseCanvasProps {
  exercise: ExerciseDef | null
  severity: 'good' | 'warn' | 'crit'
  active: boolean
  /** detected camera viewpoint — the skeleton re-rigs to match */
  angle?: CameraAngle | null
  /** landmarks = real MediaPipe overlay on live video; synthetic = simulated rig */
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

const INK = '#14110E'

type Pt = { x: number; y: number }

/* ── 17-keypoint skeleton (MediaPipe-style) ──────────────── */
const KPS = [
  'nose',
  'eye_l',
  'eye_r',
  'ear_l',
  'ear_r',
  'shoulder_l',
  'shoulder_r',
  'elbow_l',
  'elbow_r',
  'wrist_l',
  'wrist_r',
  'hip_l',
  'hip_r',
  'knee_l',
  'knee_r',
  'ankle_l',
  'ankle_r',
] as const
type KpName = (typeof KPS)[number]
type Pose = Record<KpName, Pt>

const BONES: [KpName, KpName][] = [
  ['shoulder_l', 'shoulder_r'],
  ['shoulder_l', 'elbow_l'],
  ['elbow_l', 'wrist_l'],
  ['shoulder_r', 'elbow_r'],
  ['elbow_r', 'wrist_r'],
  ['shoulder_l', 'hip_l'],
  ['shoulder_r', 'hip_r'],
  ['hip_l', 'hip_r'],
  ['hip_l', 'knee_l'],
  ['knee_l', 'ankle_l'],
  ['hip_r', 'knee_r'],
  ['knee_r', 'ankle_r'],
]

const KEY_JOINT_PARTS: Record<string, [string, string, string]> = {
  Knee: ['hip', 'knee', 'ankle'],
  Hip: ['shoulder', 'hip', 'knee'],
  Elbow: ['shoulder', 'elbow', 'wrist'],
  Shoulder: ['hip', 'shoulder', 'elbow'],
}

/* named viewpoints → orbit degrees around the lifter */
const ORBIT: Record<CameraAngle, number> = {
  Front: 0,
  'Three-quarter': 45,
  Side: 90,
  'Rear three-quarter': 135,
  Rear: 180,
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t
const mixPt = (a: Pt, b: Pt, t: number): Pt => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) })

/* ── rig builder ───────────────────────────────────────────
   One continuous rig: the camera "orbits" the lifter.
   orbit 0 = front, 45 = three-quarter, 90 = side,
   135 = rear three-quarter, 180 = rear — and every degree
   in between is a valid in-between pose, so angle switches
   glide instead of snapping. */
interface RigOpts {
  W: number
  H: number
  s: number // eased rep depth 0..1
  lean: number // forward torso lean 0..1
  id: string
  orbit: number
}

function buildPose(o: RigOpts): Pose {
  const { W, H, s, lean, id, orbit } = o
  const rad = (orbit * Math.PI) / 180
  const sn = Math.sin(rad)
  const absc = Math.abs(Math.cos(rad))
  const sw = sn / (absc + sn || 1) // 0 = bilateral rig, 1 = profile rig
  const nearIsL = orbit <= 90 // past the side view the near limb flips

  const cx = W / 2
  const ground = H * 0.9
  const u = H / 100

  // whole-body bob — bigger from the side where depth reads clearly
  const hipDrop = (id === 'bench' ? 0 : 10 + 5 * sw) * s * u
  const armDip = 4 * s * u

  let kneeDrive = 0 // forward knee travel at depth (profile views)
  if (id === 'squat') kneeDrive = 9 * s
  else if (id === 'lunge') kneeDrive = 7 * s
  else if (id === 'deadlift') kneeDrive = 4 * s

  const kneeY = ground - 22 * u - 2 * s * u
  const hipY = ground - 42 * u + hipDrop
  const shoulderY = hipY - (26 - lean * 9) * u
  const headY = shoulderY - 9 * u

  /* ── legs ── */
  // bilateral rig (front & rear): full stance, knees track outward at depth
  const stance = 11 * u
  const koL = (id === 'squat' || id === 'lunge' ? 3.2 : 0.8) * s * u
  const koR = (id === 'squat' || id === 'lunge' ? 1.6 : 0.4) * s * u
  const bi = {
    ankleL: { x: cx - stance, y: ground },
    ankleR: { x: cx + stance, y: ground },
    kneeL: { x: cx - stance * 0.85 - koL, y: kneeY },
    kneeR: { x: cx + stance * 0.85 + koR, y: kneeY },
    hipL: { x: cx - 7.5 * u, y: hipY },
    hipR: { x: cx + 7.5 * u, y: hipY },
    shoulderL: { x: cx - 11 * u, y: shoulderY },
    shoulderR: { x: cx + 11 * u, y: shoulderY },
  }
  // profile rig (side): near limb anchors the silhouette, far limb drifts behind
  const farSgn = nearIsL ? 1 : -1
  const farDX = -2.2 * u * farSgn
  const farDY = -1.2 * u
  const prof = {
    ankle: { x: cx - 3 * u + kneeDrive * 0.4 * u, y: ground },
    knee: { x: cx + (3 + kneeDrive) * u, y: kneeY },
    hip: { x: cx, y: hipY },
    shoulder: { x: cx + lean * 8 * u, y: shoulderY },
  }
  const F = (p: Pt): Pt => ({ x: p.x + farDX, y: p.y + farDY })

  const ankleL = mixPt(bi.ankleL, nearIsL ? prof.ankle : F(prof.ankle), sw)
  const ankleR = mixPt(bi.ankleR, nearIsL ? F(prof.ankle) : prof.ankle, sw)
  const kneeL = mixPt(bi.kneeL, nearIsL ? prof.knee : F(prof.knee), sw)
  const kneeR = mixPt(bi.kneeR, nearIsL ? F(prof.knee) : prof.knee, sw)
  const hipL = mixPt(bi.hipL, nearIsL ? prof.hip : F(prof.hip), sw)
  const hipR = mixPt(bi.hipR, nearIsL ? F(prof.hip) : prof.hip, sw)
  const shoulderL = mixPt(bi.shoulderL, nearIsL ? prof.shoulder : F(prof.shoulder), sw)
  const shoulderR = mixPt(bi.shoulderR, nearIsL ? F(prof.shoulder) : prof.shoulder, sw)

  /* ── arms per lift (bilateral variant + profile variant, blended) ── */
  let biArm: { eL: Pt; wL: Pt; eR: Pt; wR: Pt }
  let profArm: { e: Pt; w: Pt }
  if (id === 'ohp') {
    // bilateral: elbows flare out, bar travels straight up overhead
    const flare = 7 - 2.5 * (1 - s)
    biArm = {
      eL: { x: bi.shoulderL.x - flare * u, y: bi.shoulderL.y + 8 * u - 9 * (1 - s) * u },
      wL: { x: bi.shoulderL.x + 1 * u, y: bi.shoulderL.y + 9 * u - 22 * (1 - s) * u },
      eR: { x: bi.shoulderR.x + flare * u, y: bi.shoulderR.y + 8 * u - 9 * (1 - s) * u },
      wR: { x: bi.shoulderR.x - 1 * u, y: bi.shoulderR.y + 9 * u - 22 * (1 - s) * u },
    }
    const wY = prof.shoulder.y + 16 * u - 24 * (1 - s) * u
    profArm = {
      w: { x: prof.shoulder.x + 1 * u, y: wY },
      e: { x: prof.shoulder.x + 4 * u, y: (prof.shoulder.y + wY) / 2 + 3 * u },
    }
  } else if (id === 'curl') {
    biArm = {
      wL: { x: bi.shoulderL.x + 7 * u, y: bi.shoulderL.y + 22 * u - 13 * (1 - s) * u },
      eL: { x: bi.shoulderL.x + 5 * u, y: bi.shoulderL.y + 12 * u },
      // alternate arms like a real front-view curl set
      wR: { x: bi.shoulderR.x - 7 * u, y: bi.shoulderR.y + 22 * u - 13 * s * u },
      eR: { x: bi.shoulderR.x - 5 * u, y: bi.shoulderR.y + 12 * u },
    }
    profArm = {
      w: { x: prof.shoulder.x + 7 * u, y: prof.shoulder.y + 22 * u - 13 * (1 - s) * u },
      e: { x: prof.shoulder.x + 5 * u, y: prof.shoulder.y + 12 * u },
    }
  } else if (id === 'squat' || id === 'deadlift') {
    biArm = {
      // arms angled in to the bar in front of the torso
      wL: { x: bi.shoulderL.x + 4 * u, y: bi.shoulderL.y + 11 * u + armDip },
      eL: { x: bi.shoulderL.x - 1.5 * u, y: bi.shoulderL.y + 6 * u + armDip },
      wR: { x: bi.shoulderR.x - 4 * u, y: bi.shoulderR.y + 11 * u + armDip },
      eR: { x: bi.shoulderR.x + 1.5 * u, y: bi.shoulderR.y + 6 * u + armDip },
    }
    profArm = {
      w: { x: prof.shoulder.x + 9 * u, y: prof.shoulder.y + 4 * u + armDip },
      e: { x: prof.shoulder.x + 6.5 * u, y: prof.shoulder.y + 8 * u + armDip },
    }
  } else {
    // lunge + default: arms at sides
    biArm = {
      wL: { x: bi.shoulderL.x - 3 * u, y: bi.shoulderL.y + 24 * u },
      eL: { x: bi.shoulderL.x - 1.5 * u, y: bi.shoulderL.y + 12 * u },
      wR: { x: bi.shoulderR.x + 3 * u, y: bi.shoulderR.y + 24 * u },
      eR: { x: bi.shoulderR.x + 1.5 * u, y: bi.shoulderR.y + 12 * u },
    }
    profArm = {
      w: { x: prof.shoulder.x + 4 * u, y: prof.shoulder.y + 24 * u },
      e: { x: prof.shoulder.x + 3 * u, y: prof.shoulder.y + 12 * u },
    }
  }

  const elbowL = mixPt(biArm.eL, nearIsL ? profArm.e : F(profArm.e), sw)
  const elbowR = mixPt(biArm.eR, nearIsL ? F(profArm.e) : profArm.e, sw)
  const wristL = mixPt(biArm.wL, nearIsL ? profArm.w : F(profArm.w), sw)
  const wristR = mixPt(biArm.wR, nearIsL ? F(profArm.w) : profArm.w, sw)

  /* ── head cluster ── */
  // anchored to the blended neck so the head never detaches mid-orbit
  const nearShoulder = nearIsL ? shoulderL : shoulderR
  const headX = mix((shoulderL.x + shoulderR.x) / 2, nearShoulder.x + 2 * u, sw)
  const eyeSep = (1.2 + 2 * absc) * u
  const earSep = eyeSep + 1.6 * absc * u // ears tuck in as the face turns away
  const nose = { x: headX, y: headY }
  const eyeL = { x: headX - eyeSep, y: headY - 1.2 * u }
  const eyeR = { x: headX + eyeSep, y: headY - 1.2 * u }
  const earL = { x: headX - earSep, y: headY + 0.4 * u }
  const earR = { x: headX + earSep, y: headY + 0.4 * u }

  let pose: Pose = {
    nose,
    eye_l: eyeL,
    eye_r: eyeR,
    ear_l: earL,
    ear_r: earR,
    shoulder_l: shoulderL,
    shoulder_r: shoulderR,
    elbow_l: elbowL,
    elbow_r: elbowR,
    wrist_l: wristL,
    wrist_r: wristR,
    hip_l: hipL,
    hip_r: hipR,
    knee_l: kneeL,
    knee_r: kneeR,
    ankle_l: ankleL,
    ankle_r: ankleR,
  }

  // bench: lying flat — hips/shoulders/head share a line, knees bent up
  if (id === 'bench') {
    const benchY = ground - 16 * u
    const headXb = cx - 24 * u
    const shX = cx - 14 * u
    const hipXb = cx + 8 * u
    const sep = (1 - sw) * 2.5 * u // bilateral arm/hip separation fades to profile
    pose = {
      nose: { x: headXb, y: benchY - 3 * u },
      eye_l: { x: headXb - 1 * u, y: benchY - 4 * u },
      eye_r: { x: headXb + 2 * u, y: benchY - 4 * u },
      ear_l: { x: headXb - 2 * u, y: benchY - 2 * u },
      ear_r: { x: headXb + 3 * u, y: benchY - 2 * u },
      shoulder_l: { x: shX, y: benchY },
      shoulder_r: { x: shX + sep, y: benchY + sep * 0.6 },
      elbow_l: { x: shX + 5 * u, y: benchY + 2 * u + 4 * s * u },
      elbow_r: { x: shX + 5 * u + sep * 0.2, y: benchY + 3 * u + 4 * s * u },
      wrist_l: { x: shX + 4 * u, y: benchY - 11 * u + 12 * s * u },
      wrist_r: { x: shX + 4.5 * u + sep * 0.2, y: benchY - 10 * u + 12 * s * u },
      hip_l: { x: hipXb, y: benchY },
      hip_r: { x: hipXb + sep, y: benchY + sep * 0.6 },
      knee_l: { x: hipXb + 9 * u, y: ground - 20 * u },
      knee_r: { x: hipXb + 9.5 * u, y: ground - 19 * u },
      ankle_l: { x: hipXb + 12 * u, y: ground },
      ankle_r: { x: hipXb + 13 * u, y: ground },
    }
  }

  return pose
}

/* ── smoothing (one-euro-ish): kill jitter, keep it floaty ── */
function smoothPose(prev: Pose | null, next: Pose, k: number): Pose {
  if (!prev) return next
  const out = { ...next }
  for (const name of KPS) {
    out[name] = {
      x: prev[name].x + (next[name].x - prev[name].x) * k,
      y: prev[name].y + (next[name].y - prev[name].y) * k,
    }
  }
  return out
}

function jointDeg(a: Pt, v: Pt, b: Pt): number {
  const ang =
    (Math.atan2(a.y - v.y, a.x - v.x) - Math.atan2(b.y - v.y, b.x - v.x)) * (180 / Math.PI)
  return Math.abs(((ang + 540) % 360) - 180)
}

/* ── real MediaPipe landmark overlay (camera / uploaded video) ── */
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

/**
 * Stylized animated pose-estimation overlay — 17 keypoints on a
 * continuous camera-orbit rig, buttery one-euro smoothed motion.
 * Drives demo mode and the setup-screen perspective preview.
 */
function SyntheticPoseCanvas({ exercise, severity, active, angle = null }: PoseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({ exercise, severity, active, angle })
  stateRef.current = { exercise, severity, active, angle }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = parent.clientWidth * dpr
      canvas.height = parent.clientHeight * dpr
      canvas.style.width = `${parent.clientWidth}px`
      canvas.style.height = `${parent.clientHeight}px`
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    const start = performance.now()
    let smooth: Pose | null = null
    let smoothS = 0
    let smoothOrbit = 90 // grow in from a side view

    const draw = (now: number) => {
      const { exercise: ex, severity: sev, active: isActive, angle: ang } = stateRef.current
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)
      if (!ex || !isActive) {
        smooth = null
        smoothS = 0
        raf = requestAnimationFrame(draw)
        return
      }

      /* orbit glides to the detected angle — no snapping between views */
      const targetOrbit = ORBIT[ang ?? 'Side']
      if (smooth === null) smoothOrbit = targetOrbit // grow in already aligned
      smoothOrbit += (targetOrbit - smoothOrbit) * 0.045
      const orbit = smoothOrbit
      const rad = (orbit * Math.PI) / 180
      const snV = Math.sin(rad)
      const faceAlpha = Math.pow(Math.max(0, Math.cos(rad)), 1.3)

      /* rep phase with eased in/out + tiny hand-tremor noise (no jitter) */
      const tempo = ex.baseTempo * 1000
      const t = ((now - start) % tempo) / tempo
      const raw = (1 - Math.cos(t * Math.PI * 2)) / 2
      const eased = raw * raw * (3 - 2 * raw) // smoothstep
      smoothS += (eased - smoothS) * 0.08
      const wob = (n: number) => Math.sin(now / 640 + n * 1.7) * 0.35 + Math.sin(now / 291 + n) * 0.2
      const leanTarget =
        ex.id === 'deadlift' ? 0.55 + 0.35 * smoothS : ex.id === 'squat' ? 0.18 + 0.22 * smoothS : 0.08
      const lean = leanTarget + wob(1) * 0.012

      const target = buildPose({ W, H, s: smoothS, lean, id: ex.id, orbit })
      const pose = smoothPose(smooth, target, 0.16)
      smooth = pose

      const color = COLORS[sev]
      const u = H / 100
      const lw = Math.max(3, H * 0.011)
      const jr = Math.max(3.2, H * 0.011)
      const headR = 5.2 * u
      const dpr = Math.min(window.devicePixelRatio || 1, 2)

      /* how "far" each limb side is from camera at the current orbit —
         continuous, so depth dimming never pops when the view rotates */
      const farSgn = orbit <= 90 ? 1 : -1
      const farOf = (name: KpName): number => {
        if (name.endsWith('_r')) return snV * Math.max(0, farSgn)
        if (name.endsWith('_l')) return snV * Math.max(0, -farSgn)
        return 0
      }

      /* reference depth line at the hips */
      if (ex.id !== 'bench') {
        ctx.beginPath()
        ctx.moveTo(W * 0.3, pose.hip_l.y)
        ctx.lineTo(W * 0.7, pose.hip_l.y)
        ctx.strokeStyle = 'rgba(20,17,14,0.28)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([3, 5])
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      /* halo pass for legibility over video */
      for (const [a, b] of BONES) {
        ctx.beginPath()
        ctx.moveTo(pose[a].x, pose[a].y)
        ctx.lineTo(pose[b].x, pose[b].y)
        ctx.strokeStyle = INK
        ctx.globalAlpha = 0.25
        ctx.lineWidth = lw + 5
        ctx.stroke()
      }

      /* bone pass — far side dims smoothly with orbit */
      for (const [a, b] of BONES) {
        const far = Math.max(farOf(a), farOf(b))
        ctx.beginPath()
        ctx.moveTo(pose[a].x, pose[a].y)
        ctx.lineTo(pose[b].x, pose[b].y)
        ctx.strokeStyle = color
        ctx.globalAlpha = 0.92 * (1 - 0.55 * far)
        ctx.lineWidth = lw
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      /* head ring */
      ctx.beginPath()
      ctx.arc(pose.nose.x, pose.nose.y, headR, 0, Math.PI * 2)
      ctx.strokeStyle = color
      ctx.lineWidth = lw
      ctx.globalAlpha = 0.92
      ctx.stroke()
      ctx.globalAlpha = 1

      /* eye dots — the only face detail; fades out as the head turns away */
      if (faceAlpha > 0.05) {
        for (const name of ['eye_l', 'eye_r'] as const) {
          const p = pose[name]
          ctx.beginPath()
          ctx.arc(p.x, p.y, jr * 0.62, 0, Math.PI * 2)
          ctx.fillStyle = INK
          ctx.globalAlpha = faceAlpha * 0.85
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      /* keypoint dots */
      for (const name of KPS) {
        // nose → head ring; eyes → drawn above as face dots
        if (name === 'nose' || name === 'eye_l' || name === 'eye_r') continue
        const p = pose[name]
        const far = farOf(name)
        ctx.beginPath()
        ctx.arc(p.x, p.y, jr, 0, Math.PI * 2)
        ctx.fillStyle = INK
        ctx.globalAlpha = 1 - 0.45 * far
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = color
        ctx.globalAlpha = 0.95 * (1 - 0.55 * far)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      /* key-joint angle arc + readout — tracked on the near-side limb */
      const suffix = orbit <= 90 ? '_l' : '_r'
      const parts = KEY_JOINT_PARTS[ex.keyJoint] ?? KEY_JOINT_PARTS.Knee
      const [na, nv, nb] = parts.map((p) => `${p}${suffix}`) as [KpName, KpName, KpName]
      const deg = jointDeg(pose[na], pose[nv], pose[nb])
      const v = pose[nv]
      const arcR = 16 * (H / 360)
      ctx.beginPath()
      ctx.arc(
        v.x,
        v.y,
        arcR,
        Math.atan2(pose[nb].y - v.y, pose[nb].x - v.x),
        Math.atan2(pose[na].y - v.y, pose[na].x - v.x),
      )
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.75
      ctx.stroke()
      ctx.globalAlpha = 1
      const label = `${ex.keyJoint.toUpperCase()} ${Math.round(deg / 2) * 2}°`
      ctx.font = `600 ${Math.max(11, H * 0.034)}px "JetBrains Mono", ui-monospace, monospace`
      const tw = ctx.measureText(label).width
      const lx = Math.min(Math.max(v.x + arcR + 8, 8), W - tw - 16)
      // shoulder chips sit under the joint so they don't collide with the head
      const ly = ex.keyJoint === 'Shoulder' ? v.y + arcR + 16 : v.y - arcR - 6
      ctx.fillStyle = 'rgba(244,241,234,0.9)'
      ctx.fillRect(lx - 5, ly - 13, tw + 10, 19)
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.5
      ctx.strokeRect(lx - 5, ly - 13, tw + 10, 19)
      ctx.fillStyle = color
      ctx.fillText(label, lx, ly)

      /* bench line when benching */
      if (ex.id === 'bench') {
        const ground = H * 0.9
        ctx.beginPath()
        ctx.moveTo(W * 0.18, ground - 16 * u)
        ctx.lineTo(W * 0.62, ground - 16 * u)
        ctx.strokeStyle = 'rgba(20,17,14,0.5)'
        ctx.lineWidth = 4
        ctx.stroke()
      }

      /* ground line */
      ctx.beginPath()
      ctx.moveTo(W * 0.16, H * 0.9 + 2)
      ctx.lineTo(W * 0.84, H * 0.9 + 2)
      ctx.strokeStyle = 'rgba(255,77,0,0.3)'
      ctx.lineWidth = 2 * dpr * 0.5 + 1
      ctx.setLineDash([7, 7])
      ctx.stroke()
      ctx.setLineDash([])

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
}

/**
 * Pose overlay router: real MediaPipe landmarks for camera/upload,
 * the simulated continuous-orbit rig for demo mode & previews.
 */
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
      angle={props.angle}
    />
  )
}
