import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  ArrowLeft,
  Camera,
  CircleStop,
  Flame,
  MessagesSquare,
  ScanFace,
  Timer,
  TriangleAlert,
  Upload,
  Video,
  Zap,
} from 'lucide-react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import PoseCanvas from '@/components/PoseCanvas'
import EffortDial, { zoneFor } from '@/components/EffortDial'
import { useMediaSource, type MediaSourceKind } from '@/hooks/useMediaSource'
import { usePoseTracking } from '@/hooks/usePoseTracking'
import { useSquatAnalysis } from '@/hooks/useSquatAnalysis'
import {
  EXERCISES,
  angleForExercise,
  simulateRep,
  type CameraAngle,
  type ExerciseDef,
  type FeedItem,
  type RepData,
  type SessionPhase,
} from '@/lib/simulation'

type Source = MediaSourceKind | 'demo' | null
type SessionViewPhase = SessionPhase | 'media'
type MobileTab = 'coach' | 'data'

const CAMERA_VIDEO_MIRRORED = false

const SEV_STYLE: Record<FeedItem['severity'], string> = {
  good: 'border-emerald-600 bg-emerald-50 text-emerald-950',
  warn: 'border-amber-600 bg-amber-50 text-amber-950',
  crit: 'border-red-600 bg-red-50 text-red-950',
  info: 'border-blue-600 bg-blue-50 text-blue-950',
}

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function Session() {
  const [phase, setPhase] = useState<SessionViewPhase>('setup')
  const [demoActive, setDemoActive] = useState(false)
  const [exercise, setExercise] = useState<ExerciseDef | null>(null)
  const [angle, setAngle] = useState<CameraAngle | null>(null)
  const [confidence, setConfidence] = useState(0)
  const [reps, setReps] = useState<RepData[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [tab, setTab] = useState<MobileTab>('coach')

  const repTimerRef = useRef<number | null>(null)
  const clockRef = useRef<number | null>(null)
  const analysisTimerRef = useRef<number | null>(null)
  const feedIdRef = useRef(0)
  const repsRef = useRef<RepData[]>([])
  const consumedSquatBatchRef = useRef(0)
  const {
    source: mediaSource,
    status: mediaStatus,
    error: mediaError,
    lifecycleKey: mediaLifecycleKey,
    videoElement,
    videoSize,
    videoRef,
    startCamera: openCamera,
    startUpload: openUpload,
    resetMedia,
  } = useMediaSource()
  const source: Source = demoActive ? 'demo' : mediaSource
  const realTrackingMode = source === 'camera' || source === 'upload'
  const poseTrackingEnabled =
    realTrackingMode &&
    phase === 'media' &&
    (mediaStatus === 'ready' || mediaStatus === 'paused' || mediaStatus === 'ended')
  const poseTracking = usePoseTracking({
    active: poseTrackingEnabled,
    lifecycleKey: mediaLifecycleKey,
    source: mediaSource,
    video: videoElement,
  })
  const squatAnalysis = useSquatAnalysis({
    exerciseId: realTrackingMode ? (exercise?.id ?? null) : null,
    mediaLifecycleKey,
    timelineRevision: poseTracking.timelineRevision,
    sample: poseTracking.latestSample,
    videoSize,
  })
  const stopPoseTracking = poseTracking.stop
  const trackedPose = poseTracking.latestResult?.poses[0] ?? null

  const pushFeed = useCallback((message: string, severity: FeedItem['severity']) => {
    setFeed((f) => [{ id: feedIdRef.current++, time: now(), message, severity }, ...f].slice(0, 40))
  }, [])

  useEffect(() => {
    if (squatAnalysis.eventBatchId <= consumedSquatBatchRef.current) return
    consumedSquatBatchRef.current = squatAnalysis.eventBatchId
    for (const event of squatAnalysis.events) {
      if (event.type === 'rep-completed') {
        pushFeed(
          `Rep ${event.rep.repIndex} recorded — ${(event.rep.durationMs / 1000).toFixed(1)} s.`,
          'good',
        )
        for (const signal of event.rep.signals) {
          const severity: FeedItem['severity'] =
            signal.code === 'depth-not-reached' || signal.code === 'torso-inclination' || signal.code === 'movement-control'
              ? 'warn'
              : signal.code === 'depth-reached'
                ? 'good'
                : 'info'
          pushFeed(signal.message, severity)
        }
      } else if (event.partial.signals.length) {
        event.partial.signals.forEach((signal) => pushFeed(signal.message, 'warn'))
      } else {
        pushFeed('Movement was observed, but the evidence was insufficient to record a complete rep.', 'info')
      }
    }
  }, [pushFeed, squatAnalysis.eventBatchId, squatAnalysis.events])

  const clearTimers = useCallback(() => {
    if (repTimerRef.current) window.clearTimeout(repTimerRef.current)
    if (clockRef.current) window.clearInterval(clockRef.current)
    if (analysisTimerRef.current) window.clearTimeout(analysisTimerRef.current)
    repTimerRef.current = null
    clockRef.current = null
    analysisTimerRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      clearTimers()
    }
  }, [clearTimers])

  const scheduleNextRep = useCallback(
    function schedule(ex: ExerciseDef) {
      const nextIndex = repsRef.current.length + 1
      const prev = repsRef.current[repsRef.current.length - 1]
      const delay = prev ? prev.tempo * 1000 : ex.baseTempo * 1000
      repTimerRef.current = window.setTimeout(() => {
        const rep = simulateRep(nextIndex, ex)
        repsRef.current = [...repsRef.current, rep]
        setReps(repsRef.current)
        pushFeed(rep.cue, rep.severity)
        if (rep.effort >= 85) {
          pushFeed(`Effort at ${rep.effort}% — facial strain & bar speed say you're grinding`, 'info')
        }
        schedule(ex)
      }, delay)
    },
    [pushFeed],
  )

  const beginAnalysis = useCallback(
    (picked?: ExerciseDef) => {
      const ex = picked ?? EXERCISES[Math.floor(Math.random() * EXERCISES.length)]
      clearTimers()
      setPhase('analyzing')
      pushFeed('Pose model initializing — tracking 17 keypoints…', 'info')
      analysisTimerRef.current = window.setTimeout(() => {
        analysisTimerRef.current = null
        setExercise(ex)
        setAngle(angleForExercise(ex))
        setConfidence(88 + Math.floor(Math.random() * 10))
        setPhase('live')
        pushFeed(
          `Movement classified: ${ex.name}. Best viewing angle locked — ${ex.keyJoint.toLowerCase()} angle tracked.`,
          'info',
        )
        pushFeed('Set started — rep counting live', 'info')
        clockRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000)
        scheduleNextRep(ex)
      }, 2600)
    },
    [clearTimers, pushFeed, scheduleNextRep],
  )

  const clearAnalysisData = useCallback(() => {
    clearTimers()
    repsRef.current = []
    setExercise(null)
    setAngle(null)
    setConfidence(0)
    setReps([])
    setFeed([])
    setElapsed(0)
    setSummaryOpen(false)
  }, [clearTimers])

  const startCamera = () => {
    stopPoseTracking()
    clearAnalysisData()
    setDemoActive(false)
    setPhase('media')
    void openCamera()
  }

  const startUpload = (file: File) => {
    stopPoseTracking()
    clearAnalysisData()
    setDemoActive(false)
    setPhase('media')
    openUpload(file)
  }

  const startDemo = useCallback(() => {
    stopPoseTracking()
    clearAnalysisData()
    resetMedia()
    setDemoActive(true)
    beginAnalysis()
  }, [beginAnalysis, clearAnalysisData, resetMedia, stopPoseTracking])

  // /session?demo=1 jumps straight into a simulated set (handy for hackathon judging)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') !== '1') return
    const timer = window.setTimeout(startDemo, 0)
    return () => window.clearTimeout(timer)
  }, [startDemo])

  const overrideExercise = (id: string) => {
    const ex = EXERCISES.find((e) => e.id === id)
    if (!ex) return
    clearTimers()
    setExercise(ex)
    if (realTrackingMode) {
      setAngle(ex.bestAngle)
      setConfidence(0)
      setFeed([])
      pushFeed(
        ex.id === 'squat'
          ? 'Back Squat selected — use a clear side view for rep analysis.'
          : `${ex.name} is not supported for real analysis yet. Pose landmarks remain visible.`,
        'info',
      )
      return
    }
    setAngle(angleForExercise(ex))
    setConfidence(91 + Math.floor(Math.random() * 7))
    pushFeed(`Exercise corrected to ${ex.name} — recalibrating tracking`, 'info')
    clockRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    scheduleNextRep(ex)
  }

  const endSession = () => {
    stopPoseTracking()
    clearTimers()
    setPhase('ended')
    setSummaryOpen(true)
  }

  const reset = () => {
    stopPoseTracking()
    clearAnalysisData()
    resetMedia()
    setPhase('setup')
    setDemoActive(false)
    setTab('coach')
  }

  const latest = reps[reps.length - 1]
  const realReps = squatAnalysis.completedReps
  const latestRealRep = realReps[realReps.length - 1]
  const realSquatSelected = realTrackingMode && exercise?.id === 'squat'
  const avgForm = reps.length ? Math.round(reps.reduce((a, r) => a + r.formScore, 0) / reps.length) : 0
  const effort = latest?.effort ?? 0
  const zone = zoneFor(effort)
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  const realDepthLabel = latestRealRep?.depth === 'reached'
    ? 'REACHED'
    : latestRealRep?.depth === 'not-reached'
      ? 'NOT OBSERVED'
      : latestRealRep?.depth === 'unknown'
        ? 'UNKNOWN'
        : '—'
  const analysisReadiness = !realTrackingMode
    ? null
    : !exercise
      ? 'Select an exercise to begin real analysis.'
      : exercise.id !== 'squat'
        ? `${exercise.name} is not supported for real analysis yet.`
        : squatAnalysis.snapshot.readiness === 'insufficient-view'
          ? 'A reliable side view is not currently available.'
          : squatAnalysis.snapshot.readiness === 'not-ready'
            ? 'Hold a clear side-on standing position while the analyzer calibrates.'
            : `Tracking ${squatAnalysis.snapshot.selectedSide ?? 'selected'} side — phase ${squatAnalysis.snapshot.phase.replace('_', ' ')}.`
  const realAverageTempo = realReps.length
    ? realReps.reduce((sum, rep) => sum + rep.durationMs, 0) / realReps.length / 1000
    : null
  const realObservationCount = realReps.reduce((sum, rep) => sum + rep.signals.length, 0)

  const trackingErrorMessage = mediaError?.message ?? poseTracking.error?.message ?? null
  const trackingLabel = mediaError
    ? 'MEDIA NEEDS ATTENTION'
    : mediaStatus === 'loading'
      ? source === 'camera'
        ? 'PREPARING CAMERA…'
        : 'PREPARING VIDEO…'
      : poseTracking.status === 'loading'
        ? 'LOADING POSE MODEL…'
        : mediaStatus === 'paused' || poseTracking.status === 'paused'
          ? 'VIDEO PAUSED'
          : mediaStatus === 'ended' || poseTracking.status === 'ended'
            ? 'VIDEO ENDED'
            : poseTracking.status === 'no-pose'
              ? 'NO PERSON DETECTED'
              : poseTracking.status === 'tracking'
                ? 'POSE TRACKING ACTIVE'
                : poseTracking.status === 'error'
                  ? 'POSE MODEL NEEDS ATTENTION'
                  : mediaStatus === 'ready'
                    ? 'POSE MODEL READY'
                    : 'PREPARING MEDIA…'
  const trackingDescription = trackingErrorMessage
    ? trackingErrorMessage
    : poseTracking.status === 'tracking'
      ? analysisReadiness ?? 'Real browser pose landmarks are being tracked.'
      : poseTracking.status === 'no-pose'
        ? 'Keep one full person visible in the frame. This is not a fatal tracking error.'
        : mediaStatus === 'paused' || poseTracking.status === 'paused'
          ? 'Inference is paused. Play or seek the video to analyze another frame.'
          : mediaStatus === 'ended' || poseTracking.status === 'ended'
            ? 'Playback ended. Replay the video to resume pose tracking.'
            : poseTracking.status === 'loading'
              ? 'Loading the Pose Landmarker Lite runtime and model assets.'
              : 'Waiting for a playable video frame. No fitness analysis is being generated.'

  const statTiles = [
    {
      label: 'REPS',
      value: realTrackingMode ? (realSquatSelected ? squatAnalysis.snapshot.repCount : '—') : reps.length,
      key: realTrackingMode ? (realSquatSelected ? squatAnalysis.snapshot.repCount : 'unavailable') : reps.length,
      accent: !realTrackingMode || realSquatSelected,
    },
    {
      label: 'S / REP',
      value: realTrackingMode
        ? realSquatSelected && latestRealRep ? (latestRealRep.durationMs / 1000).toFixed(1) : '—'
        : latest ? latest.tempo.toFixed(1) : '—',
      key: realTrackingMode ? (latestRealRep?.durationMs ?? 'unavailable') : (latest?.tempo ?? 0),
      accent: false,
    },
    {
      label: realTrackingMode ? 'DEPTH' : 'FORM',
      value: realTrackingMode ? (realSquatSelected ? realDepthLabel : '—') : avgForm || '—',
      key: realTrackingMode ? `${realDepthLabel}:${latestRealRep?.repIndex ?? 0}` : avgForm,
      accent: false,
    },
  ]

  const chartEl = (
    <div className="h-48 p-3">
      {(realTrackingMode ? realReps.length : reps.length) === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="mono-data text-[10px] tracking-[0.25em] text-muted-foreground">
            {realTrackingMode
              ? realSquatSelected
                ? 'COMPLETED SQUAT TEMPO APPEARS HERE'
                : 'SELECT BACK SQUAT FOR REAL REP ANALYSIS'
              : 'REPS PLOT HERE ONCE YOUR SET STARTS'}
          </p>
        </div>
      ) : realTrackingMode ? (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={realReps.map((rep) => ({ rep: rep.repIndex, tempo: rep.durationMs / 1000 }))}
            margin={{ top: 4, right: 8, bottom: 0, left: -18 }}
          >
            <CartesianGrid stroke="hsl(30 8% 7% / 0.12)" vertical={false} />
            <XAxis dataKey="rep" tick={{ fill: 'hsl(30 5% 38%)', fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
            <YAxis unit="s" tick={{ fill: 'hsl(30 5% 38%)', fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: 'hsl(40 33% 97%)', border: '2px solid hsl(30 8% 7%)', borderRadius: 2, fontSize: 12, fontFamily: 'JetBrains Mono' }}
            />
            <Line type="monotone" dataKey="tempo" name="Tempo (s)" stroke="hsl(221 83% 45%)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(221 83% 45%)' }} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={reps} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="hsl(30 8% 7% / 0.12)" vertical={false} />
            <XAxis dataKey="rep" tick={{ fill: 'hsl(30 5% 38%)', fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="l" domain={[0, 100]} tick={{ fill: 'hsl(30 5% 38%)', fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="r" orientation="right" unit="s" tick={{ fill: 'hsl(30 5% 38%)', fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: 'hsl(40 33% 97%)',
                border: '2px solid hsl(30 8% 7%)',
                borderRadius: 2,
                fontSize: 12,
                fontFamily: 'JetBrains Mono',
              }}
              labelStyle={{ color: 'hsl(30 5% 38%)' }}
            />
            <Bar yAxisId="l" dataKey="formScore" name="Form score" fill="hsl(16 100% 50%)" maxBarSize={26} />
            <Line yAxisId="r" type="monotone" dataKey="tempo" name="Tempo (s)" stroke="hsl(221 83% 45%)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(221 83% 45%)' }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )

  const feedEl = (
    <div className="max-h-64 overflow-y-auto p-3 lg:max-h-72">
      {feed.length === 0 ? (
        <p className="mono-data p-2 text-[10px] tracking-[0.25em] text-muted-foreground">
          {realTrackingMode
            ? realSquatSelected
              ? 'EVIDENCE-BASED SQUAT OBSERVATIONS APPEAR HERE'
              : 'SELECT BACK SQUAT FOR REAL OBSERVATIONS'
            : 'CUES LAND HERE MID-SET'}
        </p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {feed.map((item) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                className={`border-2 px-3 py-2 text-xs ${SEV_STYLE[item.severity]}`}
              >
                <span className="mono-data mr-2 text-[9px] opacity-60">{item.time}</span>
                {item.message}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )

  return (
    <div className="min-h-screen touch-manipulation bg-background pb-24 lg:pb-0">
      <div className="noise" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="icon" aria-label="Back home" className="border-2 border-transparent hover:border-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <span className="text-xl font-bold tracking-tight">
              FORMFIT<span className="text-primary">*</span>
            </span>
            {source && (
              <span className="mono-data hidden border-2 border-foreground bg-secondary px-2 py-0.5 text-[9px] font-semibold tracking-[0.25em] sm:inline-block">
                {source === 'demo' ? 'SIMULATED ANALYSIS' : 'REAL POSE TRACKING'}
              </span>
            )}
          </div>
          {/* desktop-only: REC + END SET (mobile gets a bottom bar) */}
          <div className="hidden items-center gap-4 lg:flex">
            {phase === 'live' && (
              <>
                <span className="mono-data flex items-center gap-2 text-xs font-semibold tracking-[0.2em]">
                  <span className="blink-rec inline-block h-2.5 w-2.5 rounded-full bg-primary" />
                  REC {mm}:{ss}
                </span>
                <Button
                  size="sm"
                  onClick={endSession}
                  className="hard-shadow-sm border-2 border-foreground bg-destructive font-bold text-destructive-foreground transition-transform hover:-translate-y-0.5"
                >
                  <CircleStop className="mr-1.5 h-4 w-4" /> END SET
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4 lg:py-6">
        <div className="lg:grid lg:grid-cols-3 lg:gap-6">
          {/* ── Video panel (shared, responsive) ── */}
          <div className="lg:col-span-2">
            <div className="hard-shadow relative aspect-[4/5] overflow-hidden border-2 border-foreground bg-foreground sm:aspect-video">
              {/* video source */}
              {(source === 'camera' || source === 'upload') && (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  controls={source === 'upload'}
                  className="h-full w-full object-cover"
                />
              )}
              {source === 'demo' && <div className="bg-grid absolute inset-0 bg-background" />}

              {/* setup overlay */}
              {phase === 'setup' && (
                <div className="bg-grid absolute inset-0 flex flex-col items-center justify-center gap-6 bg-background p-6 text-center">
                  <div>
                    <p className="mono-data text-[10px] tracking-[0.3em] text-primary">SESSION ROOM</p>
                    <h1 className="mt-2 text-3xl font-bold uppercase tracking-tight">
                      Start a <span className="font-serifit normal-case italic text-primary">set</span>
                    </h1>
                    <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                      Prop your phone up, upload a clip, or run the simulated demo.
                    </p>
                  </div>
                  <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center">
                    <Button
                      size="lg"
                      className="hard-shadow-sm h-12 w-full border-2 border-foreground font-bold transition-transform hover:-translate-y-0.5 sm:w-auto"
                      onClick={startCamera}
                    >
                      <Camera className="mr-2 h-5 w-5" /> USE CAMERA
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="hard-shadow-sm h-12 w-full border-2 border-foreground bg-card font-bold transition-transform hover:-translate-y-0.5 sm:w-auto"
                      asChild
                    >
                      <label className="cursor-pointer">
                        <Upload className="mr-2 h-5 w-5" /> UPLOAD VIDEO
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) startUpload(f)
                          }}
                        />
                      </label>
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="hard-shadow-sm h-12 w-full border-2 border-foreground bg-foreground font-bold text-background transition-transform hover:-translate-y-0.5 hover:bg-foreground sm:w-auto"
                      onClick={startDemo}
                    >
                      <Zap className="mr-2 h-5 w-5" /> DEMO MODE
                    </Button>
                  </div>
                </div>
              )}

              {phase === 'media' && (
                <div className="absolute inset-x-4 top-4 z-10 border-2 border-foreground bg-background/95 p-4 backdrop-blur">
                  <div className="flex items-start gap-3">
                    {trackingErrorMessage ? (
                      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                    ) : (
                      <Video className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="mono-data text-[10px] font-semibold tracking-[0.2em]">
                        {trackingLabel}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {trackingDescription}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={reset}>
                          CHOOSE ANOTHER SOURCE
                        </Button>
                        {poseTracking.status === 'error' && poseTracking.error?.recoverable && (
                          <Button size="sm" onClick={poseTracking.retry}>
                            RETRY POSE MODEL
                          </Button>
                        )}
                        {mediaError && (
                          <Button size="sm" onClick={startDemo}>
                            RUN SIMULATED DEMO
                          </Button>
                        )}
                        {realSquatSelected && (
                          <Button size="sm" onClick={endSession}>
                            END ANALYSIS
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* analyzing overlay */}
              {phase === 'analyzing' && (
                <div className="absolute inset-0">
                  <div className="scanline" />
                  <div className="absolute inset-x-0 bottom-6 flex justify-center">
                    <motion.span
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mono-data hard-shadow-sm border-2 border-foreground bg-primary px-4 py-2 text-xs font-semibold tracking-[0.2em] text-primary-foreground"
                    >
                      DETECTING MOVEMENT &amp; ANGLE…
                    </motion.span>
                  </div>
                </div>
              )}

              {/* pose overlay */}
              <PoseCanvas
                exercise={exercise}
                severity={latest?.severity ?? 'good'}
                active={
                  source === 'demo'
                    ? phase === 'live'
                    : poseTrackingEnabled &&
                      poseTracking.status !== 'error' &&
                      poseTracking.status !== 'ended'
                }
                mode={realTrackingMode ? 'landmarks' : 'synthetic'}
                pose={trackedPose}
                videoSize={videoSize}
                mirrored={source === 'camera' && CAMERA_VIDEO_MIRRORED}
              />

              {/* viewfinder furniture */}
              {phase === 'live' && (
                <>
                  {['left-3 top-3 border-l-2 border-t-2', 'right-3 top-3 border-r-2 border-t-2', 'bottom-3 left-3 border-b-2 border-l-2', 'bottom-3 right-3 border-b-2 border-r-2'].map(
                    (c) => (
                      <span key={c} className={`absolute h-6 w-6 border-primary ${c}`} />
                    ),
                  )}
                  <motion.span
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mono-data absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap border-2 border-foreground bg-background px-3 py-1 text-[10px] font-semibold tracking-[0.2em]"
                  >
                    {exercise?.name.toUpperCase()} — {angle?.toUpperCase()}
                  </motion.span>
                </>
              )}
            </div>

            {/* desktop chart */}
            <div className="hard-shadow-sm mt-6 hidden border-2 border-foreground bg-card lg:block">
              <div className="flex items-center gap-2 border-b-2 border-foreground px-4 py-2.5">
                <Activity className="h-4 w-4 text-primary" />
                <span className="mono-data text-[10px] font-semibold tracking-[0.25em]">
                  {realTrackingMode ? 'REAL SQUAT REP TEMPO' : 'REP TEMPO × FORM SCORE'}
                </span>
              </div>
              {chartEl}
            </div>
          </div>

          {/* ── Mobile stack ── */}
          <div className="mt-5 space-y-5 lg:hidden">
            {/* stats strip */}
            <div className="grid grid-cols-3 gap-3">
              {statTiles.map((s) => (
                <div key={s.label} className="hard-shadow-sm border-2 border-foreground bg-card p-2.5 text-center">
                  <motion.p
                    key={String(s.key)}
                    initial={{ scale: 1.3, color: '#FF4D00' }}
                    animate={{ scale: 1, color: s.accent ? '#FF4D00' : '#14110E' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    className="mono-data text-2xl font-semibold"
                  >
                    {s.value}
                  </motion.p>
                  <p className="mono-data mt-0.5 text-[8px] tracking-[0.25em] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* compact effort row */}
            <div className="hard-shadow-sm flex items-center justify-between border-2 border-foreground bg-card px-4 py-3">
              <div>
                <p className="mono-data flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.25em]">
                  <Flame className="h-4 w-4 text-primary" /> EFFORT
                </p>
                <motion.p
                  key={realTrackingMode ? 'unavailable' : zone.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mono-data mt-1 text-xs font-semibold tracking-[0.25em]"
                  style={{ color: realTrackingMode ? undefined : zone.color }}
                >
                  {realTrackingMode ? 'NOT AVAILABLE' : zone.label}
                </motion.p>
              </div>
              {realTrackingMode ? (
                <div className="mono-data flex h-[92px] w-[92px] items-center justify-center border-2 border-dashed border-foreground/30 text-2xl text-muted-foreground">
                  —
                </div>
              ) : (
                <EffortDial value={phase === 'live' || phase === 'ended' ? effort : 0} size={92} />
              )}
            </div>

            {/* compact detection */}
            <div className="hard-shadow-sm border-2 border-foreground bg-card">
              <div className="flex items-center gap-2 border-b-2 border-foreground px-4 py-2">
                <ScanFace className="h-4 w-4 text-primary" />
                <span className="mono-data text-[10px] font-semibold tracking-[0.25em]">DETECTION</span>
              </div>
              <div className="p-3">
                <AnimatePresence mode="wait">
                  {exercise ? (
                    <motion.div
                      key={exercise.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25 }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-serifit text-xl italic leading-none">{exercise.name}</span>
                          <span className="mono-data flex items-center gap-2 text-[10px]">
                            <span className="border-2 border-foreground bg-foreground px-1.5 py-0.5 tracking-widest text-background">
                              {realTrackingMode ? `${exercise.bestAngle.toUpperCase()} VIEW` : angle?.toUpperCase()}
                            </span>
                            <span className="border-2 border-foreground bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground">
                              {realTrackingMode
                                ? exercise.id === 'squat'
                                  ? `${Math.round(squatAnalysis.snapshot.trackingConfidence * 100)}% TRACKING`
                                  : 'UNSUPPORTED'
                                : `${confidence}%`}
                            </span>
                          </span>
                        </div>
                        {realTrackingMode && (
                          <p className="mt-2 text-xs text-muted-foreground">{analysisReadiness}</p>
                        )}
                      <Select value={exercise.id} onValueChange={overrideExercise}>
                        <SelectTrigger className="mt-3 h-10 w-full border-2 text-sm font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-2">
                          {EXERCISES.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </motion.div>
                  ) : (
                    realTrackingMode ? (
                      <motion.div key="select-real-exercise" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <p className="mono-data text-[9px] tracking-[0.2em] text-muted-foreground">
                          SELECT EXERCISE — REAL ANALYSIS SUPPORTS BACK SQUAT
                        </p>
                        <Select onValueChange={overrideExercise}>
                          <SelectTrigger className="mt-3 h-10 w-full border-2 text-sm font-semibold">
                            <SelectValue placeholder="Choose exercise" />
                          </SelectTrigger>
                          <SelectContent className="border-2">
                            {EXERCISES.map((e) => (
                              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </motion.div>
                    ) : (
                      <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mono-data text-[10px] tracking-[0.25em] text-muted-foreground">
                        {phase === 'analyzing' ? 'CLASSIFYING MOVEMENT…' : 'NO MOVEMENT DETECTED YET'}
                      </motion.p>
                    )
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* tabs: coaching / chart */}
            <div className="hard-shadow-sm border-2 border-foreground bg-card">
              <div className="grid grid-cols-2 border-b-2 border-foreground">
                {(
                  [
                    ['coach', MessagesSquare, 'COACHING'],
                    ['data', Activity, 'DATA'],
                  ] as const
                ).map(([id, Icon, label]) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`mono-data flex h-11 items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.25em] transition-colors ${
                      tab === id ? 'bg-foreground text-background' : 'bg-card text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
              {tab === 'coach' ? feedEl : chartEl}
            </div>
          </div>

          {/* ── Desktop right rail ── */}
          <div className="hidden flex-col gap-5 lg:flex">
            {/* detection card */}
            <div className="hard-shadow-sm border-2 border-foreground bg-card">
              <div className="flex items-center gap-2 border-b-2 border-foreground px-4 py-2.5">
                <ScanFace className="h-4 w-4 text-primary" />
                <span className="mono-data text-[10px] font-semibold tracking-[0.25em]">DETECTION</span>
              </div>
              <div className="space-y-3 p-4">
                <AnimatePresence mode="wait">
                  {exercise ? (
                    <motion.div
                      key={exercise.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25 }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-serifit text-2xl italic leading-none">{exercise.name}</span>
                        <span className="mono-data border-2 border-foreground bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          {realTrackingMode
                            ? exercise.id === 'squat'
                              ? `${Math.round(squatAnalysis.snapshot.trackingConfidence * 100)}% TRACKING`
                              : 'UNSUPPORTED'
                            : `${confidence}%`}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="mono-data flex items-center gap-1 border-2 border-foreground bg-foreground px-2 py-0.5 text-[10px] tracking-widest text-background">
                          <Video className="h-3 w-3" /> {realTrackingMode ? `${exercise.bestAngle.toUpperCase()} VIEW` : angle?.toUpperCase()}
                        </span>
                        {exercise.primaryMuscles.map((m) => (
                          <span key={m} className="mono-data border-2 border-foreground/30 px-2 py-0.5 text-[10px] tracking-widest text-muted-foreground">
                            {m.toUpperCase()}
                          </span>
                        ))}
                      </div>
                      {realTrackingMode && (
                        <p className="mt-3 text-xs text-muted-foreground">{analysisReadiness}</p>
                      )}
                      <div className="pt-3">
                        <p className="mono-data mb-1.5 text-[9px] tracking-[0.25em] text-muted-foreground">
                          WRONG LIFT? CORRECT IT:
                        </p>
                        <Select value={exercise.id} onValueChange={overrideExercise}>
                          <SelectTrigger className="h-9 w-full border-2 font-semibold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-2">
                            {EXERCISES.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </motion.div>
                  ) : (
                    realTrackingMode ? (
                      <motion.div key="select-real-exercise" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <p className="mono-data text-[9px] tracking-[0.2em] text-muted-foreground">
                          SELECT EXERCISE — REAL ANALYSIS SUPPORTS BACK SQUAT
                        </p>
                        <Select onValueChange={overrideExercise}>
                          <SelectTrigger className="mt-3 h-10 w-full border-2 font-semibold">
                            <SelectValue placeholder="Choose exercise" />
                          </SelectTrigger>
                          <SelectContent className="border-2">
                            {EXERCISES.map((e) => (
                              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </motion.div>
                    ) : (
                      <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mono-data text-[10px] tracking-[0.25em] text-muted-foreground">
                        {phase === 'analyzing' ? 'CLASSIFYING MOVEMENT…' : 'NO MOVEMENT DETECTED YET'}
                      </motion.p>
                    )
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* stats grid */}
            <div className="grid grid-cols-3 gap-3">
              {statTiles.map((s) => (
                <div key={s.label} className="hard-shadow-sm border-2 border-foreground bg-card p-3 text-center">
                  <motion.p
                    key={String(s.key)}
                    initial={{ scale: 1.3, color: '#FF4D00' }}
                    animate={{ scale: 1, color: s.accent ? '#FF4D00' : '#14110E' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    className="mono-data text-3xl font-semibold"
                  >
                    {s.value}
                  </motion.p>
                  <p className="mono-data mt-1 text-[9px] tracking-[0.25em] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* effort dial */}
            <div className="hard-shadow-sm border-2 border-foreground bg-card">
              <div className="flex items-center justify-between border-b-2 border-foreground px-4 py-2.5">
                <span className="mono-data flex items-center gap-2 text-[10px] font-semibold tracking-[0.25em]">
                  <Flame className="h-4 w-4 text-primary" /> EFFORT LEVEL
                </span>
                <motion.span
                  key={realTrackingMode ? 'unavailable' : zone.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mono-data text-[10px] font-semibold tracking-[0.25em]"
                  style={{ color: realTrackingMode ? undefined : zone.color }}
                >
                  {realTrackingMode ? 'NOT AVAILABLE' : zone.label}
                </motion.span>
              </div>
              <div className="flex items-center justify-around gap-4 p-5">
                {realTrackingMode ? (
                  <div className="mono-data flex h-[150px] w-[150px] items-center justify-center border-2 border-dashed border-foreground/30 text-4xl text-muted-foreground">
                    —
                  </div>
                ) : (
                  <EffortDial value={phase === 'live' || phase === 'ended' ? effort : 0} size={150} />
                )}
                <p className="mono-data max-w-[130px] text-[9px] leading-relaxed tracking-[0.15em] text-muted-foreground">
                  {realTrackingMode
                    ? 'POSE LANDMARKS DO NOT PROVIDE A DEFENSIBLE EFFORT ESTIMATE'
                    : 'FUSED FROM REP COUNT, REP-SPEED DECAY & FACIAL STRAIN CUES'}
                </p>
              </div>
            </div>

            {/* live coaching feed */}
            <div className="hard-shadow-sm flex-1 border-2 border-foreground bg-card">
              <div className="flex items-center gap-2 border-b-2 border-foreground px-4 py-2.5">
                <Timer className="h-4 w-4 text-primary" />
                <span className="mono-data text-[10px] font-semibold tracking-[0.25em]">LIVE COACHING</span>
              </div>
              {feedEl}
            </div>
          </div>
        </div>
      </main>

      {/* mobile sticky action bar while a set is live */}
      <AnimatePresence>
        {phase === 'live' && (
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-foreground bg-background lg:hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="mono-data flex items-center gap-2 text-xs font-semibold tracking-[0.15em]">
                <span className="blink-rec inline-block h-2.5 w-2.5 rounded-full bg-primary" />
                REC {mm}:{ss}
              </span>
              <Button
                onClick={endSession}
                className="hard-shadow-sm h-11 border-2 border-foreground bg-destructive px-6 font-bold text-destructive-foreground"
              >
                <CircleStop className="mr-1.5 h-4 w-4" /> END SET
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary dialog */}
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="hard-shadow max-h-[90dvh] overflow-y-auto border-2 border-foreground bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serifit text-2xl italic">
              Set summary — {exercise?.name}
            </DialogTitle>
            <DialogDescription className="mono-data text-[10px] tracking-[0.25em]">
              {realTrackingMode
                ? `${exercise?.bestAngle.toUpperCase() ?? 'SIDE'} VIEW — REAL POSE ANALYSIS`
                : `${mm}:${ss} — ${angle?.toUpperCase()} VIEW — SIMULATED ANALYSIS`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(realTrackingMode
              ? [
                  { label: 'REPS', value: realReps.length },
                  { label: 'AVG TEMPO', value: realAverageTempo === null ? '—' : `${realAverageTempo.toFixed(1)}s` },
                  { label: 'DEPTH OBSERVED', value: realReps.filter((rep) => rep.depth === 'reached').length },
                  { label: 'OBSERVATIONS', value: realObservationCount },
                ]
              : [
                  { label: 'REPS', value: reps.length },
                  { label: 'AVG FORM', value: avgForm || '—' },
                  { label: 'PEAK EFFORT', value: reps.length ? Math.max(...reps.map((r) => r.effort)) : '—' },
                  {
                    label: 'AVG TEMPO',
                    value: reps.length ? `${(reps.reduce((a, r) => a + r.tempo, 0) / reps.length).toFixed(1)}s` : '—',
                  },
                ]).map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="hard-shadow-sm border-2 border-foreground bg-background p-3 text-center"
              >
                <p className="mono-data text-2xl font-semibold text-primary">{s.value}</p>
                <p className="mono-data mt-1 text-[8px] tracking-[0.25em] text-muted-foreground">{s.label}</p>
              </motion.div>
            ))}
          </div>
          <div className="border-2 border-foreground bg-primary/10 p-4">
            <p className="mono-data text-[10px] font-semibold tracking-[0.25em] text-primary">COACH'S NOTE</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">
              {realTrackingMode
                ? realReps.length
                  ? 'This summary contains only completed rep timing, observed depth, and the analyzer’s evidence-based observations.'
                  : 'No complete squat reps were recorded with sufficient side-view evidence.'
                : avgForm >= 80
                  ? 'Strong set. Technique held up under fatigue — keep this load or add a little next time.'
                  : avgForm >= 65
                    ? 'Solid work, but form slipped as fatigue built. Consider dropping 5–10% and owning every rep.'
                    : reps.length
                      ? 'Form broke down early. Lighter load, slower tempo, and film from the side for cleaner tracking.'
                      : 'No reps recorded — start a set to get a full breakdown.'}
            </p>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" className="hard-shadow-sm h-12 border-2 font-bold sm:h-10" onClick={reset}>
              NEW SESSION
            </Button>
            <Button className="hard-shadow-sm h-12 border-2 border-foreground bg-foreground font-bold text-background hover:bg-foreground/90 sm:h-10" onClick={() => setSummaryOpen(false)}>
              REVIEW FOOTAGE
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
