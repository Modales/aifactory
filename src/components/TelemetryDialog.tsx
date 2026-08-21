import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import MuscleHeatmap from '@/components/MuscleHeatmap'
import { api } from '@/lib/api'
import type { HistoryItem, TelemetryLog } from '@/lib/api'

const SEVERITY_STYLES: Record<string, string> = {
  good: 'border-emerald-700 text-emerald-700',
  warn: 'border-primary text-primary',
  crit: 'border-destructive text-destructive',
}

function TelemetryBody({ session }: { session: HistoryItem }) {
  const [log, setLog] = useState<TelemetryLog | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .telemetry(session.id)
      .then((data) => {
        if (!cancelled) setLog(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load telemetry')
      })

    return () => {
      cancelled = true
    }
  }, [session.id])

  if (error) {
    return (
      <p
        role="alert"
        className="mono-data border-2 border-destructive bg-destructive/10 px-3 py-2 text-xs tracking-wide text-destructive"
      >
        {error}
      </p>
    )
  }

  if (!log) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      {log.muscleLoad.entries.length > 0 && <MuscleHeatmap summary={log.muscleLoad} />}

      {Object.keys(log.flawCounts).length > 0 && (
        <div className="border-2 border-foreground bg-secondary/40 p-3">
          <p className="mono-data text-[10px] tracking-[0.25em] text-muted-foreground">
            FLAWS ACROSS THIS SET
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(log.flawCounts).map(([flaw, count]) => (
              <span
                key={flaw}
                className="mono-data border-2 border-foreground bg-background px-2 py-0.5 text-[11px] tracking-wide"
              >
                {flaw.toUpperCase()} <span className="text-primary">×{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto border-2 border-foreground">
        <table className="w-full min-w-[640px] text-left">
          <thead className="border-b-2 border-foreground bg-foreground text-background">
            <tr className="mono-data text-[10px] tracking-[0.2em]">
              <th className="px-3 py-2 font-medium">REP</th>
              <th className="px-3 py-2 text-right font-medium">TEMPO</th>
              <th className="px-3 py-2 text-right font-medium">ECC / CON</th>
              <th className="px-3 py-2 text-right font-medium">PEAK ANGLE</th>
              <th className="px-3 py-2 text-right font-medium">VELOCITY</th>
              <th className="px-3 py-2 text-right font-medium">FORM</th>
              <th className="px-3 py-2 font-medium">FLAWS</th>
            </tr>
          </thead>
          <tbody>
            {log.reps.map((rep, i) => (
              <tr key={rep.rep} className={i % 2 === 1 ? 'bg-secondary/30' : undefined}>
                <td className="px-3 py-2 font-bold tabular-nums">#{rep.rep}</td>
                <td className="mono-data px-3 py-2 text-right text-xs tabular-nums">
                  {rep.tempo.toFixed(2)}s
                </td>
                <td className="mono-data px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                  {rep.eccentricTime.toFixed(2)} / {rep.concentricTime.toFixed(2)}
                </td>
                <td className="mono-data px-3 py-2 text-right text-xs tabular-nums">
                  {Math.round(rep.peakAngle)}°
                </td>
                <td className="mono-data px-3 py-2 text-right text-xs tabular-nums">
                  {Math.round(rep.velocity)} °/s
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`mono-data border-2 px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                      SEVERITY_STYLES[rep.severity] ?? 'border-foreground'
                    }`}
                  >
                    {Math.round(rep.formScore)}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {rep.flaws && rep.flaws.length > 0 ? rep.flaws.join(', ') : rep.cue}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function TelemetryDialog({
  session,
  onClose,
}: {
  session: HistoryItem | null
  onClose: () => void
}) {
  return (
    <Dialog open={session !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="hard-shadow max-h-[92dvh] overflow-y-auto border-2 border-foreground bg-card sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-serifit text-2xl italic">
            Rep telemetry — {session?.exerciseName}
          </DialogTitle>
          <DialogDescription className="mono-data text-[10px] tracking-[0.25em]">
            {session?.totalReps} REPS — {session?.cameraAngle?.toUpperCase()} VIEW — AVG FORM{' '}
            {session ? Math.round(session.avgFormScore) : '—'}
          </DialogDescription>
        </DialogHeader>

        {session && <TelemetryBody key={session.id} session={session} />}
      </DialogContent>
    </Dialog>
  )
}
