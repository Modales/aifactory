import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowRight, Loader2 } from 'lucide-react'
import WorkspaceHeader from '@/components/WorkspaceHeader'
import { Button } from '@/components/ui/button'
import TelemetryDialog from '@/components/TelemetryDialog'
import { api } from '@/lib/api'
import type { HistoryItem, HistoryStats } from '@/lib/api'
import { useAuth } from '@/lib/authContext'

const EASE = [0.22, 1, 0.36, 1] as const
const PAGE_SIZE = 10

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function scoreTone(score: number): string {
  if (score >= 85) return 'text-foreground'
  if (score >= 70) return 'text-primary'
  return 'text-destructive'
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-2 border-foreground bg-card p-4">
      <p className="mono-data text-[10px] tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-black tabular-nums">{value}</p>
      {sub && <p className="mono-data mt-1 text-[10px] tracking-wide text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default function HistoryPage() {
  const { user, status } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<HistoryStats | null>(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<HistoryItem[] | null>(null)
  const workoutSessions = useMemo(() => {
    const grouped = new Map<string, HistoryItem[]>()
    items.forEach((item) => {
      const key = item.workoutId ?? item.id
      grouped.set(key, [...(grouped.get(key) ?? []), item])
    })
    return [...grouped.values()]
  }, [items])

  useEffect(() => {
    if (status === 'anonymous') navigate('/login', { replace: true, state: { from: '/history' } })
  }, [status, navigate])

  useEffect(() => {
    if (status !== 'authenticated') return

    let cancelled = false
    Promise.all([api.history({ limit: PAGE_SIZE, offset }), api.stats()])
      .then(([page, s]) => {
        if (cancelled) return
        setItems(page.items)
        setTotal(page.total)
        setStats(s)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load history')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [status, offset])

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      <div className="noise" />

      <WorkspaceHeader
        status={<span className="mono-data truncate text-[9px] tracking-[0.15em] text-primary">{user?.displayName.toUpperCase()} · TRAINING LOG</span>}
        actions={
          <Link to="/session">
            <Button className="hard-shadow-sm border-2 border-foreground font-bold transition-transform hover:-translate-y-0.5">
              START A SET <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        }
      />

      <main className="mx-auto max-w-7xl px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <p className="mono-data text-xs tracking-[0.3em] text-muted-foreground">
            {user?.displayName.toUpperCase()} — TRAINING LOG
          </p>
          <h1 className="mt-2 text-4xl font-black uppercase leading-[0.95] sm:text-5xl">
            Past
            <span className="font-serifit italic lowercase text-primary"> workouts.</span>
          </h1>
        </motion.div>

        {error && (
          <p
            role="alert"
            className="mono-data mt-6 border-2 border-destructive bg-destructive/10 px-4 py-3 text-xs tracking-wide text-destructive"
          >
            {error}
          </p>
        )}

        {stats && stats.totalSessions > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="SESSIONS" value={String(stats.totalSessions)} />
            <StatTile label="TOTAL REPS" value={String(stats.totalReps)} />
            <StatTile
              label="AVG FORM"
              value={`${Math.round(stats.avgFormScore)}`}
              sub="ACROSS ALL SETS"
            />
            <StatTile
              label="TIME UNDER LOAD"
              value={formatDuration(stats.totalDurationSeconds)}
              sub="MIN:SEC"
            />
          </div>
        )}

        {stats && stats.topFlaws.length > 0 && (
          <div className="mt-3 border-2 border-foreground bg-card p-4">
            <p className="mono-data text-[10px] tracking-[0.25em] text-muted-foreground">
              MOST FREQUENT FLAWS
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {stats.topFlaws.map(([flaw, count]) => (
                <span
                  key={flaw}
                  className="mono-data border-2 border-foreground px-3 py-1 text-xs tracking-wide"
                >
                  {flaw.toUpperCase()} <span className="text-primary">×{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          {loading ? (
            <div className="flex items-center justify-center border-2 border-foreground bg-card py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="border-2 border-dashed border-foreground bg-card px-6 py-16 text-center">
              <p className="text-lg font-bold uppercase">No sets on record yet</p>
              <p className="mt-2 text-muted-foreground">
                Finish a set while signed in and it lands here automatically.
              </p>
              <Link to="/session" className="mt-6 inline-block">
                <Button className="hard-shadow-sm border-2 border-foreground font-bold">
                  START A SET <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workoutSessions.map((sets) => {
                const totalReps = sets.reduce((sum, set) => sum + set.totalReps, 0)
                const duration = sets.reduce((sum, set) => sum + set.durationSeconds, 0)
                const avgForm = sets.reduce((sum, set) => sum + set.avgFormScore, 0) / sets.length
                const exercises = [...new Set(sets.map((set) => set.exerciseName))]
                return <button key={sets[0].workoutId ?? sets[0].id} type="button" onClick={() => setSelected(sets)} className="hard-shadow border-2 border-foreground bg-card p-4 text-left transition-transform hover:-translate-y-1 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <div className="flex items-start justify-between gap-3"><div><p className="mono-data text-[10px] tracking-[0.2em] text-muted-foreground">{formatDate(sets[0].createdAt)}</p><h3 className="mt-1 text-xl font-black uppercase">Workout session</h3></div><span className="mono-data border-2 border-foreground bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">{sets.length} {sets.length === 1 ? 'SET' : 'SETS'}</span></div>
                  <p className="mt-3 min-h-10 text-sm font-bold">{exercises.join(' · ')}</p>
                  <div className="mt-4 grid grid-cols-3 border-t-2 border-foreground pt-3 text-center"><div><p className="text-xl font-black">{totalReps}</p><p className="mono-data text-[8px] text-muted-foreground">REPS</p></div><div><p className={scoreTone(avgForm)}>{Math.round(avgForm)}</p><p className="mono-data text-[8px] text-muted-foreground">AVG FORM</p></div><div><p className="text-xl font-black">{formatDuration(duration)}</p><p className="mono-data text-[8px] text-muted-foreground">DURATION</p></div></div>
                  <p className="mono-data mt-4 text-[9px] font-bold tracking-[0.16em] text-primary">VIEW ALL WORKOUTS, SETS &amp; REPS →</p>
                </button>
              })}
            </div>
          )}
          {items.length > 0 && (
            <p className="mono-data mt-3 text-[10px] tracking-[0.2em] text-muted-foreground">
              CLICK A SESSION CARD FOR EVERY SET AND REP
            </p>
          )}
        </div>

        {total > PAGE_SIZE && (
          <div className="mt-6 flex items-center justify-between">
            <p className="mono-data text-xs tracking-wide text-muted-foreground">
              SHOWING {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} OF {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => {
                  setLoading(true)
                  setOffset((o) => Math.max(0, o - PAGE_SIZE))
                }}
                className="border-2 border-foreground font-bold"
              >
                PREV
              </Button>
              <Button
                variant="outline"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => {
                  setLoading(true)
                  setOffset((o) => o + PAGE_SIZE)
                }}
                className="border-2 border-foreground font-bold"
              >
                NEXT
              </Button>
            </div>
          </div>
        )}
      </main>

      <TelemetryDialog sessions={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
