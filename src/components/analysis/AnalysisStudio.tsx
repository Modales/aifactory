import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Circle, ShieldCheck, Square } from 'lucide-react'
import AnalysisShell from './AnalysisShell'
import CaptureView from './CaptureView'
import { makeConfig, type CaptureConfig } from './captureConfig'
import AnalysisResults from './AnalysisResults'
import SetupPanel from './SetupPanel'
import LiveHud from './LiveHud'
import SavePanel from './SavePanel'
import TeachExercisePanel from './TeachExercisePanel'
import { evaluate, fetchLibrary, teachExercise, PROPOSED, type AnalysisFrame, type AnalysisReport, type CameraStream, type ExerciseId, type ExerciseLibrary } from '@/lib/analysisApi'
import { api } from '@/lib/api'
import { emptyMuscleLoad } from '@/lib/muscleModel'
import { useAuth } from '@/lib/authContext'

type Stage = 'setup' | 'recording' | 'review'
const MAX_FRAMES = 2700   // ~8 fps for the full six minutes; must match the server's per-camera cap
const MAX_SECONDS = 360
const LIVE_INTERVAL_MS = 2500

/**
 * Record flow: pick exercise + angle → Record → live reps/form cues → Stop → review & save.
 * Only pose landmarks leave the device; video never does.
 */
