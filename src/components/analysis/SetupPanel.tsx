import { Camera, ChevronDown, Plus, Upload, X } from 'lucide-react'
import { makeConfig, type CaptureConfig } from './captureConfig'
import ExercisePicker from './ExercisePicker'
import type { ExerciseId, LibraryExercise } from '@/lib/analysisApi'

interface Props {
  exercise: ExerciseId | ''
  onExercise: (value: ExerciseId | '') => void
  library: LibraryExercise[]
  configs: CaptureConfig[]
  onConfigs: (update: (items: CaptureConfig[]) => CaptureConfig[]) => void
  devices: MediaDeviceInfo[]
  onDetectCameras: () => void
  synchronized: boolean
  onSynchronized: (value: boolean) => void
}

/** Strava-style "choose your sport" setup: exercise + camera angle up front, clips and extra views tucked away. */
export default function SetupPanel({ exercise, onExercise, library, configs, onConfigs, devices, onDetectCameras, synchronized, onSynchronized }: Props) {
  const primary = configs[0]
  const patch = (id: string, changes: Partial<CaptureConfig>) => onConfigs(items => items.map(c => c.id === id ? { ...c, ...changes } : c))
  const setSource = (kind: 'camera' | 'upload') => onConfigs(items => items.map(c => ({ ...c, kind, file: null, deviceId: '', offsetMs: 0 })))

  return (
    <section className="record-card pad">
      <div className="setup-block">
        <p className="record-section-title">Exercise</p>
        <ExercisePicker library={library} exercise={exercise} onExercise={onExercise} />
      </div>

      <div className="setup-block">
        <p className="record-section-title">Camera angle</p>
        <div className="chip-row">
          {([['side', 'Side — counts reps & depth'], ['frontal', 'Front — knee tracking'], ['auto', 'Not sure']] as const).map(([view, label]) => (
            <button key={view} className="chip" aria-pressed={primary.view === view} onClick={() => patch(primary.id, { view })}>{label}</button>
          ))}
        </div>
        <p className="setup-note">Stand 2–3 m away so your whole body stays in frame. A side view is what counts reps and measures range of motion.</p>
      </div>

      <div className="setup-block">
        <details className="setup-advanced">
          <summary><ChevronDown size={14} />More ways to record</summary>
          <div className="chip-row">
            <button className="chip" aria-pressed={primary.kind === 'camera'} onClick={() => setSource('camera')}><Camera size={13} />Live camera</button>
            <button className="chip" aria-pressed={primary.kind === 'upload'} onClick={() => setSource('upload')}><Upload size={13} />Upload a clip</button>
            {configs.length < 3 && <button className="chip" onClick={() => onConfigs(items => [...items, makeConfig(items.length + 1, items[0].kind)])}><Plus size={13} />Add a second angle</button>}
          </div>
          {primary.kind === 'camera' && configs.length > 1 && <button className="ghost-button" style={{ marginTop: 12 }} onClick={onDetectCameras}><Camera size={14} />Detect connected cameras</button>}

          {(primary.kind === 'upload' || configs.length > 1) && configs.map((c, index) => (
            <div key={c.id} className="view-config">
              <div className="view-config-head">
                <span>{c.id}{index === 0 ? ' · primary' : ''}</span>
                {index > 0 && <button aria-label={`Remove ${c.id}`} onClick={() => onConfigs(items => items.filter(v => v.id !== c.id))}><X size={15} /></button>}
              </div>
              <div className="view-config-fields">
                {c.kind === 'camera'
                  ? <label>Device<select aria-label={`${c.id} device`} value={c.deviceId} onChange={e => patch(c.id, { deviceId: e.target.value })}><option value="">Default camera</option>{devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Device ${i + 1}`}</option>)}</select></label>
                  : <label>Clip<input aria-label={`${c.id} clip`} type="file" accept="video/*" onChange={e => patch(c.id, { file: e.target.files?.[0] ?? null })} /></label>}
                <label>Angle<select aria-label={`${c.id} perspective`} value={c.view} onChange={e => patch(c.id, { view: e.target.value as CaptureConfig['view'] })}><option value="side">Side</option><option value="frontal">Front</option><option value="oblique">Oblique</option><option value="auto">Estimate</option></select></label>
                {c.kind === 'upload' && configs.length > 1 && <label>Offset (seconds)<input aria-label={`${c.id} offset`} type="number" step="0.1" min={-3600} max={3600} value={c.offsetMs / 1000} onChange={e => patch(c.id, { offsetMs: Number(e.target.value) * 1000 })} /></label>}
              </div>
            </div>
          ))}

          {configs.length > 1 && <label className="sync-confirm">
            <input type="checkbox" checked={synchronized} onChange={e => onSynchronized(e.target.checked)} />
            <span>All angles show the same athlete and the same set.{primary.kind === 'upload' && ' For clips, line up one visible event (a clap): if it happens at 2 s in Camera 1 and 5 s in Camera 2, set Camera 2’s offset to −3.'}</span>
          </label>}
        </details>
      </div>
    </section>
  )
}
