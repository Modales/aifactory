import { useRef, useState } from 'react'
import { motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { Flame, Gauge, Move3d, ScanFace } from 'lucide-react'
import StoryStage from './StoryStage'
import { EASE } from './Reveal'

const CHAPTERS = [
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

/**
 * Scroll-driven walkthrough of the system: the pose frame stays pinned while
 * each chapter scrolls past and re-stages it. The active chapter is whichever
 * one is crossing the middle of the viewport.
 */
export default function StoryScroll() {
  const ref = useRef<HTMLOListElement>(null)
  const [chapter, setChapter] = useState(0)
  const [progress, setProgress] = useState(0)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start center', 'end center'] })

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const scaled = Math.min(0.9999, Math.max(0, v)) * CHAPTERS.length
    const next = Math.floor(scaled)
    setChapter((c) => (c === next ? c : next))
    setProgress(Math.round((scaled - next) * 50) / 50)
  })

  return (
    <section id="system" className="border-b-2 border-foreground">
      <div className="mx-auto max-w-7xl px-4 pt-14 lg:pt-20">
        <p className="mono-data text-[10px] tracking-[0.3em] text-primary">01 — THE SYSTEM</p>
        <h2 className="mt-3 max-w-2xl text-4xl font-bold uppercase leading-none tracking-tight sm:text-5xl">
          Everything a coach sees,{' '}
          <span className="font-serifit normal-case italic text-primary">automated</span>
        </h2>
        <p className="mono-data mt-4 text-[10px] tracking-[0.25em] text-muted-foreground">SCROLL TO RUN A SET ↓</p>
      </div>

      <div className="mx-auto grid max-w-7xl gap-x-12 px-4 lg:grid-cols-[1fr_1.15fr]">
        {/* pinned stage */}
        <div className="sticky top-[62px] z-10 -mx-4 h-[50vh] self-start bg-background px-4 py-4 lg:order-2 lg:mx-0 lg:h-[calc(100vh-62px)] lg:px-0 lg:py-10">
          <StoryStage chapter={chapter} progress={progress} />
        </div>

        {/* chapters */}
        <ol ref={ref} className="lg:order-1">
          {CHAPTERS.map((c, i) => {
            const active = i === chapter
            return (
              <li key={c.title} className="flex min-h-[70vh] items-center py-10 lg:min-h-[100vh]">
                <motion.div
                  animate={{ opacity: active ? 1 : 0.22, x: active ? 0 : -12 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="max-w-md"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-12 w-12 items-center justify-center border-2 border-foreground transition-colors duration-500 ${
                        active ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background'
                      }`}
                    >
                      <c.icon className="h-5 w-5" />
                    </div>
                    <span className="text-outline text-5xl font-bold leading-none">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="mt-6 text-3xl font-bold uppercase leading-none tracking-tight sm:text-4xl">{c.title}</h3>
                  <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{c.body}</p>
                </motion.div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
