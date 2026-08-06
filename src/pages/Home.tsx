import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  Gauge,
  Move3d,
  ScanFace,
  Flame,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import PoseCanvas from '@/components/PoseCanvas'
import EffortDial, { zoneFor } from '@/components/EffortDial'
import OnboardingWizard from '@/components/OnboardingWizard'
import { EXERCISES } from '@/lib/simulation'
import { getStoredOnboarding } from '@/lib/workoutStore'

const EASE = [0.22, 1, 0.36, 1] as const

const rise = {
  hidden: { opacity: 0, y: 32 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.09, duration: 0.7, ease: EASE },
  }),
}

const FEATURES = [
  {
    icon: ScanFace,
    title: 'Exercise & AI Camera Setup',
    body: 'Select your movement — Squat, Deadlift, Bench, Press, Curl, or Lunge. The AI instantly recommends the optimal camera angle and distance guidance.',
  },
  {
    icon: Move3d,
    title: 'Biomechanical 3D Tracking',
    body: 'Continuous 12-joint skeleton posture estimation aligned to the camera viewpoint angle (Side, Front, Three-Quarter, Rear).',
  },
  {
    icon: Gauge,
    title: 'Velocity & Form Analytics',
    body: 'Rep-by-rep concentric and eccentric duration split, joint Range of Motion angles, and real-time angular speed (deg/s) telemetry.',
  },
  {
    icon: Flame,
    title: 'Effort & Strain Engine',
    body: 'Rep count, rep-velocity decay and form degradation fused into one 0–100 effort score to pinpoint true set completion.',
  },
]

const STEPS = [
  {
    icon: Camera,
    title: '1. Select Exercise',
    body: 'Pick your exercise and follow the AI placement guidance for distance and framing.',
  },
  {
    icon: Zap,
    title: '2. Start Lifting',
    body: 'Run live camera or demo mode. The AI tracks joint angles, rep velocity, and form severity in real time.',
  },
  {
    icon: Gauge,
    title: '3. Review Telemetry',
    body: 'Inspect rep-by-rep summary tables, velocity decay graphs, flaw tags, and coach feedback.',
  },
]

const TICKER = [
  'BACK SQUAT',
  'DEADLIFT',
  'BENCH PRESS',
  'OVERHEAD PRESS',
  'BICEP CURL',
  'WALKING LUNGE',
  'ANY ANGLE',
  'FORM SCORE',
  'REP COUNT',
  'EFFORT ENGINE',
]

/** Pointer-tracked tilt wrapper. */
function Tilt({ children, className }: { children: React.ReactNode; className?: string }) {
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [5, -5]), { stiffness: 160, damping: 18 })
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-5, 5]), { stiffness: 160, damping: 18 })
  return (
    <motion.div
      className={className}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        mx.set((e.clientX - r.left) / r.width - 0.5)
        my.set((e.clientY - r.top) / r.height - 0.5)
      }}
      onMouseLeave={() => {
        mx.set(0)
        my.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}

function Marquee({ dark = false }: { dark?: boolean }) {
  const row = (
    <>
      {TICKER.map((t) => (
        <span key={t} className="flex items-center gap-10">
          <span className="mono-data text-xs font-semibold tracking-[0.3em]">{t}</span>
          <span className="text-primary">✦</span>
        </span>
      ))}
    </>
  )
  return (
    <div
      className={`marquee-hover overflow-hidden border-y-2 border-foreground py-3 ${
        dark ? 'bg-foreground text-background' : 'bg-background text-foreground'
      }`}
    >
      <div className="animate-marquee flex w-max gap-10 whitespace-nowrap">
        <div className="flex gap-10">{row}</div>
        <div className="flex gap-10" aria-hidden>
          {row}
        </div>
      </div>
    </div>
  )
}

/** Live-ticking fake HUD numbers for the hero frame. */
function useHudTicker() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1400)
    return () => clearInterval(i)
  }, [])
  return {
    rep: (tick % 8) + 1,
    knee: 96 + ((tick * 37) % 40),
    form: 88 + ((tick * 13) % 11),
  }
}

