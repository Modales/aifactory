import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ExerciseSummaryTable from '@/components/ExerciseSummaryTable'
import MuscleHeatmap from '@/components/MuscleHeatmap'
import { api } from '@/lib/api'
import type { HistoryItem, TelemetryLog } from '@/lib/api'

function WorkoutTelemetry({ sessions }: { sessions: HistoryItem[] }) {
  const [logs, setLogs] = useState<TelemetryLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all(sessions.map((session) => api.telemetry(session.id)))
      .then((data) => { if (!cancelled) setLogs(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load workout details') })
    return () => { cancelled = true }
  }, [sessions])

  if (error) return <p role="alert" className="mono-data border-2 border-destructive bg-destructive/10 px-3 py-2 text-xs tracking-wide text-destructive">{error}</p>
  if (!logs) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return <div className="space-y-6">{logs.map((log, index) => {
    const session = sessions[index]
    return <section key={log.sessionId} className="border-2 border-foreground bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-foreground bg-foreground px-4 py-3 text-background"><div><p className="mono-data text-[9px] tracking-[0.2em] text-primary">SET {index + 1}</p><h3 className="text-lg font-black uppercase">{log.exerciseName}</h3></div><p className="mono-data text-[10px]">{session.totalReps} REPS · {Math.round(session.durationSeconds)} SEC · {Math.round(session.avgFormScore)} FORM</p></div>
      <div className="space-y-4 p-4">
        {log.muscleLoad.entries.length > 0 && <MuscleHeatmap summary={log.muscleLoad} compact />}
        {Object.keys(log.flawCounts).length > 0 && <div className="flex flex-wrap gap-2">{Object.entries(log.flawCounts).map(([flaw, count]) => <span key={flaw} className="mono-data border-2 border-foreground px-2 py-1 text-[10px]">{flaw.toUpperCase()} ×{count}</span>)}</div>}
        <ExerciseSummaryTable reps={log.reps} />
      </div>
    </section>
  })}</div>
}

export default function TelemetryDialog({ sessions, onClose }: { sessions: HistoryItem[] | null; onClose: () => void }) {
  const totalReps = sessions?.reduce((sum, session) => sum + session.totalReps, 0) ?? 0
  return <Dialog open={sessions !== null} onOpenChange={(open) => !open && onClose()}><DialogContent className="hard-shadow max-h-[92dvh] overflow-y-auto border-2 border-foreground bg-card sm:max-w-4xl"><DialogHeader><DialogTitle className="font-serifit text-2xl italic">Complete workout session</DialogTitle><DialogDescription className="mono-data text-[10px] tracking-[0.25em]">{sessions?.length ?? 0} SETS — {totalReps} TOTAL REPS — FULL TELEMETRY</DialogDescription></DialogHeader>{sessions && <WorkoutTelemetry key={sessions.map((session) => session.id).join(':')} sessions={sessions} />}</DialogContent></Dialog>
}
