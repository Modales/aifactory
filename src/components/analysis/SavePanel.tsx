import { useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, Globe, GraduationCap, Save, Trash2, Users } from 'lucide-react'
import { PROPOSED, type AnalysisReport, type ExerciseId } from '@/lib/analysisApi'

interface Props {
  report: AnalysisReport | null
  working: boolean
  saving: boolean
  saved: boolean
  onSave: (options: { caption: string; share: boolean; visibility: 'public' | 'followers' }) => void
  onDiscard: () => void
  onConfirm?: (id: ExerciseId) => void
  onTeach?: () => void
}

/** Strava-style "save activity" card: confirm the exercise, title, who can see it, save or discard. */
export default function SavePanel({ report, working, saving, saved, onSave, onDiscard, onConfirm, onTeach }: Props) {
  const [caption, setCaption] = useState('')
  const [share, setShare] = useState(true)
  const [visibility, setVisibility] = useState<'public' | 'followers'>('followers')
  const proposed = report?.exercise === PROPOSED
  const canSave = !!report?.analysisId && report.score !== null && report.repCount > 0 && !proposed

  if (saved) {
    return (
      <section className="record-card pad save-form">
        <div className="saved-banner"><CheckCircle2 size={22} /><div><strong>Workout saved</strong><p>{share ? 'It’s on your feed and in your training log.' : 'It’s in your training log.'}</p></div></div>
        <div className="saved-links">
          <Link to="/dashboard" className="solid-button">Back to dashboard</Link>
          <Link to="/history" className="ghost-button">Training log</Link>
          <button className="ghost-button" onClick={onDiscard}>Record another set</button>
        </div>
      </section>
    )
  }

  return (
    <section className="record-card pad save-form">
      <h2>{working ? 'Wrapping up…' : canSave ? 'Save your set' : 'Nothing to save yet'}</h2>
      {!canSave && !working && <p className="report-empty">{proposed ? `Add “${report.exerciseName}” to your library above to save this set under its name.` : 'A set needs at least one fully visible rep to be saved. Move so your whole body stays in frame and try again.'}</p>}
      {report && !working && onConfirm && (report.alternatives.length > 1 || (!report.exercise && report.candidates.length > 0)) && (
        <div className="live-alternatives">
          <span>{report.exercise ? `Detected ${report.exerciseName.toLowerCase()} — pick the exact variant:` : 'Not sure what this was — tap the closest match:'}</span>
          <div className="chip-row">
            {(report.exercise ? report.alternatives : report.candidates.slice(0, 4)).map(a => <button key={a.id} className="chip" aria-pressed={a.id === report.exercise} onClick={() => onConfirm(a.id)}>{a.name}</button>)}
          </div>
        </div>
      )}
      {report?.exercise && !proposed && !working && onTeach && <button className="ghost-button teach-link" onClick={onTeach}><GraduationCap size={14} />Not a {report.exerciseName.toLowerCase()}? Teach it as a new exercise</button>}
      <label>Title / notes<textarea rows={2} maxLength={2000} placeholder={report?.exercise ? `${report.exerciseName} — ${report.repCount} reps` : 'How did it feel?'} value={caption} onChange={e => setCaption(e.target.value)} disabled={!canSave} /></label>
      <label className="sync-confirm" style={{ marginTop: 0 }}><input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} disabled={!canSave} /><span>Post to my feed</span></label>
      {share && <div className="visibility">
        <button className="chip" aria-pressed={visibility === 'followers'} onClick={() => setVisibility('followers')} disabled={!canSave}><Users size={13} />Followers</button>
        <button className="chip" aria-pressed={visibility === 'public'} onClick={() => setVisibility('public')} disabled={!canSave}><Globe size={13} />Everyone</button>
      </div>}
      <div className="save-actions">
        <button className="solid-button" disabled={!canSave || saving} onClick={() => onSave({ caption, share, visibility })}><Save size={15} />{saving ? 'Saving…' : 'Save workout'}</button>
        <button className="ghost-button" onClick={onDiscard} disabled={saving}><Trash2 size={14} />Discard</button>
      </div>
    </section>
  )
}
