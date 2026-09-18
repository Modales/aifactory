import { useMemo, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { POPULAR, type ExerciseId, type LibraryExercise } from '@/lib/analysisApi'

interface Props {
  library: LibraryExercise[]
  exercise: ExerciseId | ''
  onExercise: (value: ExerciseId | '') => void
}

/** Auto-detect first, popular lifts as chips, then a search across the whole library (yours included). */
export default function ExercisePicker({ library, exercise, onExercise }: Props) {
  const [query, setQuery] = useState('')
  const byId = useMemo(() => new Map(library.map(e => [e.id, e])), [library])
  const popular = POPULAR.map(id => byId.get(id)).filter((e): e is LibraryExercise => !!e)
  const custom = library.filter(e => e.custom)
  const selected = exercise ? byId.get(exercise) : null
  const trimmed = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!trimmed) return []
    return library.filter(e => e.name.toLowerCase().includes(trimmed) || e.familyName.toLowerCase().includes(trimmed)).slice(0, 14)
  }, [library, trimmed])

  return (
    <>
      <div className="chip-row">
        <button className="chip" aria-pressed={exercise === ''} onClick={() => onExercise('')}><Sparkles size={13} />Auto-detect</button>
        {popular.map(e => <button key={e.id} className="chip" aria-pressed={exercise === e.id} onClick={() => onExercise(e.id)}>{e.name}</button>)}
        {custom.map(e => <button key={e.id} className="chip custom" aria-pressed={exercise === e.id} onClick={() => onExercise(e.id)}>{e.name}</button>)}
        {selected && !popular.includes(selected) && !selected.custom && <button className="chip" aria-pressed onClick={() => onExercise('')}>{selected.name}</button>}
      </div>
      <label className="picker-search">
        <span><Search size={12} /> Search {library.length} exercises</span>
        <input aria-label="Search exercises" placeholder="e.g. Romanian deadlift, face pull, calf raise…" value={query} onChange={e => setQuery(e.target.value)} />
      </label>
      {matches.length > 0 && (
        <div className="chip-row picker-results">
          {matches.map(e => (
            <button key={e.id} className={`chip ${e.custom ? 'custom' : ''}`} aria-pressed={exercise === e.id} onClick={() => { onExercise(e.id); setQuery('') }}>
              {e.name}<small>{e.familyName}</small>
            </button>
          ))}
        </div>
      )}
      {trimmed && !matches.length && <p className="setup-note">Nothing called “{query}” yet. Record it with Auto-detect and you can teach it afterwards.</p>}
      <p className="setup-note">
        {exercise === ''
          ? 'Auto-detect identifies the movement family within the first rep and offers close variants to confirm with one tap.'
          : selected ? `${selected.name} is counted from a ${selected.views.join(' or ')} view using the ${selected.primary} angle.` : ''}
      </p>
    </>
  )
}
