import { useState } from 'react'
import { GraduationCap } from 'lucide-react'
import type { ExerciseProposal, TaughtExercise } from '@/lib/analysisApi'

interface Props {
  muscles: { id: string; name: string }[]
  working: boolean
  onTeach: (name: string, muscles: string[], family?: string) => Promise<TaughtExercise>
  /** When the model recognised an exercise that isn't in the library yet, its name and muscles are pre-filled. */
  proposal?: ExerciseProposal | null
  onCancel?: () => void
}

/** Turn the set just recorded into a new library entry: the server learns range, tempo and rep gates from these reps. */
export default function TeachExercisePanel({ muscles, working, onTeach, proposal, onCancel }: Props) {
  const [name, setName] = useState(proposal?.name ?? '')
  const [picked, setPicked] = useState<string[]>(proposal?.muscles ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<TaughtExercise | null>(null)

  const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(m => m !== id) : p.length < 4 ? [...p, id] : p)

  async function submit() {
    if (name.trim().length < 2) { setError('Give the exercise a name.'); return }
    setBusy(true); setError('')
    try { setResult(await onTeach(name.trim(), picked, proposal?.family)) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  if (result) {
    return (
      <section className="record-card pad teach-panel">
        <p className="record-section-title">Added to your library</p>
        <h2 className="report-headline">{result.exercise.name}</h2>
        <p className="report-sub">Learned from {result.learned.reps} reps · {result.learned.primaryJoint.toLowerCase()} angle {result.learned.top}° → {result.learned.bottom}° · ~{result.learned.seconds}s per rep · {result.learned.view} view</p>
        <p className="setup-note">Future sets are detected automatically and checked on: {result.checks.join(', ').toLowerCase()}. Targets are your own recorded range, not a coaching standard.</p>
      </section>
    )
  }

  return (
    <section className="record-card pad teach-panel">
      <p className="record-section-title"><GraduationCap size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />{proposal ? 'New exercise recognised' : 'Teach this exercise'}</p>
      {proposal
        ? <p className="setup-note" style={{ marginTop: 0 }}>This looks like <strong>{proposal.name}</strong> ({Math.round(proposal.confidence * 100)}% — {proposal.reason}). It isn’t in the library yet: add it and this set’s reps become its template.</p>
        : <p className="setup-note" style={{ marginTop: 0 }}>Not in the library? Name what you just did. The reps you recorded become the template: which joint defines a rep, how far it should travel and how fast.</p>}
      <label style={{ marginTop: 14 }}>Exercise name<input aria-label="New exercise name" value={name} maxLength={60} placeholder="e.g. Sissy squat" onChange={e => setName(e.target.value)} /></label>
      <p className="record-section-title" style={{ marginTop: 16 }}>Main muscles (optional, up to 4)</p>
      <div className="chip-row">
        {muscles.map(m => <button key={m.id} type="button" className="chip" aria-pressed={picked.includes(m.id)} onClick={() => toggle(m.id)}>{m.name}</button>)}
      </div>
      {error && <p className="report-warning" role="alert">{error}</p>}
      <div className="save-actions" style={{ marginTop: 16 }}>
        <button className="solid-button" disabled={busy || working} onClick={() => void submit()}>{busy ? 'Learning…' : 'Add to my library'}</button>
        {onCancel && <button className="ghost-button" onClick={onCancel}>Cancel</button>}
      </div>
    </section>
  )
}