export default function Home() {
  const hud = useHudTicker()
  const [reps, setReps] = useState(7)
  const [slow, setSlow] = useState(24)
  const [strain, setStrain] = useState(46)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const demoEffort = Math.max(3, Math.min(99, Math.round(6 + reps * 5.6 + slow * 0.62 + strain * 0.3)))
  const zone = zoneFor(demoEffort)

  useEffect(() => {
    const onboarding = getStoredOnboarding()
    if (!onboarding.completed) {
      setShowOnboarding(true)
    }
  }, [])

  return (
    <div className="min-h-screen touch-manipulation bg-background pb-20 lg:pb-0">
      <div className="noise" />

      {/* Onboarding Wizard Modal */}
      <OnboardingWizard
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-bold tracking-tight">
            AI FACTORY<span className="text-primary">*</span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <button
              type="button"
              onClick={() => setShowOnboarding(true)}
              className="underline-sweep mono-data text-xs tracking-[0.2em] font-bold text-primary hover:text-primary/80"
            >
              ONBOARDING WIZARD
            </button>
            <Link to="/history" className="underline-sweep mono-data text-xs tracking-[0.2em] font-bold text-foreground">
              PAST WORKOUTS
            </Link>
            {[
              ['The system', '#system'],
              ['Effort engine', '#effort'],
              ['Protocol', '#protocol'],
            ].map(([label, href]) => (
              <a key={href} href={href} className="underline-sweep mono-data text-xs tracking-[0.2em]">
                {label.toUpperCase()}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowOnboarding(true)}
              className="border-2 border-foreground font-mono text-xs font-bold"
            >
              ONBOARDING
            </Button>
            <Link to="/history" className="md:hidden">
              <Button size="sm" variant="outline" className="border-2 border-foreground font-bold text-xs">
                PAST WORKOUTS
              </Button>
            </Link>
            <Link to="/session">
              <Button className="hard-shadow-sm border-2 border-foreground font-bold transition-transform hover:-translate-y-0.5">
                START A SET <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b-2 border-foreground">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 lg:grid-cols-2 lg:gap-12 lg:py-24">
          <div>
            <motion.div variants={rise} initial="hidden" animate="show" custom={0}>
              <span className="mono-data inline-block -rotate-2 border-2 border-foreground bg-primary px-3 py-1 text-[10px] font-semibold tracking-[0.25em] text-primary-foreground">
                AI LIFTING COACH — HACKATHON BUILD
              </span>
            </motion.div>

            <motion.h1
              variants={rise}
              initial="hidden"
              animate="show"
              custom={1}
              className="mt-6 text-[2.6rem] font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl"
            >
              Your camera
              <br />
              is your new
              <br />
              <span className="font-serifit normal-case italic text-primary">coach.</span>
            </motion.h1>

            <motion.p
              variants={rise}
              initial="hidden"
              animate="show"
              custom={2}
              className="mt-6 max-w-md text-base text-muted-foreground sm:text-lg"
            >
              FormFit watches your set, names the exercise and the angle, grades every rep, and
              reads your effort off your speed, your reps and your face. No wearables. No logging.
            </motion.p>

            <motion.div
              variants={rise}
              initial="hidden"
              animate="show"
              custom={3}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4"
            >
              <Link to="/session" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="hard-shadow h-12 w-full border-2 border-foreground px-8 text-base font-bold transition-transform hover:-translate-y-1 sm:w-auto"
                >
                  <Camera className="mr-2 h-5 w-5" /> START LIFTING
                </Button>
              </Link>
              <Link to="/session" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="hard-shadow-sm h-12 w-full border-2 border-foreground bg-background px-8 text-base font-bold transition-transform hover:-translate-y-1 sm:w-auto"
                >
                  TRY DEMO MODE
                </Button>
              </Link>
            </motion.div>

            <motion.p
              variants={rise}
              initial="hidden"
              animate="show"
              custom={4}
              className="mono-data mt-8 text-[10px] tracking-[0.25em] text-muted-foreground"
            >
              06 LIFTS — 04 ANGLES — 00 WEARABLES
            </motion.p>
          </div>

          {/* pose-tracking frame with pointer parallax */}
          <motion.div
            initial={{ opacity: 0, x: 48, rotate: 2 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
          >
            <Tilt>
              <div className="hard-shadow-accent relative border-2 border-foreground bg-foreground">
                <div className="flex items-center justify-between border-b border-background/20 px-4 py-2">
                  <span className="mono-data text-[10px] tracking-[0.25em] text-background/60">
                    POSE_ENGINE v0.1
                  </span>
                  <span className="mono-data flex items-center gap-2 text-[10px] tracking-[0.25em] text-background/60">
                    <span className="blink-rec inline-block h-2 w-2 rounded-full bg-primary" />
                    TRACKING — 17 KEYPOINTS
                  </span>
                </div>
                <div className="relative aspect-[4/3]">
                  <div className="bg-grid-dark absolute inset-0" />
                  <PoseCanvas exercise={EXERCISES[0]} severity="good" active />
                  {['left-2 top-2 border-l-2 border-t-2', 'right-2 top-2 border-r-2 border-t-2', 'bottom-2 left-2 border-b-2 border-l-2', 'bottom-2 right-2 border-b-2 border-r-2'].map(
                    (c) => (
                      <span key={c} className={`absolute h-5 w-5 border-background/40 ${c}`} />
                    ),
                  )}
                  <span className="mono-data absolute -top-3 right-6 rotate-3 border-2 border-foreground bg-primary px-2 py-0.5 text-[10px] font-bold tracking-[0.2em] text-primary-foreground">
                    LIVE
                  </span>
                </div>
                <div className="mono-data flex items-center justify-between border-t border-background/20 px-4 py-3 text-[11px] tracking-[0.2em] text-background">
                  <span>BACK SQUAT</span>
                  <motion.span key={hud.rep} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                    REP {String(hud.rep).padStart(2, '0')} — KNEE {hud.knee}° — FORM {hud.form}
                  </motion.span>
                </div>
              </div>
            </Tilt>
          </motion.div>
        </div>
      </section>

      <Marquee dark />

      {/* ── System / features ──────────────────────────────── */}
      <section id="system" className="mx-auto max-w-7xl px-4 py-14 lg:py-20">
        <motion.div
          variants={rise}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          <p className="mono-data text-[10px] tracking-[0.3em] text-primary">01 — THE SYSTEM</p>
          <h2 className="mt-3 max-w-2xl text-4xl font-bold uppercase leading-none tracking-tight sm:text-5xl">
            Everything a coach sees,{' '}
            <span className="font-serifit normal-case italic text-primary">automated</span>
          </h2>
        </motion.div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              variants={rise}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
              custom={i}
            >
              <Tilt className="h-full">
                <div className="group flex h-full flex-col border-2 border-foreground bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:hard-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center border-2 border-foreground bg-foreground text-background transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <f.icon className="h-5 w-5" />
                    </div>
                    <span className="text-outline text-4xl font-bold">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-bold uppercase tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                  <ArrowUpRight className="mt-auto h-4 w-4 pt-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </Tilt>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Interactive effort engine ──────────────────────── */}
      <section id="effort" className="border-y-2 border-foreground bg-card">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 lg:grid-cols-2 lg:py-20">
          <motion.div
            variants={rise}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
          >
            <p className="mono-data text-[10px] tracking-[0.3em] text-primary">02 — EFFORT ENGINE</p>
            <h2 className="mt-3 text-4xl font-bold uppercase leading-none tracking-tight sm:text-5xl">
              Play with the{' '}
              <span className="font-serifit normal-case italic text-primary">score.</span>
            </h2>
            <p className="mt-4 max-w-md text-muted-foreground">
              This is the actual effort fusion logic from the telemetry engine. Adjust the variables below to see how rep count, velocity decay, and form degradation combine into a live Effort Score.
            </p>

            <div className="mt-10 space-y-8">
              {[
                { label: 'REPS INTO THE SET', value: reps, set: setReps, min: 1, max: 12, fmt: (v: number) => `${v} REPS` },
                { label: 'REP VELOCITY DECAY', value: slow, set: setSlow, min: 0, max: 40, fmt: (v: number) => `−${v}%` },
                { label: 'FORM DEGRADATION STRAIN', value: strain, set: setStrain, min: 0, max: 100, fmt: (v: number) => `${v}%` },
              ].map((s) => (
                <div key={s.label}>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="mono-data text-[10px] tracking-[0.25em] text-muted-foreground">
                      {s.label}
                    </label>
                    <span className="mono-data border-2 border-foreground bg-background px-2 py-0.5 text-xs font-semibold">
                      {s.fmt(s.value)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    value={s.value}
                    onChange={(e) => s.set(+e.target.value)}
                    className="w-full cursor-ew-resize accent-primary"
                  />
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="flex flex-col items-center gap-6"
          >
            <div className="hard-shadow border-2 border-foreground bg-background p-10">
              <EffortDial value={demoEffort} size={220} />
            </div>
            <motion.p
              key={zone.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mono-data border-2 border-foreground px-4 py-1.5 text-sm font-semibold tracking-[0.3em]"
              style={{ color: zone.color }}
            >
              {zone.label}
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ── Protocol / steps ───────────────────────────────── */}
      <section id="protocol" className="mx-auto max-w-7xl px-4 py-14 lg:py-20">
        <motion.div
          variants={rise}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          <p className="mono-data text-[10px] tracking-[0.3em] text-primary">03 — PROTOCOL</p>
          <h2 className="mt-3 text-4xl font-bold uppercase leading-none tracking-tight sm:text-5xl">
            Three steps. <span className="font-serifit normal-case italic text-primary">Zero setup.</span>
          </h2>
        </motion.div>

        <div className="relative mt-14 grid gap-10 md:grid-cols-3">
          <div className="absolute left-0 right-0 top-7 hidden border-t-2 border-dashed border-foreground/30 md:block" />
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              variants={rise}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
              custom={i}
              className="relative"
            >
              <div className="hard-shadow-sm relative z-10 flex h-14 w-14 items-center justify-center border-2 border-foreground bg-primary text-primary-foreground transition-transform duration-300 hover:rotate-6">
                <s.icon className="h-6 w-6" />
              </div>
              <p className="text-outline mt-6 text-6xl font-bold leading-none">{String(i + 1).padStart(2, '0')}</p>
              <h3 className="mt-3 text-xl font-bold uppercase tracking-tight">{s.title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <Marquee />

      {/* ── CTA ────────────────────────────────────────────── */}
      <section className="bg-foreground text-background">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-16 text-center lg:py-24">
          <motion.h2
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: EASE }}
            className="max-w-3xl text-4xl font-bold uppercase leading-tight tracking-tight sm:text-6xl"
          >
            Rack the weight.{' '}
            <span className="font-serifit normal-case italic text-primary">We'll count it.</span>
          </motion.h2>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
            className="mt-10"
          >
            <Link to="/session">
              <Button
                size="lg"
                className="hard-shadow-bone border-2 border-background px-10 text-base font-bold transition-transform hover:-translate-y-1"
              >
                OPEN THE SESSION ROOM <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
          <p className="mono-data mt-8 text-[10px] tracking-[0.25em] text-background/50">
            DEMO BUILD — ANALYSIS SIMULATED IN-BROWSER WHILE THE MODEL SHIPS
          </p>
        </div>
        <footer className="border-t border-background/20">
          <div className="mono-data mx-auto flex max-w-7xl items-center justify-between px-4 py-5 text-[10px] tracking-[0.25em] text-background/50">
            <span>FORMFIT* — HACKATHON BUILD</span>
            <span>CHALK &amp; IRON © 2026</span>
          </div>
        </footer>
      </section>

      {/* mobile sticky CTA */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-foreground bg-background lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="px-4 py-3">
          <Link to="/session">
            <Button className="hard-shadow-sm h-12 w-full border-2 border-foreground text-base font-bold">
              <Camera className="mr-2 h-5 w-5" /> START A SET
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
