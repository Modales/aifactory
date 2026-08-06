import { useState } from 'react'
import { Link } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Activity,
  Clock,
  Dumbbell,
  Gauge,
  RotateCcw,
  Trash2,
  TrendingUp,
  Zap,
  X,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Button } from '@/components/ui/button'
import ExerciseSummaryTable from '@/components/ExerciseSummaryTable'
import VelocityAngleChart from '@/components/VelocityAngleChart'
import OnboardingWizard from '@/components/OnboardingWizard'
import {
  getSessionHistory,
  clearSessionHistory,
  resetOnboarding,
  type StoredSession,
} from '@/lib/workoutStore'
import { EXERCISES } from '@/lib/simulation'

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

export default function PastWorkouts() {
  const [sessions, setSessions] = useState<StoredSession[]>(getSessionHistory)
  const [selectedExerciseFilter, setSelectedExerciseFilter] = useState<string>('all')
  const [activeSession, setActiveSession] = useState<StoredSession | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear all workout history?')) {
      clearSessionHistory()
      setSessions([])
      setActiveSession(null)
    }
  }

  const handleResetOnboarding = () => {
    resetOnboarding()
    setShowOnboarding(true)
  }

  const filteredSessions =
    selectedExerciseFilter === 'all'
      ? sessions
      : sessions.filter((s) => s.exerciseId === selectedExerciseFilter)

  // Calculate Summary Analytics
  const totalWorkouts = sessions.length
  const totalReps = sessions.reduce((acc, s) => acc + s.totalReps, 0)
  const avgFormScore =
    sessions.length > 0
      ? Math.round(sessions.reduce((acc, s) => acc + s.avgFormScore, 0) / sessions.length)
      : 0
  const bestFormScore =
    sessions.length > 0 ? Math.max(...sessions.map((s) => s.avgFormScore)) : 0
  const totalDuration = sessions.reduce((acc, s) => acc + s.durationSeconds, 0)

  // Chart Data Preparation (Chronological)
  const chartData = [...sessions].reverse().map((s, idx) => ({
    name: `Sess ${idx + 1}`,
    date: formatDate(s.timestamp),
    exercise: s.exerciseName,
    formScore: s.avgFormScore,
    reps: s.totalReps,
    peakEffort: s.peakEffort,
    duration: Math.round(s.durationSeconds / 60),
  }))

  return (
    <div className="min-h-screen bg-background pb-20 text-foreground">
      <div className="noise" />

      {/* Onboarding Wizard Modal Trigger */}
      <OnboardingWizard
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />

      {/* Terminal Header */}
      <header className="sticky top-0 z-40 border-b-4 border-foreground bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button size="sm" variant="outline" className="h-8 border-2 border-foreground bg-card px-2 text-xs font-bold">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> HOME
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="mono-data border-2 border-foreground bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground hard-shadow-sm">
                TERMINAL
              </div>
              <span className="mono-data hidden text-xs font-bold tracking-widest sm:inline">
                AI FACTORY // PAST WORKOUTS ARCHIVE
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/session">
              <Button size="sm" className="hard-shadow-sm h-8 border-2 border-foreground bg-primary text-xs font-bold text-primary-foreground">
                <Zap className="mr-1 h-3.5 w-3.5" /> NEW WORKOUT
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={handleResetOnboarding}
              className="h-8 border-2 border-foreground text-[10px] font-bold"
              title="Reset Onboarding Wizard"
            >
              <RotateCcw className="mr-1 h-3 w-3" /> ONBOARDING WIZARD
            </Button>
          </div>
        </div>
      </header>

      {/* Main Terminal Body */}
      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6 sm:px-6">
        {/* Terminal Header Banner */}
        <div className="hard-shadow flex flex-col gap-3 border-4 border-foreground bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mono-data flex items-center gap-2 text-xs font-bold text-primary">
              <Activity className="h-4 w-4" /> HISTORICAL TELEMETRY CONSOLE
            </div>
            <h1 className="font-serifit text-3xl font-bold tracking-tight">Past Workouts Archive</h1>
            <p className="text-xs text-muted-foreground">
              Inspected historical sessions, form degradation trends, and rep velocity telemetry.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2 sm:pt-0">
            {sessions.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearHistory}
                className="h-8 border-2 border-destructive bg-destructive/10 text-xs font-bold text-destructive hover:bg-destructive hover:text-white"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> CLEAR HISTORY
              </Button>
            )}
          </div>
        </div>

        {/* 1. TOP SUMMARY SECTION */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="hard-shadow-sm border-2 border-foreground bg-card p-3 text-center">
            <p className="mono-data text-2xl font-bold text-primary">{totalWorkouts}</p>
            <p className="mono-data mt-0.5 text-[9px] font-bold tracking-widest text-muted-foreground">
              TOTAL WORKOUTS
            </p>
          </div>

          <div className="hard-shadow-sm border-2 border-foreground bg-card p-3 text-center">
            <p className="mono-data text-2xl font-bold text-foreground">{totalReps}</p>
            <p className="mono-data mt-0.5 text-[9px] font-bold tracking-widest text-muted-foreground">
              TOTAL REPS
            </p>
          </div>

          <div className="hard-shadow-sm border-2 border-foreground bg-card p-3 text-center">
            <p className="mono-data text-2xl font-bold text-emerald-600">{avgFormScore}%</p>
            <p className="mono-data mt-0.5 text-[9px] font-bold tracking-widest text-muted-foreground">
              AVG FORM SCORE
            </p>
          </div>

          <div className="hard-shadow-sm border-2 border-foreground bg-card p-3 text-center">
            <p className="mono-data text-2xl font-bold text-amber-600">{bestFormScore}%</p>
            <p className="mono-data mt-0.5 text-[9px] font-bold tracking-widest text-muted-foreground">
              BEST FORM SCORE
            </p>
          </div>

          <div className="hard-shadow-sm col-span-2 border-2 border-foreground bg-card p-3 text-center sm:col-span-1">
            <p className="mono-data text-2xl font-bold text-foreground">{formatDuration(totalDuration)}</p>
            <p className="mono-data mt-0.5 text-[9px] font-bold tracking-widest text-muted-foreground">
              TOTAL DURATION
            </p>
          </div>
        </div>

        {/* 2. TREND ANALYTICS CHARTS SECTION */}
        {sessions.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Form Score Trend Chart */}
            <div className="hard-shadow-sm border-2 border-foreground bg-card p-4">
              <div className="flex items-center justify-between border-b-2 border-foreground/20 pb-2 mb-4">
                <span className="mono-data flex items-center gap-1.5 text-xs font-bold text-primary">
                  <TrendingUp className="h-4 w-4" /> FORM SCORE TREND OVER TIME
                </span>
                <span className="mono-data text-[9px] text-muted-foreground">% ACCURACY</span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" fontSize={10} fontFamily="monospace" />
                    <YAxis domain={[60, 100]} stroke="#6b7280" fontSize={10} fontFamily="monospace" />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload
                          return (
                            <div className="mono-data border-2 border-foreground bg-card p-2 text-xs shadow-md">
                              <p className="font-bold text-primary">{data.exercise}</p>
                              <p className="text-[10px] text-muted-foreground">{data.date}</p>
                              <p className="mt-1 font-bold text-emerald-600">Form Score: {data.formScore}%</p>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="formScore"
                      stroke="#FF4D00"
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#FF4D00', stroke: '#14110E', strokeWidth: 2 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Total Reps per Workout Bar Chart */}
            <div className="hard-shadow-sm border-2 border-foreground bg-card p-4">
              <div className="flex items-center justify-between border-b-2 border-foreground/20 pb-2 mb-4">
                <span className="mono-data flex items-center gap-1.5 text-xs font-bold text-primary">
                  <BarChart className="h-4 w-4" /> REPS COMPLETED PER WORKOUT
                </span>
                <span className="mono-data text-[9px] text-muted-foreground">VOLUME</span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" fontSize={10} fontFamily="monospace" />
                    <YAxis stroke="#6b7280" fontSize={10} fontFamily="monospace" />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload
                          return (
                            <div className="mono-data border-2 border-foreground bg-card p-2 text-xs shadow-md">
                              <p className="font-bold text-primary">{data.exercise}</p>
                              <p className="text-[10px] text-muted-foreground">{data.date}</p>
                              <p className="mt-1 font-bold text-foreground">Total Reps: {data.reps}</p>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Bar dataKey="reps" fill="#14110E" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : null}

        {/* 3. WORKOUT HISTORY SESSION CARDS SECTION */}
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b-2 border-foreground/20 pb-3">
            <h2 className="mono-data flex items-center gap-2 text-sm font-bold tracking-widest text-primary">
              <Clock className="h-4 w-4" /> SESSION LOGS ({filteredSessions.length})
            </h2>

            {/* Exercise Filter Dropdown */}
            <div className="flex items-center gap-2">
              <span className="mono-data text-[10px] font-bold text-muted-foreground">FILTER:</span>
              <select
                value={selectedExerciseFilter}
                onChange={(e) => setSelectedExerciseFilter(e.target.value)}
                className="mono-data h-8 border-2 border-foreground bg-card px-2 text-xs font-bold text-foreground shadow-sm focus:outline-none"
              >
                <option value="all">ALL MOVEMENTS</option>
                {EXERCISES.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="hard-shadow border-4 border-dashed border-foreground/30 bg-card p-8 text-center">
              <Dumbbell className="mx-auto h-10 w-10 text-muted-foreground" />
              <h3 className="font-serifit mt-3 text-xl font-bold">No Workout Sessions Found</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Perform a live or simulated workout in AI Factory to generate historical telemetry logs.
              </p>
              <Link to="/session" className="mt-4 inline-block">
                <Button size="sm" className="hard-shadow-sm border-2 border-foreground bg-primary font-bold text-primary-foreground">
                  <Zap className="mr-1.5 h-4 w-4" /> START WORKOUT NOW
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredSessions.map((sess) => (
                <motion.div
                  key={sess.id}
                  layout
                  whileHover={{ y: -3 }}
                  className="hard-shadow flex flex-col justify-between border-2 border-foreground bg-card p-4 transition-all"
                >
                  <div className="space-y-3">
                    {/* Card Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-serifit text-xl font-bold leading-tight">{sess.exerciseName}</h3>
                        <p className="mono-data text-[10px] text-muted-foreground">
                          {formatDate(sess.timestamp)}
                        </p>
                      </div>
                      <span className="mono-data border border-foreground bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">
                        {sess.cameraAngle.toUpperCase()} VIEW
                      </span>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 border-y border-foreground/20 py-2.5 text-center font-mono">
                      <div>
                        <span className="text-[9px] text-muted-foreground block">REPS</span>
                        <span className="text-lg font-bold text-foreground">{sess.totalReps}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-muted-foreground block">AVG FORM</span>
                        <span className="text-lg font-bold text-emerald-600">{sess.avgFormScore}%</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-muted-foreground block">PEAK EFFORT</span>
                        <span className="text-lg font-bold text-amber-600">{sess.peakEffort}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Action */}
                  <div className="mt-4 pt-2">
                    <Button
                      size="sm"
                      onClick={() => setActiveSession(sess)}
                      className="w-full border-2 border-foreground bg-foreground font-mono text-xs font-bold text-background hover:bg-primary hover:text-primary-foreground"
                    >
                      <Gauge className="mr-1.5 h-3.5 w-3.5" /> INSPECT TELEMETRY
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 4. DETAILED SESSION TELEMETRY MODAL */}
      <AnimatePresence>
        {activeSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="hard-shadow relative flex max-h-[90vh] w-full max-w-4xl flex-col border-4 border-foreground bg-card text-foreground overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b-4 border-foreground bg-primary px-5 py-3 text-primary-foreground">
                <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-widest">
                  <Activity className="h-4 w-4" /> SESSION TELEMETRY DEEP-DIVE // {activeSession.exerciseName.toUpperCase()}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSession(null)}
                  className="rounded p-1 hover:bg-primary-foreground/20"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Scroll Body */}
              <div className="overflow-y-auto p-6 space-y-6">
                {/* Meta Overview Banner */}
                <div className="grid grid-cols-2 gap-3 border-2 border-foreground bg-background p-4 font-mono sm:grid-cols-4">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">TIMESTAMP</span>
                    <span className="font-bold text-xs">{formatDate(activeSession.timestamp)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">DURATION</span>
                    <span className="font-bold text-xs">{formatDuration(activeSession.durationSeconds)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">TOTAL REPS</span>
                    <span className="font-bold text-xs text-primary">{activeSession.totalReps}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">AVG FORM</span>
                    <span className="font-bold text-xs text-emerald-600">{activeSession.avgFormScore}%</span>
                  </div>
                </div>

                {/* Velocity & Range of Motion Telemetry Chart */}
                <div className="border-2 border-foreground bg-card p-4">
                  <div className="flex items-center gap-2 border-b-2 border-foreground/20 pb-2 mb-3">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="mono-data text-xs font-bold">REP VELOCITY & RANGE OF MOTION TELEMETRY</span>
                  </div>
                  <VelocityAngleChart
                    reps={activeSession.reps}
                    targetAngle={activeSession.exerciseId === 'squat' ? 110 : 90}
                  />
                </div>

                {/* Rep-by-Rep Breakdown Table */}
                <div className="border-2 border-foreground bg-card p-4">
                  <div className="flex items-center gap-2 border-b-2 border-foreground/20 pb-2 mb-3">
                    <Gauge className="h-4 w-4 text-primary" />
                    <span className="mono-data text-xs font-bold">REP-BY-REP BREAKDOWN TABLE</span>
                  </div>
                  <ExerciseSummaryTable reps={activeSession.reps} />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end border-t-4 border-foreground bg-muted p-4">
                <Button
                  size="sm"
                  onClick={() => setActiveSession(null)}
                  className="hard-shadow-sm border-2 border-foreground bg-foreground font-mono text-xs font-bold text-background"
                >
                  CLOSE TELEMETRY VIEW
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
