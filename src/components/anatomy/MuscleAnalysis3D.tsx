import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Layers3, Pause, Play, Rotate3D, X } from 'lucide-react'
import AnatomyViewer3D from './AnatomyViewer3D'
import { anatomyScores, loadAnatomyAtlas, musclePartIds, type AnatomyAtlas, type AnatomyLayer } from '@/lib/anatomyAtlas'
import type { MuscleLoadSummary } from '@/lib/muscleModel'

interface Props { summary: MuscleLoadSummary; title?: string; initialSkeleton?: boolean; onClose: () => void }
const roleCopy = (score: number) => score >= 70 ? 'Primary driver' : score >= 40 ? 'Strong assistant' : 'Stabilizing contribution'

/** Full-screen muscle story: guided workout playback plus manual layer and mesh exploration. */
export default function MuscleAnalysis3D({ summary, title = 'Muscle analysis', initialSkeleton = false, onClose }: Props) {
  const [atlas, setAtlas] = useState<AnatomyAtlas | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [layer, setLayer] = useState<AnatomyLayer>('all')
  const [showSkeleton, setShowSkeleton] = useState(initialSkeleton)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    loadAnatomyAtlas(controller.signal).then(setAtlas).catch(e => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [])
  const story = summary.entries.filter(entry => entry.score > 0).slice(0, 8)
  useEffect(() => {
    if (!playing || progress < 100 || story.length < 2 || selectedId) return
    const timer = window.setInterval(() => setStep(value => (value + 1) % story.length), 6000)
    return () => window.clearInterval(timer)
  }, [playing, progress, story.length, selectedId])

  const scores = useMemo(() => atlas ? anatomyScores(atlas, summary) : new Map<string, number>(), [atlas, summary])
  const current = story[Math.min(step, Math.max(story.length - 1, 0))]
  const focusIds = useMemo(() => atlas && current ? musclePartIds(atlas, current.id) : [], [atlas, current])
  const selectedPart = atlas?.parts.find(part => part.id === selectedId)
  const move = (delta: number) => { setSelectedId(null); setStep(value => (value + delta + story.length) % story.length) }

  return <div className="anatomy-modal" role="dialog" aria-modal="true" aria-label={title}>
    <div className="anatomy-topbar">
      <div><span>FORMFIT / 3D ANATOMY</span><h2>{title}</h2></div>
      <button onClick={onClose} aria-label="Close 3D anatomy"><X /></button>
    </div>
    <div className="anatomy-stage">
      {atlas && !error ? <AnatomyViewer3D atlas={atlas} scores={scores} layer={layer} showSkeleton={showSkeleton} selectedId={selectedId} focusIds={focusIds} view="three-quarter" onSelect={id => { setSelectedId(id); setPlaying(false) }} onProgress={setProgress} onError={setError} /> : null}
      {!atlas && !error && <div className="anatomy-loading"><Rotate3D /><strong>Preparing anatomy</strong><span>Loading model index…</span></div>}
      {atlas && progress < 100 && !error && <div className="anatomy-progress"><i style={{ width: `${progress}%` }} /><span>{progress}% · loading detailed structures</span></div>}
      {error && <div className="anatomy-loading"><strong>3D viewer unavailable</strong><span>{error}</span></div>}
      <div className="anatomy-layer-panel">
        <span><Layers3 size={13} /> Anatomical layers</span>
        <div>{(['surface', 'deep', 'all'] as AnatomyLayer[]).map(value => <button key={value} aria-pressed={layer === value} onClick={() => setLayer(value)}>{value === 'all' ? 'All muscles' : value}</button>)}</div>
        <label><input type="checkbox" checked={showSkeleton} onChange={e => setShowSkeleton(e.target.checked)} /> Skeleton context</label>
      </div>
      {(selectedPart || current) && progress >= 100 && !error && <div className="anatomy-focus-tag" key={selectedPart?.id ?? current?.id}><i />Highlighting<strong>{selectedPart?.name ?? current?.name}</strong></div>}
      <p className="anatomy-gesture">Drag to rotate · scroll to zoom · click any structure</p>
    </div>
    <aside className="anatomy-story">
      <div className="story-kicker">GUIDED MUSCLE STORY</div>
      <div className="story-chapter" key={selectedId ?? current?.id ?? 'empty'}>
      {selectedPart ? <>
        <span className="story-count">SELECTED STRUCTURE</span>
        <h3>{selectedPart.name}</h3>
        <p>This exact anatomical mesh is isolated in the camera. Its highlight color reflects the closest mapped workout-demand group when available.</p>
        <button className="story-return" onClick={() => setSelectedId(null)}>Return to workout story</button>
      </> : current ? <>
        <span className="story-count">{String(step + 1).padStart(2, '0')} / {String(story.length).padStart(2, '0')}</span>
        <h3>{current.name}</h3>
        <div className="story-score"><strong>{current.score}</strong><span>/100 estimated demand<br/>{roleCopy(current.score)}</span></div>
        <div className="story-meter"><i style={{ width: `${current.score}%` }} /></div>
        <p>{current.role === 'primary' ? 'This muscle group was a main mover for the confirmed exercise.' : 'This group assisted the movement or stabilized the body while the main joints moved.'} Select an individual head in the model to inspect it.</p>
      </> : <p>No muscle-demand estimate is available for this workout.</p>}
      </div>
      <div className="story-controls">
        <button onClick={() => move(-1)} disabled={story.length < 2} aria-label="Previous muscle"><ChevronLeft /></button>
        <button onClick={() => setPlaying(value => !value)} disabled={story.length < 2} aria-label={playing ? 'Pause muscle story' : 'Play muscle story'}>{playing ? <Pause /> : <Play />}</button>
        <button onClick={() => move(1)} disabled={story.length < 2} aria-label="Next muscle"><ChevronRight /></button>
      </div>
      <div className="story-list">{story.map((entry, index) => <button key={entry.id} aria-pressed={!selectedId && index === step} onClick={() => { setSelectedId(null); setStep(index); setPlaying(false) }}><span>{entry.name}</span><b>{entry.score}</b></button>)}</div>
      <small>{summary.disclaimer} Model: BodyParts3D 4.0, CC BY 4.0.</small>
    </aside>
  </div>
}
