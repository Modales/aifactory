import { Activity, TriangleAlert } from 'lucide-react'
import type { AnalysisReport, ExerciseId } from '@/lib/analysisApi'

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** Live stats while recording — time, reps, form — plus the latest coaching cue from the last completed rep. */
interface Props { elapsed: number; report: AnalysisReport | null; working: boolean; exercise: ExerciseId | ''; onExercise: (value: ExerciseId) => void }

export default function LiveHud({ elapsed, report, working, exercise, onExercise }: Props) {
  const lastRep = report?.reps.at(-1)
  const issue = lastRep?.checks.filter(c => !c.passed).sort((a, b) => a.score - b.score)[0]
  return (
    <>
      <div className="live-hud">
        <div><span>Time</span><strong className="rec">{clock(elapsed)}</strong></div>
        <div><span>Reps</span><strong>{report?.repCount ?? 0}</strong></div>
        <div><span>Form</span><strong>{report?.score ?? '—'}{report?.score != null && <small>/100</small>}</strong></div>
      </div>
      <div className={`live-cue ${issue ? 'warn' : ''}`}>
        {issue ? <TriangleAlert size={20} /> : <Activity size={20} />}
        <div>
          <span>{report?.exercise ? report.exerciseName : report?.proposal ? `${report.proposal.name} · new` : working ? 'Analyzing…' : 'Waiting for movement'}{report?.exercise === 'proposed' ? ' · new' : ''}{lastRep ? ` · rep ${lastRep.index}` : ''}</span>
          {issue
            ? <p>{issue.cue}</p>
            : lastRep
              ? <p>Rep {lastRep.index} passed every visible check — keep that rhythm.</p>
              : <p>{report?.exercise ? 'Complete a full rep to get your first cue.' : 'Do one full rep from the side so the exercise can be identified.'}</p>}
          {report && !report.exercise && report.warnings[0] && <small>{report.warnings[0]}</small>}
        </div>
      </div>
      {report?.exercise && !exercise && report.alternatives.length > 1 && (
        <div className="live-alternatives">
          <span>Detected {report.exerciseName.toLowerCase()} · {Math.round(report.confidence * 100)}%. Tap to confirm a variant:</span>
          <div className="chip-row">
            {report.alternatives.map(a => <button key={a.id} className="chip" aria-pressed={a.id === report.exercise} onClick={() => onExercise(a.id)}>{a.name}</button>)}
          </div>
        </div>
      )}
      {report && !report.exercise && report.candidates.length > 0 && (
        <div className="live-alternatives">
          <span>Looks like one of these — tap to confirm:</span>
          <div className="chip-row">
            {report.candidates.slice(0, 3).map(c => <button key={c.id} className="chip" onClick={() => onExercise(c.id)}>{c.name}</button>)}
          </div>
        </div>
      )}
    </>
  )
}
