import { useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, Globe, Save, Trash2, Users } from 'lucide-react'
import type { AnalysisReport } from '@/lib/analysisApi'

interface Props {
  report: AnalysisReport | null
  working: boolean
  saving: boolean
  saved: boolean
  onSave: (options: { caption: string; share: boolean; visibility: 'public' | 'followers' }) => void
  onDiscard: () => void
}

/** Strava-style "save activity" card: title, who can see it, save or discard. */
export default function SavePanel({ report, working, saving, saved, onSave, onDiscard }: Props) {
  const [caption, setCaption] = useState('')
  const [share, setShare] = useState(true)
  const [visibility, setVisibility] = useState<'public' | 'followers'>('followers')
  const canSave = !!report?.analysisId && report.score !== null && report.repCount > 0

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
      {!canSave && !working && <p className="report-empty">A set needs at least one fully visible rep to be saved. Move so your whole body stays in frame and try again.</p>}
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
