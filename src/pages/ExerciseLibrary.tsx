import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, Dumbbell, Layers3, Play, Search } from 'lucide-react'
import { Link } from 'react-router'
import WorkspaceHeader from '@/components/WorkspaceHeader'
import ExerciseBrowserIntro from '@/components/exercises/ExerciseBrowserIntro'
import ExercisePlayer from '@/components/exercises/ExercisePlayer'
import { EXERCISES, EXERCISE_CATEGORIES, ROUTINES, exerciseById, type ExerciseCategory, type Movement } from '@/lib/exerciseLibrary'
import '@/components/exercises/exercises.css'

export default function ExerciseLibrary() {
  const [mode, setMode] = useState<'exercises' | 'routines'>('exercises')
  const [selected, setSelected] = useState<Movement | null>(null)
  const [routineId, setRoutineId] = useState(ROUTINES[0].id)
  const [routineOpen, setRoutineOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'All' | ExerciseCategory>('All')
  const routine = ROUTINES.find(item => item.id === routineId)!
  const sequence = useMemo(() => mode === 'routines' ? routine.steps.map(step => exerciseById(step.exerciseId)) : selected ? [exerciseById(selected)] : [], [mode, selected, routine])
  const filtered = EXERCISES.filter(item => (category === 'All' || item.category === category) && `${item.name} ${item.equipment} ${item.family} ${item.category}`.toLowerCase().includes(query.toLowerCase().trim()))
  const filteredRoutines = ROUTINES.filter(item => `${item.name} ${item.focus}`.toLowerCase().includes(query.toLowerCase().trim()))
  const showingPlayer = mode === 'exercises' ? selected !== null : routineOpen
  const changeMode = (value: typeof mode) => { setMode(value); setQuery(''); setCategory('All'); setSelected(null); setRoutineOpen(false) }
  const openExercise = (movement: Movement) => { setSelected(movement); window.scrollTo({ top: 180, behavior: 'smooth' }) }

  return <div className="exercise-workspace">
    <WorkspaceHeader />
    <main className="exercise-library">
      <header className="library-heading"><div><p className="studio-eyebrow">THE MOVEMENT LIBRARY / {String(EXERCISES.length).padStart(2, '0')}</p><h1>Understand the lift.<br /><em>See what works.</em></h1></div><div className="library-intro"><span><Layers3 size={15} /> ANATOMY IN MOTION</span><p>Browse by training goal, then open a directed 3D lesson with close-up coaching views.</p></div></header>
      <div className="library-layout">
        <div className="library-main">
          {showingPlayer ? <>
            <button className="back-to-catalog" onClick={() => mode === 'exercises' ? setSelected(null) : setRoutineOpen(false)}><ArrowLeft size={15} /> Back to {mode === 'exercises' ? 'movement library' : 'routines'}</button>
            <ExercisePlayer sequence={sequence} routine={mode === 'routines' ? routine : undefined} />
            {mode === 'routines' ? <section className="routine-plan" aria-label="Workout routine plan"><div className="routine-plan-heading"><div><p className="studio-eyebrow">YOUR SESSION OUTLINE</p><h2>{routine.name}</h2></div><span>{routine.rounds} ROUNDS</span></div><p>{routine.description}</p><ol>{routine.steps.map((step, i) => <li key={step.exerciseId}><b>{String(i + 1).padStart(2, '0')}</b><span>{exerciseById(step.exerciseId).name}</span><strong>{step.prescription}</strong></li>)}</ol><p className="routine-rest"><b>REST</b> {routine.rest}</p><small>This is a movement preview, not a timed follow-along. Choose a comfortable range and adapt reps to your ability.</small></section> : selected && <section className="exercise-description"><Dumbbell size={20} /><div><h2>{exerciseById(selected).name}</h2><p>{exerciseById(selected).description}</p></div><span>{exerciseById(selected).equipment}</span></section>}
          </> : mode === 'exercises' ? <ExerciseBrowserIntro category={category} onCategory={setCategory} onSelect={openExercise} /> : <section className="routine-gallery"><div className="catalog-intro"><p className="studio-eyebrow">CURATED TRAINING</p><h2>Choose the plan.<br /><em>Preview every movement.</em></h2><p>Each routine includes a guided two-rep preview for every exercise before you begin.</p></div><div className="routine-gallery-grid">{ROUTINES.map(item => <button key={item.id} onClick={() => { setRoutineId(item.id); setRoutineOpen(true) }}><span>{item.focus}</span><h3>{item.name}</h3><p>{item.description}</p><footer><b>{item.steps.length} MOVEMENTS · {item.rounds} ROUNDS</b><Play size={16} fill="currentColor" /></footer></button>)}</div></section>}
        </div>
        <aside className="library-browser" aria-label="Browse workouts"><div className="browser-header"><span className="studio-eyebrow">FIND YOUR MOVEMENT</span><span>{String(EXERCISES.length).padStart(2, '0')} TOTAL</span></div><div className="browser-tabs"><button aria-pressed={mode === 'exercises'} onClick={() => changeMode('exercises')}>Exercises <span>{EXERCISES.length}</span></button><button aria-pressed={mode === 'routines'} onClick={() => changeMode('routines')}>Routines <span>{ROUTINES.length}</span></button></div><label className="library-search"><Search size={16} /><input aria-label={mode === 'exercises' ? 'Search exercises' : 'Search routines'} placeholder={mode === 'exercises' ? 'Search a movement…' : 'Search a routine…'} value={query} onChange={e => setQuery(e.target.value)} /></label>
          {mode === 'exercises' && <div className="library-filters category-filters" aria-label="Exercise category">{EXERCISE_CATEGORIES.map(value => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>}
          <div className="browser-results" aria-live="polite"><p>{mode === 'exercises' ? `${filtered.length} EXERCISES` : `${filteredRoutines.length} CURATED ROUTINES`} <span>GUIDED 3D</span></p>
            {mode === 'exercises' ? filtered.map(item => <button className="movement-card" key={item.id} aria-pressed={selected === item.id} onClick={() => openExercise(item.id)}><span className="movement-number">{String(EXERCISES.indexOf(item) + 1).padStart(2, '0')}</span><span><strong>{item.name}</strong><small>{item.category} · {item.equipment}</small></span>{selected === item.id ? <Check size={15} /> : <ChevronRight size={15} />}</button>) : filteredRoutines.map(item => <button className="movement-card routine-card" key={item.id} aria-pressed={routineOpen && routineId === item.id} onClick={() => { setRoutineId(item.id); setRoutineOpen(true) }}><span><strong>{item.name}</strong><small>{item.focus}</small><em>{item.steps.length} movements · {item.rounds} rounds</em></span>{routineOpen && routineId === item.id ? <Check size={15} /> : <ChevronRight size={15} />}</button>)}
            {(mode === 'exercises' ? filtered.length === 0 : filteredRoutines.length === 0) && <div className="library-empty"><p>No matching {mode}.</p><button onClick={() => { setQuery(''); setCategory('All') }}>Clear filters</button></div>}
          </div>
          <div className="browser-note"><span>LESS GUESSWORK.<br /><em>Better movement.</em></span><p>Smooth camera movement, skin cutaways, and clear technique cues.</p><Link to="/session">RECORD YOUR OWN SET <ArrowUpRight size={16} /></Link></div>
        </aside>
      </div>
      <footer className="library-footer"><span>EDUCATIONAL DEMONSTRATIONS · NOT PERSONALIZED EXERCISE ADVICE</span><a href="/licenses/BODYPARTS3D-ATTRIBUTION.md" target="_blank" rel="noreferrer">Anatomy: BodyParts3D · CC BY 4.0 ↗</a></footer>
    </main>
  </div>
}
