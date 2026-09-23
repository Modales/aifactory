import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import MuscleHeatmap from '@/components/MuscleHeatmap'
import type { SessionPayload } from '@/lib/api'
import type { MuscleLoadSummary } from '@/lib/muscleModel'

export default function WorkoutSummaryCard({ sets, muscleLoad }: { sets: SessionPayload[]; muscleLoad: MuscleLoadSummary }) {
  const [open, setOpen] = useState(false)
  const totalReps = sets.reduce((total, set) => total + set.totalReps, 0)
  const averageForm = Math.round(sets.reduce((total, set) => total + set.avgFormScore, 0) / Math.max(sets.length, 1))

  return <section className="border-2 border-foreground bg-secondary/30">
    <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted/50">
      <div><p className="mono-data text-[10px] font-bold tracking-[0.2em] text-primary">FULL WORKOUT LOGGED</p><p className="mt-1 text-sm text-muted-foreground">{sets.length} sets · {totalReps} reps</p></div>
      <div className="flex items-center gap-3"><div className="text-right"><p className="mono-data text-2xl font-bold">{averageForm}</p><p className="mono-data text-[8px] tracking-[0.16em] text-muted-foreground">AVG FORM</p></div><span className="flex items-center gap-1 border-2 border-foreground bg-background px-2 py-1.5 mono-data text-[9px] font-bold tracking-[0.12em]">{open ? 'HIDE SETS' : 'VIEW ALL SETS'}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} /></span></div>
    </button>
    {open && <div className="space-y-4 border-t-2 border-foreground p-4">
      <MuscleHeatmap summary={muscleLoad} />
      <div className="grid gap-3 sm:grid-cols-2">{sets.map((set, index) => <article key={`${set.exerciseId}-${index}`} className="border-2 border-foreground bg-background p-3"><div className="flex justify-between gap-2"><p className="font-bold">SET {index + 1} · {set.exerciseName}</p><span className="mono-data text-xs">{set.avgFormScore} FORM</span></div><p className="mono-data mt-1 text-[10px] text-muted-foreground">{set.totalReps} REPS · {Math.round(set.durationSeconds)} SEC</p><div className="mt-3"><MuscleHeatmap summary={set.muscleLoad} compact /></div></article>)}</div>
    </div>}
  </section>
}
