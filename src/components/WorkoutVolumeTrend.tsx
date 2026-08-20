import { useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { HistoryItem } from '@/lib/api'

const DAYS = 14

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export default function WorkoutVolumeTrend({ workouts }: { workouts: HistoryItem[] }) {
  const { data, currentWeek, change } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const volumeByDay = new Map<string, number>()

    workouts.forEach((workout) => {
      const date = new Date(workout.createdAt)
      date.setHours(0, 0, 0, 0)
      volumeByDay.set(dayKey(date), (volumeByDay.get(dayKey(date)) ?? 0) + workout.totalReps)
    })

    const points = Array.from({ length: DAYS }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() - (DAYS - 1 - index))
      return {
        label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        reps: volumeByDay.get(dayKey(date)) ?? 0,
      }
    })
    const previous = points.slice(0, 7).reduce((sum, point) => sum + point.reps, 0)
    const current = points.slice(7).reduce((sum, point) => sum + point.reps, 0)
    const delta = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null
    return { data: points, currentWeek: current, change: delta }
  }, [workouts])

  return (
    <section className="mt-5 border-2 border-foreground bg-card p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mono-data text-[9px] tracking-[0.22em] text-muted-foreground">TRAINING VOLUME · LAST 14 DAYS</p>
          <p className="mt-1 text-2xl font-black tabular-nums">{currentWeek} <span className="mono-data text-[9px] font-medium text-muted-foreground">REPS THIS WEEK</span></p>
        </div>
        <p className={`mono-data text-xs font-bold ${change !== null && change < 0 ? 'text-destructive' : 'text-primary'}`}>
          {change === null ? 'NEW BASELINE' : `${change >= 0 ? '+' : ''}${change}% VS PRIOR WEEK`}
        </p>
      </div>
      <div className="mt-4 h-40 w-full" aria-label="Daily rep volume over the last 14 days">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={3} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value) => [`${value} reps`, 'Volume']} labelStyle={{ fontWeight: 700 }} />
            <Area type="monotone" dataKey="reps" stroke="#FF4D00" strokeWidth={3} fill="#FF4D00" fillOpacity={0.14} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
