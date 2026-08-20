import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowRight, Loader2 } from 'lucide-react'
import AppNavigation from '@/components/AppNavigation'
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
  const [selected, setSelected] = useState<HistoryItem | null>(null)

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
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <div className="noise" />

      <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-bold tracking-tight">
            FORMFIT<span className="text-primary">*</span>
          </Link>
          <div className="flex items-center gap-2">
            <AppNavigation />
            <Link to="/session">
              <Button className="hard-shadow-sm border-2 border-foreground font-bold transition-transform hover:-translate-y-0.5">
                START A SET <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

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
            <div className="hard-shadow overflow-x-auto border-2 border-foreground bg-card">
              <table className="w-full min-w-[720px] text-left">
                <thead className="border-b-2 border-foreground bg-foreground text-background">
                  <tr className="mono-data text-[10px] tracking-[0.2em]">
                    <th className="px-4 py-3 font-medium">DATE</th>
                    <th className="px-4 py-3 font-medium">EXERCISE</th>
                    <th className="px-4 py-3 font-medium">ANGLE</th>
                    <th className="px-4 py-3 text-right font-medium">REPS</th>
                    <th className="px-4 py-3 text-right font-medium">DURATION</th>
                    <th className="px-4 py-3 text-right font-medium">AVG FORM</th>
                    <th className="px-4 py-3 text-right font-medium">PEAK EFFORT</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelected(item)}
                      className={`cursor-pointer transition-colors hover:bg-primary/10 ${
                        i % 2 === 1 ? 'bg-secondary/40' : ''
                      }`}
                    >
                      <td className="mono-data px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-bold">{item.exerciseName}</td>
                      <td className="mono-data px-4 py-3 text-xs">{item.cameraAngle}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">
                        {item.totalReps}
                      </td>
                      <td className="mono-data px-4 py-3 text-right text-xs tabular-nums">
                        {formatDuration(item.durationSeconds)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-bold tabular-nums ${scoreTone(item.avgFormScore)}`}
                      >
                        {Math.round(item.avgFormScore)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">
                        {Math.round(item.peakEffort)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {items.length > 0 && (
            <p className="mono-data mt-3 text-[10px] tracking-[0.2em] text-muted-foreground">
              CLICK A ROW FOR REP-BY-REP TELEMETRY
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

      <TelemetryDialog session={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
