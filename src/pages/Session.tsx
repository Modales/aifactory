import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { SubjectTracker } from '@/lib/pose/subjectTracker'
import { RealtimeRepCounter } from '@/lib/pose/repCounter'
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
  WifiOff,
  Zap,
  RefreshCw,
} from 'lucide-react'
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
import VelocityAngleChart from '@/components/VelocityAngleChart'
import ExerciseSummaryTable from '@/components/ExerciseSummaryTable'
import SettingsModal from '@/components/SettingsModal'
import { audioEngine } from '@/lib/audioEngine'
import { saveSessionToHistory } from '@/lib/workoutStore'
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
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(EXERCISES[0].id)
  const [angle, setAngle] = useState<CameraAngle | null>(null)
  const [confidence, setConfidence] = useState(0)
  const [reps, setReps] = useState<RepData[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryTab, setSummaryTab] = useState<'table' | 'graphs'>('table')
  const [tab, setTab] = useState<MobileTab>('coach')
  const [countdownVal, setCountdownVal] = useState<number>(3)
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine)

  const repTimerRef = useRef<number | null>(null)
  const clockRef = useRef<number | null>(null)
  const countdownTimerRef = useRef<number | null>(null)
  const feedIdRef = useRef(0)
  const repsRef = useRef<RepData[]>([])
  const angleRef = useRef<CameraAngle | null>(null)

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
    (phase === 'media' || phase === 'live' || phase === 'countdown') &&
    (mediaStatus === 'ready' || mediaStatus === 'paused' || mediaStatus === 'ended')
  const poseTracking = usePoseTracking({
    active: poseTrackingEnabled,
    lifecycleKey: mediaLifecycleKey,
    video: videoElement,
  })
  const stopPoseTracking = poseTracking.stop
  const subjectTrackerRef = useRef(new SubjectTracker())
  const repCounterRef = useRef(new RealtimeRepCounter())
  const detectedPosesCount = poseTracking.latestResult?.poses.length ?? 0

  // Reset subject tracker lock when media source or lifecycle changes
  useEffect(() => {
    subjectTrackerRef.current.reset()
    repCounterRef.current.reset()
  }, [mediaLifecycleKey, source])

  const trackedSelection = useMemo(() => {
    const poses = poseTracking.latestResult?.poses
    if (!poses || poses.length === 0) return { selectedPose: null, selectedIndex: -1 }
    const timestamp = poseTracking.latestResult?.timestampMs ?? Date.now()
    return subjectTrackerRef.current.selectPrimarySubject(poses, timestamp)
  }, [poseTracking.latestResult])

  const trackedPose = trackedSelection.selectedPose

  const pushFeed = useCallback((message: string, severity: FeedItem['severity']) => {
    setFeed((f) => [{ id: feedIdRef.current++, time: now(), message, severity }, ...f].slice(0, 40))
  }, [])

  const handleVideoCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (phase !== 'media' && phase !== 'live') return
      const poses = poseTracking.latestResult?.poses
      if (!poses || poses.length === 0) return

      const rect = e.currentTarget.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height

      const selected = subjectTrackerRef.current.selectPoseByTapPoint(
        { x, y },
        poses,
        poseTracking.latestResult?.timestampMs ?? Date.now(),
      )
      if (selected) {
        pushFeed('Target locked onto clicked athlete on video screen', 'good')
      }
    },
    [phase, poseTracking.latestResult, pushFeed],
  )

  // Real-time pose rep counting from video keypoints
  useEffect(() => {
    if (!trackedPose || !exercise) return
    if (phase !== 'live' && phase !== 'media') return

    const timestamp = poseTracking.latestResult?.timestampMs ?? Date.now()
    const aspectRatio = videoSize && videoSize.height > 0 ? videoSize.width / videoSize.height : 1.0
    const newRep = repCounterRef.current.processFrame(
      trackedPose,
      exercise,
      repsRef.current.length,
      timestamp,
      aspectRatio,
    )

    if (newRep) {
      repsRef.current = [...repsRef.current, newRep]
      setReps([...repsRef.current])
      pushFeed(`Rep #${newRep.rep} complete — ${newRep.cue}`, newRep.severity)
      audioEngine.playTone(newRep.severity === 'crit' ? 'crit' : newRep.severity === 'warn' ? 'warn' : 'rep')
      audioEngine.speakCue(newRep.cue, newRep.severity === 'crit')
    }
  }, [trackedPose, exercise, phase, poseTracking.latestResult, pushFeed])

  // Network online/offline event monitoring
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const clearTimers = useCallback(() => {
    if (repTimerRef.current) window.clearTimeout(repTimerRef.current)
    if (clockRef.current) window.clearInterval(clockRef.current)
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current)
    repTimerRef.current = null
    clockRef.current = null
    countdownTimerRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      clearTimers()
      audioEngine.cancelAll()
    }
  }, [clearTimers])

  const scheduleNextRep = useCallback(
    (ex: ExerciseDef) => {
      const nextIndex = repsRef.current.length + 1
      const prev = repsRef.current[repsRef.current.length - 1]
      const delay = prev ? prev.tempo * 1000 : ex.baseTempo * 1000
      repTimerRef.current = window.setTimeout(() => {
        const rep = simulateRep(nextIndex, ex)
        repsRef.current = [...repsRef.current, rep]
        setReps(repsRef.current)
        pushFeed(rep.cue, rep.severity)

        // Audio HUD feedback trigger
        audioEngine.playTone(rep.severity === 'crit' ? 'crit' : rep.severity === 'warn' ? 'warn' : 'rep')
        audioEngine.speakCue(rep.cue, rep.severity === 'crit')

        if (rep.effort >= 85) {
          pushFeed(`Effort at ${rep.effort}% — velocity decay & form degradation detected`, 'info')
        }

        scheduleNextRep(ex)
      }, delay)
    },
    [pushFeed],
  )

  const startLiveSet = useCallback(
    (ex: ExerciseDef) => {
      setPhase('live')
      pushFeed(
        `Movement locked: ${ex.name}. Best viewing angle locked — ${ex.keyJoint.toLowerCase()} angle tracked.`,
        'info',
      )
      pushFeed('Set started — rep counting live', 'info')
      audioEngine.playTone('go')
      clockRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000)
      if (demoActive) {
        scheduleNextRep(ex)
      }
    },
    [pushFeed, scheduleNextRep, demoActive],
  )

  const startCountdown = useCallback(
    (ex: ExerciseDef) => {
      setPhase('countdown')
      setCountdownVal(3)
      audioEngine.playTone('start')
      let current = 3

      countdownTimerRef.current = window.setInterval(() => {
        current -= 1
        if (current > 0) {
          setCountdownVal(current)
          audioEngine.playTone('start')
        } else {
          if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current)
          startLiveSet(ex)
        }
      }, 1000)
    },
    [startLiveSet],
  )

  const beginAnalysis = useCallback(
    (picked?: ExerciseDef) => {
      const selected = EXERCISES.find((e) => e.id === selectedExerciseId)
      const ex = picked ?? selected ?? exercise ?? EXERCISES[0]
      setPhase('analyzing')
      pushFeed('Pose model initializing — tracking keypoints…', 'info')

      window.setTimeout(() => {
        setExercise(ex)
        const a = angleForExercise(ex)
        angleRef.current = a
        setAngle(a)
        setConfidence(92 + Math.floor(Math.random() * 6))
        startCountdown(ex)
      }, 2200)
    },
    [selectedExerciseId, exercise, pushFeed, startCountdown],
  )

  const clearAnalysisData = useCallback(() => {
    clearTimers()
    audioEngine.cancelAll()
    repsRef.current = []
    angleRef.current = null
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
    const selected = EXERCISES.find((e) => e.id === selectedExerciseId) || EXERCISES[0]
    setExercise(selected)
    setAngle(angleForExercise(selected))
    setConfidence(94)
    setPhase('media')
    void openCamera()
  }

  const startUpload = (file: File) => {
    stopPoseTracking()
    clearAnalysisData()
    setDemoActive(false)
    const selected = EXERCISES.find((e) => e.id === selectedExerciseId) || EXERCISES[0]
    setExercise(selected)
    setAngle(angleForExercise(selected))
    setConfidence(94)
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

  // Hackathon URL flag support: /session?demo=1
  const autoDemoRef = useRef(false)
  useEffect(() => {
    if (autoDemoRef.current) return
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      autoDemoRef.current = true
      startDemo()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const endSession = () => {
    stopPoseTracking()
    clearTimers()
    audioEngine.cancelAll()
    setPhase('ended')
    setSummaryOpen(true)

    // Save session to localStorage history
    if (exercise && repsRef.current.length > 0) {
      const avgForm = Math.round(repsRef.current.reduce((a, r) => a + r.formScore, 0) / repsRef.current.length)
      const peakEffort = Math.max(...repsRef.current.map((r) => r.effort))
      saveSessionToHistory({
        exerciseName: exercise.name,
        exerciseId: exercise.id,
        cameraAngle: angle || exercise.bestAngle,
        durationSeconds: elapsed,
        totalReps: repsRef.current.length,
        avgFormScore: avgForm,
        peakEffort,
        reps: repsRef.current,
      })
    }
  }

  const reset = () => {
    stopPoseTracking()
    clearAnalysisData()
    resetMedia()
    setPhase('setup')
    setDemoActive(false)
    setTab('coach')
  }

  const currentExDef = EXERCISES.find((e) => e.id === selectedExerciseId) || EXERCISES[0]
  const rec = currentExDef.recommendation

  const latest = reps[reps.length - 1]
  const avgForm = reps.length ? Math.round(reps.reduce((a, r) => a + r.formScore, 0) / reps.length) : 0
  const effort = latest?.effort ?? 0
  const zone = zoneFor(effort)
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

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
      ? 'Real browser pose landmarks are being tracked. Fitness metrics begin in Checkpoint 8.'
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
      value: reps.length,
      key: reps.length,
      accent: true,
    },
    {
      label: 'S / REP',
      value: latest ? `${latest.tempo.toFixed(1)}s` : '—',
      key: latest?.tempo ?? 0,
      accent: false,
    },
    {
      label: 'FORM',
      value: avgForm ? `${avgForm}%` : '—',
      key: avgForm,
      accent: false,
    },
  ]

  const chartEl = (
    <div className="p-3">
      {reps.length > 0 ? (
        <VelocityAngleChart reps={reps} targetAngle={exercise?.id === 'squat' ? 110 : 90} />
      ) : (
        <div className="flex h-48 items-center justify-center lg:h-64">
          <p className="mono-data text-[10px] tracking-[0.25em] text-muted-foreground">
            PERFORM REPS IN FRONT OF CAMERA OR PLAY VIDEO TO GENERATE CHART
          </p>
        </div>
      )}
    </div>
  )

  const feedEl = (
    <div className="max-h-64 overflow-y-auto p-3 lg:max-h-72">
      {feed.length === 0 ? (
        <p className="mono-data p-2 text-[10px] tracking-[0.25em] text-muted-foreground">
          {realTrackingMode ? 'REAL-TIME COACHING BEGINS IN CHECKPOINT 8' : 'CUES LAND HERE MID-SET'}
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
            {isOffline && (
              <span className="mono-data border-2 border-amber-600 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-700 tracking-[0.15em] flex items-center gap-1">
                <WifiOff className="h-3 w-3" /> OFFLINE EDGE MODE
              </span>
            )}
            {source && phase !== 'setup' && (
              <span className="mono-data hidden border-2 border-foreground bg-secondary px-2 py-0.5 text-[9px] font-semibold tracking-[0.25em] sm:inline-block">
                {source === 'demo' ? 'SIMULATED ANALYSIS' : 'REAL POSE TRACKING'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/history">
              <Button size="sm" variant="outline" className="border-2 border-foreground font-mono text-xs font-bold">
                PAST WORKOUTS
              </Button>
            </Link>
            <SettingsModal />
            {phase === 'ended' && !summaryOpen && (
              <Button
                size="sm"
                onClick={() => setSummaryOpen(true)}
                className="hard-shadow-sm border-2 border-foreground bg-primary text-primary-foreground font-mono text-xs font-bold"
              >
                REOPEN SUMMARY
              </Button>
            )}
            {phase === 'live' && (
              <div className="hidden items-center gap-4 lg:flex">
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
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4 lg:py-6">
        <div className="lg:grid lg:grid-cols-3 lg:gap-6">
          {/* Video panel */}
          <div className="lg:col-span-2">
            <div
              onClick={handleVideoCanvasClick}
              className={`hard-shadow relative border-2 border-foreground bg-black cursor-pointer overflow-hidden ${
                phase === 'setup'
                  ? 'min-h-[520px]'
                  : videoSize && videoSize.height > videoSize.width
                    ? 'aspect-[9/16] max-h-[75vh] mx-auto'
                    : 'aspect-[4/5] sm:aspect-video'
              }`}
            >
              {realTrackingMode && (phase === 'media' || phase === 'live') && (
                <div
                  onClick={handleVideoCanvasClick}
                  className="absolute inset-0 z-25 cursor-pointer"
                  title="Click anywhere on screen to lock target athlete"
                />
              )}
              {detectedPosesCount > 1 && (phase === 'media' || phase === 'live') && (
                <div className="mono-data absolute bottom-4 left-4 z-30 pointer-events-none flex items-center gap-1.5 border-2 border-foreground bg-background/95 px-3 py-1.5 text-[10px] font-bold tracking-wider text-foreground hard-shadow-sm backdrop-blur">
                  <ScanFace className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>CLICK OR TAP ANY ATHLETE ON SCREEN TO LOCK TARGET</span>
                </div>
              )}
              {realTrackingMode && (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  controls={source === 'upload'}
                  className="h-full w-full object-contain bg-black"
                />
              )}
              {source === 'demo' && <div className="bg-grid absolute inset-0 bg-background" />}

              {/* Pre-workout Setup Overlay (Completely Visible, Unclipped Buttons) */}
              {phase === 'setup' && (
                <div className="bg-grid absolute inset-0 flex flex-col items-center justify-between p-4 sm:p-5 text-center z-10 bg-background/95 backdrop-blur-sm">
                  <div>
                    <p className="mono-data text-[10px] tracking-[0.3em] text-primary font-bold">WORKOUT SETUP</p>
                    <h1 className="mt-0.5 text-xl sm:text-2xl font-bold uppercase tracking-tight">
                      Configure your <span className="font-serifit normal-case italic text-primary">set</span>
                    </h1>
                  </div>

                  {/* AI Camera Guidance Box & 3D Preview Window */}
                  <div className="w-full max-w-md space-y-2.5 border-2 border-foreground bg-card p-3.5 sm:p-4 hard-shadow-sm text-left">
                    <div>
                      <label className="mono-data block text-[10px] font-bold tracking-wider text-primary mb-1">
                        SELECT EXERCISE
                      </label>
                      <Select value={selectedExerciseId} onValueChange={setSelectedExerciseId}>
                        <SelectTrigger className="h-9 w-full border-2 font-mono text-xs font-semibold bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-2 font-mono text-xs">
                          {EXERCISES.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name} ({e.primaryMuscles[0]})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="border-2 border-foreground/20 bg-background p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="mono-data text-[10px] font-bold tracking-wider text-primary flex items-center gap-1.5">
                          <Camera className="h-3.5 w-3.5" /> AI RECOMMENDED PLACEMENT
                        </span>
                        <span className="mono-data border border-foreground bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                          {rec.recommendedCamera.toUpperCase()} VIEW
                        </span>
                      </div>

                      {/* 3D Pose Canvas Animation Preview Window */}
                      <div className="relative h-28 w-full overflow-hidden border-2 border-foreground bg-card shadow-inner">
                        <div className="bg-grid absolute inset-0" />
                        <PoseCanvas
                          exercise={currentExDef}
                          angle={rec.recommendedCamera}
                          severity="good"
                          active={true}
                        />
                      </div>

                      <div className="mono-data text-[9px] font-bold text-muted-foreground tracking-wider">
                        PREVIEW: <span className="text-foreground">{rec.recommendedCamera.toUpperCase()} PERSPECTIVE</span>
                      </div>

                      <p className="text-[11px] font-semibold text-foreground">
                        Position camera in a <span className="text-primary font-bold">{rec.recommendedCamera} View</span> approx <span className="font-bold">{rec.recommendedDistance}</span> away.
                      </p>
                      <div className="text-[9px] text-muted-foreground space-y-0.5 font-mono">
                        <p><strong>Framing:</strong> {rec.framingGuidance}</p>
                        <p><strong>Note:</strong> {rec.setupNotes}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
                    <Button
                      size="sm"
                      className="hard-shadow-sm h-10 flex-1 border-2 border-foreground text-xs font-bold transition-transform hover:-translate-y-0.5"
                      onClick={startCamera}
                    >
                      <Camera className="mr-1.5 h-4 w-4" /> START CAMERA
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="hard-shadow-sm h-10 flex-1 border-2 border-foreground bg-card text-xs font-bold transition-transform hover:-translate-y-0.5"
                      asChild
                    >
                      <label className="cursor-pointer">
                        <Upload className="mr-1.5 h-4 w-4" /> UPLOAD VIDEO
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
                      size="sm"
                      variant="outline"
                      className="hard-shadow-sm h-10 flex-1 border-2 border-foreground bg-foreground text-xs font-bold text-background transition-transform hover:-translate-y-0.5 hover:bg-foreground"
                      onClick={startDemo}
                    >
                      <Zap className="mr-1.5 h-4 w-4" /> DEMO MODE
                    </Button>
                  </div>

                  {trackingErrorMessage && (
                    <div className="flex flex-col gap-1 max-w-sm border-2 border-amber-600 bg-amber-50 p-2 text-left text-[10px] text-amber-950">
                      <div className="flex items-center gap-1.5 font-bold">
                        <TriangleAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" /> CAMERA DIAGNOSTIC
                      </div>
                      <p>{trackingErrorMessage}</p>
                      <div className="flex gap-2 pt-0.5">
                        <Button size="sm" variant="outline" className="h-7 border border-amber-800 text-[10px] font-bold" onClick={startCamera}>
                          <RefreshCw className="mr-1 h-3 w-3" /> RETRY
                        </Button>
                        <Button size="sm" className="h-7 border border-amber-800 bg-amber-600 text-white text-[10px] font-bold" onClick={startDemo}>
                          <Zap className="mr-1 h-3 w-3" /> DEMO MODE
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Media-phase tracking status overlay */}
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
                        <Button size="sm" className="border-2 border-foreground bg-primary font-bold text-primary-foreground hover:bg-primary/90" onClick={() => beginAnalysis(exercise || undefined)}>
                          <Zap className="mr-1.5 h-4 w-4" /> START TRACKING &amp; REPS
                        </Button>
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
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Analyzing Overlay */}
              {phase === 'analyzing' && (
                <div className="absolute inset-0 z-10">
                  <div className="scanline" />
                  <div className="absolute inset-x-0 bottom-6 flex justify-center">
                    <motion.span
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mono-data hard-shadow-sm border-2 border-foreground bg-primary px-4 py-2 text-xs font-semibold tracking-[0.2em] text-primary-foreground"
                    >
                      INITIALIZING MODEL &amp; ALIGNING ANGLE…
                    </motion.span>
                  </div>
                </div>
              )}

              {/* 3-2-1 Countdown Overlay */}
              {phase === 'countdown' && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                  <p className="mono-data text-xs tracking-[0.3em] font-bold text-primary mb-2">GET IN POSITION</p>
                  <motion.div
                    key={countdownVal}
                    initial={{ scale: 2.2, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 20 }}
                    className="mono-data border-4 border-foreground bg-primary px-8 py-4 text-6xl font-black text-primary-foreground hard-shadow"
                  >
                    {countdownVal}
                  </motion.div>
                </div>
              )}

              {/* Pose Overlay */}
              <PoseCanvas
                exercise={phase === 'setup' ? currentExDef : exercise}
                severity={latest?.severity ?? 'good'}
                active={
                  phase === 'setup'
                    ? true
                    : source === 'demo'
                      ? phase === 'live'
                      : poseTrackingEnabled &&
                        poseTracking.status !== 'error' &&
                        poseTracking.status !== 'ended'
                }
                angle={phase === 'setup' ? rec.recommendedCamera : angle}
                mode={realTrackingMode ? 'landmarks' : 'synthetic'}
                pose={trackedPose}
                videoSize={videoSize}
                mirrored={source === 'camera' && CAMERA_VIDEO_MIRRORED}
              />

              {/* Realtime Developer Debug Panel & Telemetry Inspector */}
              {realTrackingMode && (phase === 'live' || phase === 'media') && (
                <div className="absolute left-3 top-3 z-30 flex max-w-sm flex-col gap-1 border-2 border-foreground bg-background/95 p-3 font-mono text-[9px] text-foreground hard-shadow-sm backdrop-blur">
                  <div className="flex items-center justify-between border-b-2 border-foreground/30 pb-1.5 font-bold text-primary">
                    <span className="flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5 text-primary" /> POSE DETECTOR DEBUGGER
                    </span>
                    <span className="border border-foreground bg-primary/20 px-1 text-[8px]">
                      FRAME #{repCounterRef.current.getDebugState().frameNumber}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 text-[9px]">
                    <div>EXERCISE: <span className="font-bold text-primary">{exercise?.name.toUpperCase()}</span></div>
                    <div>ARMED: <span className={repCounterRef.current.getDebugState().isArmed ? 'font-bold text-emerald-600' : 'font-bold text-amber-600'}>{repCounterRef.current.getDebugState().isArmed ? 'YES (ARMED)' : 'NO (DISARMED)'}</span></div>

                    <div>STATE: <span className="font-bold text-emerald-600">{repCounterRef.current.getDebugState().currentState}</span></div>
                    <div>PREV STATE: <span className="text-muted-foreground">{repCounterRef.current.getDebugState().previousState}</span></div>

                    <div>RAW ANGLE: <span className="font-bold text-foreground">{repCounterRef.current.getDebugState().rawAngle ? `${repCounterRef.current.getDebugState().rawAngle}°` : '—'}</span></div>
                    <div>SMOOTHED: <span className="font-bold text-emerald-600">{repCounterRef.current.getDebugState().smoothedAngle ? `${repCounterRef.current.getDebugState().smoothedAngle}°` : '—'}</span></div>

                    <div>TOP REF: <span className="font-bold">{repCounterRef.current.getDebugState().topAngle}°</span></div>
                    <div>BOTTOM THRESH: <span className="font-bold">{repCounterRef.current.getDebugState().bottomThreshold}°</span></div>

                    <div>REPS COUNTED: <span className="font-bold text-primary text-xs">{reps.length}</span></div>
                    <div>CONFIDENCE: <span className="font-bold text-foreground">{confidence}%</span></div>
                  </div>

                  <div className="mt-1 border-t border-foreground/20 pt-1 text-[8px]">
                    <div className="font-bold text-amber-700">LAST REASON:</div>
                    <div className="text-foreground">{repCounterRef.current.getDebugState().lastTransitionReason}</div>
                  </div>

                  <div className="border-t border-foreground/20 pt-1 text-[8px]">
                    <div className="font-bold text-muted-foreground">LAST FAILED BLOCKER:</div>
                    <div className="text-amber-800">{repCounterRef.current.getDebugState().lastFailedCondition}</div>
                  </div>

                  {/* Transition History Log Stream */}
                  <div className="mt-1 border-t border-foreground/20 pt-1">
                    <div className="font-bold text-[8px] text-primary mb-0.5">TRANSITION HISTORY:</div>
                    <div className="max-h-20 overflow-y-auto space-y-0.5 text-[8px]">
                      {repCounterRef.current.getDebugState().recentLogs.map((log, idx) => (
                        <div key={idx} className="border-l-2 border-primary pl-1 text-[8px]">
                          <span className="text-muted-foreground">F#{log.frameNumber}</span> {log.previousState} &rarr; <span className="font-bold text-emerald-700">{log.newState}</span> ({log.smoothedAngle}°)
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Viewfinder Overlay Furniture */}
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
                    {exercise?.name.toUpperCase()} — {angle?.toUpperCase()} VIEW
                  </motion.span>
                </>
              )}
            </div>

            {/* Desktop Dynamic Analytics Chart */}
            <div className="hard-shadow-sm mt-6 hidden border-2 border-foreground bg-card lg:block">
              <div className="flex items-center gap-2 border-b-2 border-foreground px-4 py-2.5">
                <Activity className="h-4 w-4 text-primary" />
                <span className="mono-data text-[10px] font-semibold tracking-[0.25em]">
                  REAL-TIME TELEMETRY × VELOCITY DECAY
                </span>
              </div>
              {chartEl}
            </div>
          </div>

          {/* Mobile Stack */}
          <div className="mt-5 space-y-5 lg:hidden">
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

            {/* Mobile Detection Badge */}
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
                            {angle?.toUpperCase()}
                          </span>
                          <span className="border-2 border-foreground bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground">
                            {confidence}%
                          </span>
                        </span>
                      </div>
                      <div className="pt-2">
                        <p className="mono-data mb-1 text-[9px] tracking-[0.25em] text-muted-foreground flex items-center gap-1">
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> SESSION LOCKED
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.p
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mono-data text-[10px] tracking-[0.25em] text-muted-foreground"
                    >
                      {realTrackingMode
                        ? 'EXERCISE ANALYTICS BEGIN IN CHECKPOINT 8'
                        : phase === 'analyzing'
                          ? 'CLASSIFYING MOVEMENT…'
                          : 'NO MOVEMENT DETECTED YET'}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>

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

          {/* Desktop Right Rail */}
          <div className="hidden flex-col gap-5 lg:flex">
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
                          {confidence}%
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="mono-data flex items-center gap-1 border-2 border-foreground bg-foreground px-2 py-0.5 text-[10px] tracking-widest text-background">
                          <Video className="h-3 w-3" /> {angle?.toUpperCase()}
                        </span>
                        {exercise.primaryMuscles.map((m) => (
                          <span key={m} className="mono-data border-2 border-foreground/30 px-2 py-0.5 text-[10px] tracking-widest text-muted-foreground">
                            {m.toUpperCase()}
                          </span>
                        ))}
                      </div>
                      <div className="pt-2">
                        <p className="mono-data mb-1 text-[9px] tracking-[0.25em] text-muted-foreground flex items-center gap-1">
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> SESSION LOCKED
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Exercise &amp; camera angle are locked for this set to preserve telemetry integrity.
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.p
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mono-data text-[10px] tracking-[0.25em] text-muted-foreground"
                    >
                      {realTrackingMode
                        ? 'EXERCISE ANALYTICS BEGIN IN CHECKPOINT 8'
                        : phase === 'analyzing'
                          ? 'CLASSIFYING MOVEMENT…'
                          : 'NO MOVEMENT DETECTED YET'}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>

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
                    ? 'EFFORT ESTIMATION BEGINS IN CHECKPOINT 8'
                    : 'FUSED FROM REP COUNT, REP-SPEED DECAY & FORM DEGRADATION'}
                </p>
              </div>
            </div>

            <div className="hard-shadow-sm flex-1 border-2 border-foreground bg-card">
              <div className="flex items-center gap-2 border-b-2 border-foreground px-4 py-2.5">
                <Timer className="h-4 w-4 text-primary" />
                <span className="mono-data text-[10px] font-semibold tracking-[0.25em]">LIVE COACHING FEED</span>
              </div>
              {feedEl}
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Sticky Action Bar */}
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

      {/* Summary Dialog with ExerciseSummaryTable & VelocityAngleChart Tabs */}
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="hard-shadow max-h-[92dvh] overflow-y-auto border-2 border-foreground bg-card sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serifit text-2xl italic">
              Set summary — {exercise?.name}
            </DialogTitle>
            <DialogDescription className="mono-data text-[10px] tracking-[0.25em]">
              {mm}:{ss} — {angle?.toUpperCase()} VIEW — TELEMETRY BREAKDOWN
            </DialogDescription>
          </DialogHeader>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'TOTAL REPS', value: reps.length },
              { label: 'AVG FORM', value: avgForm || '—' },
              { label: 'PEAK EFFORT', value: reps.length ? Math.max(...reps.map((r) => r.effort)) : '—' },
              {
                label: 'AVG TEMPO',
                value: reps.length ? `${(reps.reduce((a, r) => a + r.tempo, 0) / reps.length).toFixed(1)}s` : '—',
              },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="hard-shadow-sm border-2 border-foreground bg-background p-3 text-center"
              >
                <p className="mono-data text-2xl font-semibold text-primary">{s.value}</p>
                <p className="mono-data mt-1 text-[8px] tracking-[0.25em] text-muted-foreground">{s.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Coach's Note Box */}
          <div className="border-2 border-foreground bg-primary/10 p-4">
            <p className="mono-data text-[10px] font-semibold tracking-[0.25em] text-primary">COACH'S BIOMECHANICAL ASSESSMENT</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">
              {avgForm >= 80
                ? 'Excellent set execution. Joint kinematics and bar velocity held up under fatigue — keep this load or progress slightly.'
                : avgForm >= 65
                  ? 'Solid effort, but form degraded during later reps. Consider lowering load by 5–10% to maintain knee and spinal alignment.'
                  : reps.length
                    ? 'Technique broke down early under load. Focus on tempo control and review side-view angle telemetry for correction.'
                    : 'No reps recorded for this session.'}
            </p>
          </div>

          {/* Summary Tab Switcher: Summary Table vs Performance Graphs */}
          <div className="space-y-3">
            <div className="flex border-b-2 border-foreground">
              <button
                type="button"
                onClick={() => setSummaryTab('table')}
                className={`mono-data flex-1 py-2 text-[10px] font-bold tracking-[0.2em] transition-colors ${
                  summaryTab === 'table' ? 'border-b-2 border-primary bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'
                }`}
              >
                REP SUMMARY TABLE
              </button>
              <button
                type="button"
                onClick={() => setSummaryTab('graphs')}
                className={`mono-data flex-1 py-2 text-[10px] font-bold tracking-[0.2em] transition-colors ${
                  summaryTab === 'graphs' ? 'border-b-2 border-primary bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'
                }`}
              >
                VELOCITY &amp; ANGLE CHARTS
              </button>
            </div>

            {summaryTab === 'table' ? (
              <ExerciseSummaryTable reps={reps} />
            ) : (
              <div className="border-2 border-foreground bg-background p-3">
                <VelocityAngleChart reps={reps} targetAngle={exercise?.id === 'squat' ? 110 : 90} />
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end pt-2">
            <Button variant="outline" className="hard-shadow-sm h-11 border-2 font-bold" onClick={reset}>
              NEW SET
            </Button>
            <Button
              className="hard-shadow-sm h-11 border-2 border-foreground bg-foreground font-bold text-background hover:bg-foreground/90"
              onClick={() => setSummaryOpen(false)}
            >
              CLOSE &amp; REVIEW
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
