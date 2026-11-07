import { useRef } from 'react'
import { AnimatePresence, motion, useTransform } from 'framer-motion'
import { ChapterLabel, CoverFrame } from './primitives'
import { EASE, useBeat, usePinnedProgress } from './scroll'
import FatigueFigure from './FatigueFigure'

const BEATS = [
  { rep: '01', form: 98, fatigue: 0, line: 'Rep one feels perfect.', sub: 'Fresh legs, sharp focus, textbook depth.' },
  { rep: '06', form: 84, fatigue: 0.4, line: 'By rep six, your knees drift in.', sub: "You can't see it from where you're standing." },
  { rep: '09', form: 67, fatigue: 0.75, line: 'At rep nine, your back starts to round.', sub: 'Fatigue rewrites your form one rep at a time.' },
  { rep: '10', form: 61, fatigue: 1, line: "And nobody's there to tell you.", sub: 'A mirror only shows the front. A coach costs more than the gym.' },
]

export default function ProblemChapter() {
  const ref = useRef<HTMLElement>(null)
  const progress = usePinnedProgress(ref)
  const beat = useBeat(progress, BEATS.length)
  const scale = useTransform(progress, [0, 1], [1, 1.28])
  const danger = useTransform(progress, [0.2, 0.95], [0, 0.55])
  const figureY = useTransform(progress, [0, 1], [30, -30])
  const current = BEATS[beat]

  return (
    <section id="story" ref={ref} className="relative h-[340svh]">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <CoverFrame src="/marketing/barbell-floor.jpg" alt="Close-up of hands gripping a loaded barbell on a gym floor" ratio={1.5} focus={[0.4, 0.5]} style={{ scale }} imgClassName="brightness-[0.45] saturate-[0.6]" />
        <motion.div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#7a0f05_100%)]" style={{ opacity: danger }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0E0C0A]/70 via-transparent to-[#0E0C0A]" />

        <div className="relative mx-auto grid h-full max-w-7xl content-center items-center gap-6 px-5 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:pt-0">
          <motion.div className="order-first lg:order-last" style={{ y: figureY }}>
            <FatigueFigure beat={beat} rep={Number(current.rep)} fatigue={current.fatigue} />
          </motion.div>

          <div>
            <ChapterLabel index="01" title="The blind spot" />
            <div className="mt-4 flex items-end gap-3 lg:mt-6">
              <span className="mono-data pb-3 text-[10px] tracking-[0.3em] text-[#F4F1EA]/60">REP</span>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={current.rep}
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -80, opacity: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="text-outline-bone block text-[clamp(4.5rem,13vw,11rem)] font-bold leading-[0.8] tabular-nums"
                >
                  {current.rep}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="mt-4 min-h-[6.5rem] max-w-2xl lg:mt-6 lg:min-h-[9rem]">
              <AnimatePresence mode="wait">
                <motion.div key={beat} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }} transition={{ duration: 0.45, ease: EASE }}>
                  <p className="text-[clamp(1.7rem,4vw,3.4rem)] font-bold leading-[0.95] tracking-tight">{current.line}</p>
                  <p className="font-serifit mt-3 hidden text-xl italic text-[#F4F1EA]/70 sm:block md:text-2xl">{current.sub}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="mt-6 max-w-xl lg:mt-10">
              <div className="mono-data flex justify-between text-[10px] tracking-[0.26em] text-[#F4F1EA]/60">
                <span>FORM QUALITY</span>
                <span className="tabular-nums text-[#F4F1EA]">{current.form}</span>
              </div>
              <div className="mt-2 h-2 bg-white/10">
                <motion.div
                  className="h-full"
                  animate={{ width: `${current.form}%`, backgroundColor: current.form > 80 ? '#F4F1EA' : current.form > 65 ? '#FF7A1A' : '#E5341A' }}
                  transition={{ duration: 0.6, ease: EASE }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
