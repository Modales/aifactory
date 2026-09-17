import { Activity, TriangleAlert } from 'lucide-react'
import type { AnalysisReport } from '@/lib/analysisApi'

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** Live stats while recording — time, reps, form — plus the latest coaching cue from the last completed rep. */
export default function LiveHud({ elapsed, report, working }: { elapsed: number; report: AnalysisReport | null; working: boolean }) {
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
          <span>{report?.exercise ? report.exerciseName : working ? 'Analyzing…' : 'Waiting for movement'}{lastRep ? ` · rep ${lastRep.index}` : ''}</span>
          {issue
            ? <p>{issue.cue}</p>
            : lastRep
              ? <p>Rep {lastRep.index} passed every visible check — keep that rhythm.</p>
              : <p>{report?.exercise ? 'Complete a full rep to get your first cue.' : 'Do one full rep from the side so the exercise can be identified.'}</p>}
          {report && !report.exercise && report.warnings[0] && <small>{report.warnings[0]}</small>}
        </div>
      </div>
    </>
  )
}
