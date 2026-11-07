import { useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import MuscleHeatmap from '@/components/MuscleHeatmap'
import EffortDial, { zoneFor } from '@/components/EffortDial'
import { EXERCISE_DEMAND, muscleLoadFromDemand } from '@/lib/muscleModel'
import { ChapterLabel } from './primitives'
import { EASE, useBeat, usePinnedProgress } from './scroll'

// Illustrative sets — muscle demand comes from the app's real per-exercise model.
const SETS = [
  { id: 'squat', name: 'Back squat', detail: '5 × 5 · 100 kg', effort: 64, velocity: '-12%', form: 91 },
  { id: 'deadlift', name: 'Deadlift', detail: '3 × 3 · 140 kg', effort: 86, velocity: '-21%', form: 88 },
  { id: 'bench', name: 'Bench press', detail: '4 × 8 · 70 kg', effort: 72, velocity: '-16%', form: 93 },
]

export default function InsightChapter() {
  const ref = useRef<HTMLElement>(null)
  const progress = usePinnedProgress(ref)
  const beat = useBeat(progress, SETS.length)
  const set = SETS[beat]
  const summary = useMemo(() => muscleLoadFromDemand(EXERCISE_DEMAND[set.id] ?? {}), [set.id])
  const zone = zoneFor(set.effort)

  return (
    <section ref={ref} className="relative h-[320svh] bg-[#F4F1EA] text-[#0E0C0A]">
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-5 pt-14 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:pt-0">
          <div>
            <ChapterLabel index="05" title="The insight" />
            <h2 className="mt-4 text-[clamp(2.2rem,5vw,4.5rem)] font-bold uppercase leading-[0.9] tracking-[-0.02em]">
              Know what <span className="font-serifit normal-case italic tracking-normal text-primary">every set</span> did.
            </h2>
            <p className="mt-4 hidden max-w-md text-base leading-relaxed text-[#0E0C0A]/70 sm:block">
              Rep speed, form decay and range fuse into one effort score, so you know when a set was really done. Then see exactly which muscles carried it.
            </p>
            <div className="mt-6 flex gap-2">
              {SETS.map((item, i) => (
                <span key={item.id} className={`mono-data border-2 px-3 py-1.5 text-[9px] tracking-[0.2em] transition-colors ${i === beat ? 'border-[#0E0C0A] bg-[#0E0C0A] text-[#F4F1EA]' : 'border-[#0E0C0A]/20 text-[#0E0C0A]/50'}`}>
                  {item.name.toUpperCase()}
                </span>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-6">
              <div className="shrink-0"><EffortDial value={set.effort} size={128} /></div>
              <AnimatePresence mode="wait">
                <motion.dl key={set.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.35, ease: EASE }} className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div><dt className="mono-data text-[8px] tracking-[0.2em] text-[#0E0C0A]/55">SET</dt><dd className="text-sm font-bold">{set.detail}</dd></div>
                  <div><dt className="mono-data text-[8px] tracking-[0.2em] text-[#0E0C0A]/55">ZONE</dt><dd className="text-sm font-bold" style={{ color: zone.color }}>{zone.label}</dd></div>
                  <div><dt className="mono-data text-[8px] tracking-[0.2em] text-[#0E0C0A]/55">VELOCITY LOSS</dt><dd className="text-sm font-bold">{set.velocity}</dd></div>
                  <div><dt className="mono-data text-[8px] tracking-[0.2em] text-[#0E0C0A]/55">AVG FORM</dt><dd className="text-sm font-bold">{set.form}</dd></div>
                </motion.dl>
              </AnimatePresence>
            </div>
          </div>

          <div>
            <div className="relative">
            <div className="absolute -inset-3 -z-10 -rotate-1 bg-[#0E0C0A]" />
            <AnimatePresence mode="wait">
              <motion.div key={set.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.45, ease: EASE }} className="border-2 border-[#0E0C0A] bg-[#F9F7F2] px-6 pb-4 pt-6">
                <div className="mx-auto max-h-[52svh] max-w-[420px] [&_svg]:max-h-[52svh]">
                  <MuscleHeatmap summary={summary} social />
                </div>
              </motion.div>
            </AnimatePresence>
            </div>
            <p className="mono-data mt-6 text-[8px] leading-relaxed tracking-[0.14em] text-[#0E0C0A]/55">
              ESTIMATED TRAINING DEMAND FROM THE MOVEMENT, NOT EMG OR A MEDICAL MEASUREMENT.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