export default function AnalysisStudio() {
  const { status } = useAuth()
  const [configs, setConfigs] = useState<CaptureConfig[]>([makeConfig(1)])
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [exercise, setExercise] = useState<ExerciseId | ''>('')
  const [synchronized, setSynchronized] = useState(false)
  const [stage, setStage] = useState<Stage>('setup')
  const [ready, setReady] = useState<Record<string, boolean>>({})
  const [setupProblem, setSetupProblem] = useState('')
  const [epoch, setEpoch] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [working, setWorking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [library, setLibrary] = useState<ExerciseLibrary>({ exercises: [], families: {}, muscles: [] })
  const [teaching, setTeaching] = useState(false)

  const workoutId = useRef(crypto.randomUUID())
  const streams = useRef<Record<string, CameraStream>>({})
  const ended = useRef(new Set<string>())
  const generation = useRef(0)
  const activeRef = useRef(false)
  const configRef = useRef(configs)
  const finishRef = useRef<() => void>(() => {})
  const overlapStart = Math.max(...configs.map(c => c.offsetMs))

  useEffect(() => { configRef.current = configs }, [configs])
  useEffect(() => () => { activeRef.current = false; generation.current++ }, [])
  // Library = built-ins + this athlete's taught exercises, so reload whenever the sign-in state changes.
  useEffect(() => { fetchLibrary().then(setLibrary).catch(() => {}) }, [status])

  const onReady = useCallback((id: string, value: boolean, problem?: string) => { setReady(r => ({ ...r, [id]: value })); setSetupProblem(problem ?? '') }, [])
  const onFrame = useCallback((id: string, frame: AnalysisFrame, aspectRatio: number) => {
    if (!activeRef.current) return
    const config = configRef.current.find(c => c.id === id)
    if (!config) return
    const stream = streams.current[id] ?? { cameraId: id, aspectRatio, offsetMs: config.kind === 'camera' ? 0 : config.offsetMs, view: config.view, frames: [] }
    if (stream.frames.length >= MAX_FRAMES) { finishRef.current(); return }
    if (stream.frames.length && frame.timestampMs <= stream.frames[stream.frames.length - 1].timestampMs) return
    stream.frames.push(frame)
    streams.current[id] = stream
  }, [])
  const onEnded = useCallback((id: string) => {
    ended.current.add(id)
    if (ended.current.size === configRef.current.length && activeRef.current) finishRef.current()
  }, [])

  const updateConfigs = (update: (items: CaptureConfig[]) => CaptureConfig[]) => { setConfigs(update); setReady({}); setSetupProblem(''); setError('') }

  async function detectCameras() {
    setError('')
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      probe.getTracks().forEach(t => t.stop())
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'))
    } catch (e) { setError((e as Error).message) }
  }

  function validate(): string | null {
    if (configs.some(c => c.kind === 'upload' && !c.file)) return 'Choose a clip for every uploaded angle.'
    if (configs.some(c => c.file && c.file.size > 500 * 1024 * 1024)) return 'Use clips smaller than 500 MB and no longer than six minutes.'
    const cameras = configs.filter(c => c.kind === 'camera')
    if (cameras.length > 1 && (cameras.some(c => !c.deviceId) || new Set(cameras.map(c => c.deviceId)).size !== cameras.length)) return 'Detect cameras and pick a different physical device for each live angle.'
    if (configs.length > 1 && !synchronized) return 'Confirm that all angles show the same athlete and set.'
    return null
  }

  function start() {
    const problem = validate()
    if (problem) { setError(problem); return }
    streams.current = {}; ended.current = new Set()
    setReport(null); setError(''); setElapsed(0); setSaved(false)
    generation.current++; activeRef.current = true
    setEpoch(performance.now()); setStage('recording')
  }

  async function finish() {
    if (!activeRef.current) return
    activeRef.current = false; generation.current++
    setStage('review'); setWorking(true)
    try {
      const input = Object.values(streams.current).map(s => ({ ...s, frames: [...s.frames] }))
      if (!input.length) throw new Error('No body landmarks were captured. Step back so your whole body is in frame and try again.')
      if (input.length !== configs.length) throw new Error('One angle never saw the athlete. Check every camera and try again.')
      setReport(await evaluate(input, exercise || null, configs.length > 1 && synchronized, true, workoutId.current))
      setError('')
    } catch (e) { setError((e as Error).message) } finally { setWorking(false) }
  }
  useEffect(() => { finishRef.current = () => void finish() })

  /** Confirm a detected variant (or a candidate) mid-set or in review: re-score what was captured under that exercise. */
  async function confirm(id: ExerciseId) {
    setExercise(id)
    if (stage !== 'review') return
    const input = Object.values(streams.current)
    if (!input.length) return
    setWorking(true)
    try { setReport(await evaluate(input, id, configs.length > 1 && synchronized, true, workoutId.current)); setError('') } catch (e) { setError((e as Error).message) } finally { setWorking(false) }
  }

  /** Teach the set just recorded as a new library entry, then re-score it as that exercise. */
  async function teach(name: string, muscles: string[], family?: string) {
    const input = Object.values(streams.current)
    const taught = await teachExercise(name, muscles, input, configs.length > 1 && synchronized, family)
    setLibrary(await fetchLibrary())
    await confirm(taught.exercise.id)
    return taught
  }

  // Live loop: re-evaluate everything captured so far every few seconds for on-screen reps/cues.
  useEffect(() => {
    if (stage !== 'recording') return
    const current = generation.current
    let pending = false
    const timer = window.setInterval(() => {
      const seconds = Math.floor((performance.now() - epoch) / 1000)
      setElapsed(seconds)
      if (seconds >= MAX_SECONDS) { finishRef.current(); return }
      const input = Object.values(streams.current)
      if (pending || input.length !== configs.length || input.some(s => s.frames.length < 12)) return
      pending = true; setWorking(true)
      void evaluate(input, exercise || null, configs.length > 1 && synchronized, false, workoutId.current)
        .then(r => { if (generation.current === current) { setReport(r); setError('') } })
        .catch(e => { if (generation.current === current) setError(e.message) })
        .finally(() => { pending = false; if (generation.current === current) setWorking(false) })
    }, LIVE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [stage, epoch, exercise, configs.length, synchronized])

  async function save({ caption, share, visibility }: { caption: string; share: boolean; visibility: 'public' | 'followers' }) {
    if (!report?.analysisId || report.score === null) return
    setSaving(true); setError('')
    try {
      // The server rebuilds the workout from its own report; these fields are placeholders it overwrites.
      const session = await api.saveSession({ analysisId: report.analysisId, workoutId: workoutId.current, exerciseId: report.exercise ?? '', exerciseName: report.exerciseName, cameraAngle: report.views.map(v => v.view).join(', '), durationSeconds: report.durationSeconds, totalReps: report.repCount, avgFormScore: report.score, peakEffort: 0, muscleLoad: emptyMuscleLoad(), reps: [] })
      if (share) await api.shareActivity({ sessionId: session.id, caption, visibility })
      setSaved(true)
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }

  function reset() {
    generation.current++; activeRef.current = false; streams.current = {}
    workoutId.current = crypto.randomUUID()
    setStage('setup'); setReport(null); setError(''); setSaved(false); setWorking(false); setElapsed(0); setTeaching(false)
  }

  const allReady = configs.every(c => ready[c.id])
  const isUpload = configs[0].kind === 'upload'
  const signedIn = status === 'authenticated'

  return (
    <AnalysisShell>
      <div className="record-layout">
        <div className="record-title">
          <div>
            <Link to="/dashboard" className="record-crumb"><ArrowLeft size={14} />Dashboard</Link>
            <h1>{stage === 'recording' ? <>Recording <em>live</em></> : stage === 'review' ? <>Review your <em>set</em></> : <>Record a <em>set</em></>}</h1>
            <p>{stage === 'recording' ? 'Reps and form update after each completed rep.' : stage === 'review' ? 'Measured joint angles from your camera, checked against simple technique targets.' : 'Pick the exercise, frame your whole body, hit Record.'}</p>
          </div>
          <span className="record-private"><ShieldCheck size={15} />Video never leaves your device</span>
        </div>

        {!signedIn && <section className="record-card pad signin-card"><p>Sign in to record, score and save your sets.</p><Link to="/login" state={{ from: '/session' }} className="solid-button">Sign in</Link><Link to="/signup" className="ghost-button">Create account</Link></section>}
        {error && <div className="record-error" role="alert">{error}</div>}

        <div>
          {stage !== 'review' && (
            <div className="record-stage">
              <div className={`capture-grid ${configs.length > 1 ? 'multi' : ''}`}>
                {configs.map(c => <CaptureView key={c.id} config={c} showHeading={configs.length > 1} recording={stage === 'recording'} epoch={epoch} overlapStart={overlapStart} onFrame={onFrame} onReady={onReady} onEnded={onEnded} />)}
              </div>
            </div>
          )}

          {stage === 'recording' && <LiveHud elapsed={elapsed} report={report} working={working} exercise={exercise} onExercise={id => void confirm(id)} />}

          {stage === 'setup' && (
            <div className="record-controls">
              <button className="record-button" disabled={!signedIn || !allReady} onClick={start} aria-label={isUpload ? 'Analyze clip' : 'Start recording'}><Circle size={22} fill="currentColor" />{isUpload ? 'Analyze' : 'Record'}</button>
            </div>
          )}
          {stage === 'setup' && <p className="record-hint">{!signedIn ? 'Sign in to start.' : allReady ? (isUpload ? 'Clip loaded — press Analyze to play it through the pose model.' : 'Camera ready. Face the camera side-on and press Record.') : setupProblem ? `${setupProblem} Try Chrome or Safari with camera access allowed, or upload a clip under “More ways to record”.` : 'Starting camera and pose model…'}</p>}

          {stage === 'recording' && (
            <div className="record-controls">
              <button className="record-button stop" onClick={() => void finish()} aria-label="Stop recording"><Square size={20} fill="currentColor" />Stop</button>
            </div>
          )}

          {stage === 'review' && <AnalysisResults report={report} working={working} />}
        </div>

        <div>
          {stage === 'setup' && <SetupPanel exercise={exercise} onExercise={setExercise} library={library.exercises} configs={configs} onConfigs={updateConfigs} devices={devices} onDetectCameras={detectCameras} synchronized={synchronized} onSynchronized={setSynchronized} />}
          {stage === 'recording' && <AnalysisResults report={report} working={working} />}
          {stage === 'review' && !working && report && !saved && (teaching || !report.exercise || report.exercise === PROPOSED) && (
            <TeachExercisePanel muscles={library.muscles} working={working} onTeach={teach} proposal={report.proposal} onCancel={teaching ? () => setTeaching(false) : undefined} />
          )}
          {stage === 'review' && (!teaching || saved) && (
            <SavePanel report={report} working={working} saving={saving} saved={saved} onSave={save} onDiscard={reset}
              onConfirm={id => void confirm(id)} onTeach={report && !saved && !teaching ? () => setTeaching(true) : undefined} />
          )}
        </div>
      </div>
    </AnalysisShell>
  )
}
