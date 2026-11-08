import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import PoseCanvas from '@/components/PoseCanvas'
import EffortDial, { zoneFor } from '@/components/EffortDial'
import { EXERCISES, type CameraAngle } from '@/lib/simulation'
import { EASE } from './Reveal'

const ORBIT: CameraAngle[] = ['Front', 'Three-quarter', 'Side', 'Rear three-quarter']
const VELOCITY = [0.64, 0.62, 0.6, 0.57, 0.53, 0.48, 0.42, 0.35] // m/s per rep, decaying
const CHAPTER_LABELS = ['SELECT', 'TRACK', 'MEASURE', 'FUSE']

interface StoryStageProps {
  /** active chapter 0–3 */
  chapter: number
  /** progress through the active chapter, 0–1 */
  progress: number
}

/** Pinned pose-tracking frame whose content is driven by the story's scroll position. */
export default function StoryStage({ chapter, progress }: StoryStageProps) {
  const [exIndex, setExIndex] = useState(0)

  // chapter 1 auditions every lift
  useEffect(() => {
    if (chapter !== 0) return
    const id = setInterval(() => setExIndex((i) => (i + 1) % EXERCISES.length), 1500)
    return () => clearInterval(id)
  }, [chapter])

  const exercise = chapter === 0 ? EXERCISES[exIndex] : EXERCISES[0]
  const angle =
    chapter === 1
      ? ORBIT[Math.min(ORBIT.length - 1, Math.floor(progress * ORBIT.length))]
      : chapter === 0
        ? exercise.bestAngle
        : 'Side'
  const effort = Math.round(18 + progress * 78)
  const severity = chapter === 3 ? (effort < 55 ? 'good' : effort < 80 ? 'warn' : 'crit') : 'good'

  return (
    <div className="hard-shadow-accent relative flex h-full flex-col border-2 border-foreground bg-foreground text-background">
      {/* chapter rail */}
      <div className="grid grid-cols-4 gap-px border-b border-background/20">
        {CHAPTER_LABELS.map((label, i) => (
          <div key={label} className="relative px-3 py-2">
            <span
              className={`mono-data text-[9px] tracking-[0.25em] transition-colors duration-500 sm:text-[10px] ${
                i === chapter ? 'text-background' : 'text-background/35'
              }`}
            >
              <span className="hidden sm:inline">{String(i + 1).padStart(2, '0')} </span>
              {label}
            </span>
            <span className="absolute inset-x-0 bottom-0 h-[2px] bg-background/10">
              <span
                className="block h-full origin-left bg-primary transition-transform duration-150"
                style={{ transform: `scaleX(${i < chapter ? 1 : i === chapter ? progress : 0})` }}
              />
            </span>
          </div>
        ))}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="bg-grid-dark absolute inset-0" />
        {/* giant chapter numeral */}
        <AnimatePresence mode="popLayout">
          <motion.span
            key={chapter}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 0.16, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-outline-bone pointer-events-none absolute -bottom-4 right-3 select-none text-[6rem] font-bold leading-none sm:text-[10rem]"
          >
            {String(chapter + 1).padStart(2, '0')}
          </motion.span>
        </AnimatePresence>

        <motion.div
          className="absolute inset-0"
          animate={{ scale: chapter === 2 ? 1.12 : chapter === 3 ? 0.92 : 1, x: chapter === 3 ? '-14%' : '0%' }}
          transition={{ duration: 0.9, ease: EASE }}
        >
          <PoseCanvas exercise={exercise} severity={severity} angle={angle} active />
        </motion.div>

        {['left-2 top-2 border-l-2 border-t-2', 'right-2 top-2 border-r-2 border-t-2', 'bottom-2 left-2 border-b-2 border-l-2', 'bottom-2 right-2 border-b-2 border-r-2'].map(
          (c) => (
            <span key={c} className={`absolute h-5 w-5 border-background/40 ${c}`} />
          ),
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={chapter}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="pointer-events-none absolute inset-0"
          >
            {chapter === 0 && (
              <div className="absolute left-4 top-4 space-y-1">
                {EXERCISES.map((e, i) => (
                  <p
                    key={e.id}
                    className={`mono-data text-[10px] tracking-[0.2em] transition-all duration-300 ${
                      i === exIndex ? 'translate-x-1 text-primary' : 'text-background/30'
                    }`}
                  >
                    {i === exIndex ? '▸ ' : ''}
                    {e.name.toUpperCase()}
                  </p>
                ))}
              </div>
            )}

            {chapter === 1 && (
              <div className="absolute left-4 top-4 flex flex-col gap-1">
                {ORBIT.map((a) => (
                  <span
                    key={a}
                    className={`mono-data w-fit border px-2 py-0.5 text-[10px] tracking-[0.2em] transition-colors duration-300 ${
                      a === angle ? 'border-primary bg-primary text-primary-foreground' : 'border-background/25 text-background/40'
                    }`}
                  >
                    {a.toUpperCase()}
                  </span>
                ))}
              </div>
            )}

            {chapter === 2 && (
              <div className="absolute right-4 top-4 w-36 border border-background/25 bg-foreground/80 p-3 backdrop-blur sm:w-44">
                <p className="mono-data text-[9px] tracking-[0.25em] text-background/50">REP VELOCITY m/s</p>
                <div className="mt-2 flex h-16 items-end gap-1">
                  {VELOCITY.map((v, i) => {
                    const shown = i < Math.max(1, Math.ceil(progress * VELOCITY.length))
                    return (
                      <span
                        key={i}
                        className={`flex-1 transition-all duration-300 ${i >= 6 ? 'bg-primary' : 'bg-background/70'}`}
                        style={{ height: shown ? `${(v / 0.64) * 100}%` : '4%', opacity: shown ? 1 : 0.2 }}
                      />
                    )
                  })}
                </div>
                <p className="mono-data mt-2 text-[10px] tracking-[0.15em]">
                  ROM {Math.round(112 - progress * 14)}° · {Math.round(186 - progress * 64)}°/s
                </p>
              </div>
            )}

            {chapter === 3 && (
              <div className="absolute right-4 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 border-2 border-background bg-background p-3 text-foreground sm:p-4">
                <EffortDial value={effort} size={120} />
                <span className="mono-data text-[10px] font-semibold tracking-[0.25em]" style={{ color: zoneFor(effort).color }}>
                  {zoneFor(effort).label}
                </span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mono-data flex items-center justify-between gap-3 border-t border-background/20 px-4 py-3 text-[10px] tracking-[0.2em] sm:text-[11px]">
        <span className="flex items-center gap-2 truncate">
          <span className="blink-rec inline-block h-2 w-2 shrink-0 rounded-full bg-primary" />
          {exercise.name.toUpperCase()}
        </span>
        <span className="truncate text-background/60">
          {chapter === 0
            ? `CAM ${exercise.recommendation.recommendedCamera.toUpperCase()} · ${exercise.recommendation.recommendedDistance}`
            : `VIEW ${String(angle).toUpperCase()}`}
        </span>
      </div>
    </div>
  )
}
