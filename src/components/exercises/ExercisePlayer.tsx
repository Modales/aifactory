import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Camera, Loader2, Pause, Play, RotateCcw } from 'lucide-react'
import { DEMO_SECONDS, playbackPosition, type LibraryExercise, type LibraryRoutine } from '@/lib/exerciseLibrary'
import { cameraShot } from '@/lib/exerciseCamera'
import { muscleLoadFromDemand } from '@/lib/muscleModel'
const ExerciseScene = lazy(() => import('./ExerciseScene'))

interface Props { sequence: LibraryExercise[]; routine?: LibraryRoutine }
const clock = (seconds: number) => `0:${String(Math.floor(seconds)).padStart(2, '0')}`
export default function ExercisePlayer({ sequence, routine }: Props) {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const onReady = useCallback(() => setReady(true), [])
  useEffect(() => { setTime(0); setPlaying(false); setReady(false); setError('') }, [sequence])
  const total = sequence.length * DEMO_SECONDS
  const position = playbackPosition(time, sequence)
  const { exercise, cycle, phase, index } = position
  const muscles = useMemo(() => muscleLoadFromDemand(exercise.demand).entries, [exercise])
  const shot = cameraShot(exercise.cameraFocus, cycle, 1.5)
  useEffect(() => {
    if (!playing || !ready || error) return
    let frame = 0, previous = 0, accumulated = 0
    const tick = (now: number) => {
      if (previous && !document.hidden) accumulated += Math.min((now - previous) / 1000, .1)
      previous = now
      if (accumulated >= .04) { const delta = accumulated; accumulated = 0; setTime(value => Math.min(total, value + delta)) }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, ready, error, total])
  const ended = time >= total
  const isPlaying = playing && !ended
  useEffect(() => { if (ended) setPlaying(false) }, [ended])
  const seek = (value: number) => { setPlaying(false); setTime(value) }
  const toggle = () => { if (ended) setTime(0); setPlaying(value => !value) }

  return <section className="exercise-player" aria-label="Guided exercise player">
    <div className="exercise-theater">
      <Suspense fallback={null}><ExerciseScene exercise={exercise} cycle={cycle} onReady={onReady} onError={setError} /></Suspense>
      {(!ready || error) && <div className="exercise-loading" role="status">{!error && <Loader2 className="animate-spin" />}<strong>{error ? 'Playback unavailable' : 'Preparing your anatomy studio'}</strong><span>{error || 'Loading the detailed skeleton and muscle model…'}</span></div>}
      <div className="theater-topline"><span><i /> MOVEMENT STUDIO</span><span><Camera size={12} /> AUTO DIRECTOR · {shot.label}</span></div>
      <div className="theater-heading"><p>{routine ? `ROUTINE PREVIEW / ${String(index + 1).padStart(2, '0')} OF ${String(sequence.length).padStart(2, '0')}` : `${exercise.category.toUpperCase()} · GUIDED 3D`}</p><h2 data-testid="playing-exercise">{exercise.name}</h2></div>
      <div className="theater-legend"><span><i /> Main movers</span><span><i /> Assisting muscles</span></div>
      <div className="theater-coach" aria-live="polite"><span>COACH CUE · {String(phase + 1).padStart(2, '0')}</span><strong>{ended ? 'Preview complete' : exercise.phases[phase]}</strong><p>{exercise.cues[phase]}</p></div>
      <div className="theater-phase"><span>{String(phase + 1).padStart(2, '0')} / 03</span><strong data-testid="movement-phase">{ended ? 'Preview complete' : exercise.phases[phase]}</strong></div>
      <span className="theater-footnote">ILLUSTRATIVE 3D MOTION · AUTOMATIC TECHNIQUE CAMERA</span>
    </div>
    <div className="player-transport">
      <div className="transport-timeline"><input type="range" aria-label="Scrub demonstration" min={0} max={total} step={.05} value={time} disabled={!ready || !!error} onChange={e => seek(Number(e.target.value))} style={{ background: `linear-gradient(to right, #e75b2a ${time / total * 100}%, #535750 ${time / total * 100}%)` }} /></div>
      <div className="transport-buttons"><button className="transport-play" disabled={!ready || !!error} onClick={toggle} aria-label={isPlaying ? 'Pause demonstration' : ended ? 'Replay demonstration' : 'Play demonstration'}>{isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}<span>{isPlaying ? 'Pause' : ended ? 'Replay' : 'Play'}</span></button><button className="transport-reset" disabled={!ready || !!error} onClick={() => seek(0)} aria-label="Restart demonstration"><RotateCcw size={16} /></button><output aria-label="Playback time">{clock(time)} <span>/ {clock(total)}</span></output><span className="transport-note">{routine ? '2 REPS PER EXERCISE · PREVIEW ONLY' : 'AUTO CAMERA · 2 CONTROLLED REPS'}</span></div>
      {routine && <div className="routine-chapters" aria-label="Routine chapters">{sequence.map((item, i) => <button key={item.id} aria-pressed={index === i} disabled={!ready || !!error} onClick={() => seek(i * DEMO_SECONDS)}><b>{String(i + 1).padStart(2, '0')}</b>{item.name}</button>)}</div>}
    </div>
    <div className="movement-notes">
      <div className="movement-cue"><p className="studio-eyebrow">THE TECHNIQUE</p><h3>{exercise.phases[phase]}</h3><p>{exercise.cues[phase]}</p><div className="phase-markers">{exercise.phases.map((label, i) => <span key={label} className={i === phase ? 'current' : ''}><b>{String(i + 1).padStart(2, '0')}</b>{label}</span>)}</div></div>
      <div className="movement-muscles"><p className="studio-eyebrow">MUSCLES AT WORK</p><div data-testid="working-muscles">{muscles.map(muscle => <span key={muscle.id} className={muscle.role === 'primary' ? 'primary' : 'secondary'}><i />{muscle.name}</span>)}</div><small>Highlights show typical involvement, not measured activation or personal training load.</small></div>
    </div>
  </section>
}
