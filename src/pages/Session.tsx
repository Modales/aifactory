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
  RefreshCw,
  ScanFace,
  Timer,
  TriangleAlert,
  Upload,
  Video,
  WifiOff,
  Zap,
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
import VelocityAngleChart from '@/components/VelocityAngleChart'
import ExerciseSummaryTable from '@/components/ExerciseSummaryTable'
import SettingsModal from '@/components/SettingsModal'
import { audioEngine } from '@/lib/audioEngine'
import { saveSessionToHistory } from '@/lib/workoutStore'
import {
  EXERCISES,
  angleForExercise,
  nextAngle,
  simulateRep,
  type CameraAngle,
  type ExerciseDef,
  type FeedItem,
  type RepData,
  type SessionPhase,
} from '@/lib/simulation'

type Source = 'camera' | 'upload' | 'demo' | null
type MobileTab = 'coach' | 'data'

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
  const [phase, setPhase] = useState<SessionPhase>('setup')
  const [source, setSource] = useState<Source>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
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

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const repTimerRef = useRef<number | null>(null)
  const clockRef = useRef<number | null>(null)
  const countdownTimerRef = useRef<number | null>(null)
  const feedIdRef = useRef(0)
  const repsRef = useRef<RepData[]>([])
  const angleRef = useRef<CameraAngle | null>(null)

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

  const pushFeed = useCallback((message: string, severity: FeedItem['severity']) => {
    setFeed((f) => [{ id: feedIdRef.current++, time: now(), message, severity }, ...f].slice(0, 40))
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
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
      stopCamera()
      audioEngine.cancelAll()
    }
  }, [clearTimers, stopCamera])

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

        // Mid-set camera angle re-lock logic
        if (nextIndex > 1 && (nextIndex - 1) % 3 === 0) {
          const next = nextAngle(ex, angleRef.current)
          if (next !== angleRef.current) {
            angleRef.current = next
            setAngle(next)
            pushFeed(`Camera angle switched — tracking re-locked (${next} view)`, 'info')
          }
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
      scheduleNextRep(ex)
    },
    [pushFeed, scheduleNextRep],
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
      const ex = picked ?? selected ?? EXERCISES[0]
      setPhase('analyzing')
      pushFeed('Pose model initializing — tracking 17 keypoints…', 'info')

      window.setTimeout(() => {
        setExercise(ex)
        const a = angleForExercise(ex)
        angleRef.current = a
        setAngle(a)
        setConfidence(92 + Math.floor(Math.random() * 6))
        startCountdown(ex)
      }, 2200)
    },
    [selectedExerciseId, pushFeed, startCountdown],
  )

  const startCamera = async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      setSource('camera')
      if (videoRef.current) videoRef.current.srcObject = stream

      // Camera disconnect listener
      const track = stream.getVideoTracks()[0]
      if (track) {
        track.onended = () => {
          pushFeed('Camera stream disconnected — workout paused', 'warn')
          setCameraError('Camera was disconnected. Please reconnect your video device or switch to demo mode.')
          audioEngine.playTone('warn')
        }
      }

      beginAnalysis()
    } catch (err: unknown) {
      const errorObj = err as { name?: string; message?: string }
      if (errorObj?.name === 'NotAllowedError' || errorObj?.name === 'PermissionDeniedError') {
        setCameraError('Camera permission denied. Click the lock icon in your browser address bar to allow camera access, or run demo mode.')
      } else {
        setCameraError(errorObj?.message || 'Unable to access camera device. Check your device permissions or use demo mode.')
      }
      audioEngine.playTone('warn')
      setSource(null)
    }
  }

  const startUpload = (file: File) => {
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    setSource('upload')
    beginAnalysis()
  }

  const startDemo = () => {
    setSource('demo')
    beginAnalysis()
  }

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
    clearTimers()
    stopCamera()
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
    clearTimers()
    stopCamera()
    audioEngine.cancelAll()
    repsRef.current = []
    angleRef.current = null
    setPhase('setup')
    setSource(null)
    setVideoUrl(null)
    setExercise(null)
    setAngle(null)
    setReps([])
    setFeed([])
    setElapsed(0)
    setSummaryOpen(false)
    setTab('coach')
    setCameraError(null)
  }

  const currentExDef = EXERCISES.find((e) => e.id === selectedExerciseId) || EXERCISES[0]
  const rec = currentExDef.recommendation

  const latest = reps[reps.length - 1]
  const avgForm = reps.length ? Math.round(reps.reduce((a, r) => a + r.formScore, 0) / reps.length) : 0
  const effort = latest?.effort ?? 0
  const zone = zoneFor(effort)
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  const statTiles = [
    { label: 'REPS', value: reps.length, key: reps.length, accent: true },
    { label: 'S / REP', value: latest ? latest.tempo.toFixed(1) : '—', key: latest?.tempo ?? 0, accent: false },
    { label: 'FORM', value: avgForm || '—', key: avgForm, accent: false },
  ]

  const chartEl = (
    <div className="p-3">
      <VelocityAngleChart reps={reps} targetAngle={exercise?.id === 'squat' ? 110 : 90} />
    </div>
  )

  const feedEl = (
    <div className="max-h-64 overflow-y-auto p-3 lg:max-h-72">
      {feed.length === 0 ? (
        <p className="mono-data p-2 text-[10px] tracking-[0.25em] text-muted-foreground">
          CUES LAND HERE MID-SET
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
            {isOffline ? (
              <span className="mono-data border-2 border-amber-600 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-700 tracking-[0.15em] flex items-center gap-1">
                <WifiOff className="h-3 w-3" /> OFFLINE EDGE MODE
              </span>
            ) : (
              <span className="mono-data hidden border-2 border-foreground bg-secondary px-2 py-0.5 text-[9px] font-semibold tracking-[0.25em] sm:inline-block">
                SIMULATED ANALYSIS
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
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
            <div className="hard-shadow relative aspect-[4/5] overflow-hidden border-2 border-foreground bg-foreground sm:aspect-video">
              {source === 'camera' && (
                <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              )}
              {source === 'upload' && videoUrl && (
                <video src={videoUrl} autoPlay loop muted playsInline className="h-full w-full object-cover" />
              )}
              {source === 'demo' && <div className="bg-grid absolute inset-0 bg-background" />}

              {/* Pre-workout Setup Overlay (Fixed Layout, No Scrollbars) */}
              {phase === 'setup' && (
                <div className="bg-grid absolute inset-0 flex flex-col items-center justify-between p-4 text-center z-10 overflow-hidden bg-background/95 backdrop-blur-sm">
                  <div>
                    <p className="mono-data text-[10px] tracking-[0.3em] text-primary">WORKOUT SETUP</p>
                    <h1 className="mt-0.5 text-xl sm:text-2xl font-bold uppercase tracking-tight">
                      Configure your <span className="font-serifit normal-case italic text-primary">set</span>
                    </h1>
                  </div>

                  {/* AI Camera Guidance Box & 3D Preview Window */}
                  <div className="w-full max-w-sm space-y-2 border-2 border-foreground bg-card p-3 hard-shadow-sm text-left">
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

                      {/* Fixed-height 3D Pose Canvas Animation Preview Window */}
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

                  <div className="flex w-full max-w-sm flex-row items-center justify-center gap-2">
                    <Button
                      size="sm"
                      className="hard-shadow-sm h-9 flex-1 border-2 border-foreground text-[11px] font-bold transition-transform hover:-translate-y-0.5"
                      onClick={startCamera}
                    >
                      <Camera className="mr-1.5 h-3.5 w-3.5" /> START CAMERA
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="hard-shadow-sm h-9 flex-1 border-2 border-foreground bg-card text-[11px] font-bold transition-transform hover:-translate-y-0.5"
                      asChild
                    >
                      <label className="cursor-pointer">
                        <Upload className="mr-1.5 h-3.5 w-3.5" /> UPLOAD VIDEO
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
                      className="hard-shadow-sm h-9 flex-1 border-2 border-foreground bg-foreground text-[11px] font-bold text-background transition-transform hover:-translate-y-0.5 hover:bg-foreground"
                      onClick={startDemo}
                    >
                      <Zap className="mr-1.5 h-3.5 w-3.5" /> DEMO MODE
                    </Button>
                  </div>

                  {cameraError && (
                    <div className="flex flex-col gap-1 max-w-sm border-2 border-amber-600 bg-amber-50 p-2 text-left text-[10px] text-amber-950">
                      <div className="flex items-center gap-1.5 font-bold">
                        <TriangleAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" /> CAMERA DIAGNOSTIC
                      </div>
                      <p>{cameraError}</p>
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
                active={phase === 'live' || phase === 'setup'}
                angle={phase === 'setup' ? rec.recommendedCamera : angle}
              />

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
                  key={zone.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mono-data mt-1 text-xs font-semibold tracking-[0.25em]"
                  style={{ color: zone.color }}
                >
                  {zone.label}
                </motion.p>
              </div>
              <EffortDial value={phase === 'live' || phase === 'ended' ? effort : 0} size={92} />
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
                      {phase === 'analyzing' ? 'CLASSIFYING MOVEMENT…' : 'NO MOVEMENT DETECTED YET'}
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
                      {phase === 'analyzing' ? 'CLASSIFYING MOVEMENT…' : 'NO MOVEMENT DETECTED YET'}
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
                  key={zone.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mono-data text-[10px] font-semibold tracking-[0.25em]"
                  style={{ color: zone.color }}
                >
                  {zone.label}
                </motion.span>
              </div>
              <div className="flex items-center justify-around gap-4 p-5">
                <EffortDial value={phase === 'live' || phase === 'ended' ? effort : 0} size={150} />
                <p className="mono-data max-w-[130px] text-[9px] leading-relaxed tracking-[0.15em] text-muted-foreground">
                  FUSED FROM REP COUNT, REP-SPEED DECAY &amp; FORM DEGRADATION
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
