import { Check, MessageSquareText, ShieldCheck, TriangleAlert } from 'lucide-react'
import { formatMeasure, type AnalysisReport } from '@/lib/analysisApi'

const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

/** Strava-style activity summary: headline, key stats, focus areas with measured angles, then rep evidence. */
export default function AnalysisResults({ report, working }: { report: AnalysisReport | null; working: boolean }) {
  if (!report) {
    return <section className="record-card pad"><p className="report-empty">{working ? 'Evaluating your movement…' : 'No analysis yet. Record a set to see measured joint angles and coaching cues.'}</p></section>
  }
  const scored = report.reps.filter(r => r.score !== null)
  return (
    <section className="record-card pad">
      <h2 className="report-headline">{report.headline}<span className="report-beta">EXPERIMENTAL</span></h2>
      <p className="report-sub">
        {report.exercise ? (report.selectionSource === 'confirmed' ? 'Exercise confirmed by you' : `Detected automatically · ${Math.round(report.confidence * 100)}% confidence`) : 'Exercise not yet identified'}
        {' · '}{report.views.map(v => `${v.view} view`).join(' + ')}
      </p>
      <div className="report-stats">
        <div><span>Reps</span><strong>{report.repCount}</strong></div>
        <div><span>Time</span><strong>{minutes(report.durationSeconds)}</strong></div>
        <div><span>Form</span><strong>{report.score ?? '—'}{report.score !== null && <small>/100</small>}</strong></div>
      </div>

      {report.focus.length > 0 && <>
        <p className="record-section-title">Focus areas</p>
        <div className="focus-list">
          {report.focus.map(f => (
            <div key={f.name} className={`focus-item ${f.passed ? '' : 'fail'}`}>
              {f.passed ? <Check size={16} /> : <TriangleAlert size={16} />}
              <div>
                <strong>{f.name}</strong>
                <div className="measure">Average <b>{formatMeasure(f.average, f.units)}</b> · target {f.target}{f.units === 'degrees' ? '°' : ''}{f.failedReps > 0 && <> · <b>{f.failedReps} of {f.totalReps}</b> reps missed</>}</div>
                <p>{f.cue}</p>
              </div>
            </div>
          ))}
        </div>
      </>}

      {report.coach && (report.coach.cues.length > 0 || report.coach.camera) && <>
        <p className="record-section-title">Coach notes</p>
        <div className="focus-list">
          {report.coach.cues.map(cue => <div key={cue} className="focus-item"><MessageSquareText size={16} /><div><p>{cue}</p></div></div>)}
          {report.coach.camera && <div className="focus-item"><MessageSquareText size={16} /><div><strong>Camera</strong><p>{report.coach.camera}</p></div></div>}
        </div>
      </>}

      {report.reps.length > 0 && <div className="rep-list">
        <p className="record-section-title">Rep by rep</p>
        {report.reps.map(rep => (
          <details key={rep.index}>
            <summary>
              <span>Rep {rep.index}</span><small>{rep.durationSeconds.toFixed(1)} s</small>
              <span className="rep-bar"><i style={{ width: `${rep.score ?? 0}%` }} /></span>
              <span className={`rep-score ${rep.score !== null && rep.score < 80 ? 'warn' : ''}`}>{rep.score ?? 'Not visible'}</span>
            </summary>
            {rep.checks.length ? rep.checks.map(c => (
              <div key={c.name} className={`check-row ${c.passed ? '' : 'fail'}`}>
                {c.passed ? <Check size={14} /> : <TriangleAlert size={14} />}
                <div><strong>{c.name}</strong><span className="measure">{formatMeasure(c.value, c.units)} · target {c.target}{c.units === 'degrees' ? '°' : ''} · {c.cameraId}</span><p>{c.cue}</p></div>
              </div>
            )) : <p className="report-empty">Joints were not visible enough to score this rep.</p>}
          </details>
        ))}
      </div>}

      {report.warnings.map(w => <p key={w} className="report-warning"><TriangleAlert size={14} />{w}</p>)}
      <div className="report-notes">
        <strong><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />What the camera can't see</strong>
        {report.notAssessed.map(n => <p key={n}>{n}</p>)}
        <p>{scored.length} of {report.repCount} reps had enough visible joints to score. {report.disclaimer}</p>
      </div>
    </section>
  )
}
