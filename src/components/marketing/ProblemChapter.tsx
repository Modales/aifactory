import { useRef } from 'react'
import { AnimatePresence, motion, useTransform } from 'framer-motion'
import { ChapterLabel } from './primitives'
import { EASE, useBeat, usePinnedProgress } from './scroll'

// One set, four frames: the photo changes with every beat as fatigue sets in.
const BEATS = [
  { rep: '01', form: 98, src: '/marketing/blind-01.jpg', focus: '55% 40%', alt: 'A lifter at the bottom of a barbell back squat in a power rack', tag: 'CLEAN', line: 'Rep one feels perfect.', sub: 'Fresh legs, sharp focus, textbook depth.' },
  { rep: '06', form: 84, src: '/marketing/blind-06.jpg', focus: '45% 45%', alt: 'A lifter squatting a loaded barbell with his knees pushed forward', tag: 'KNEES DRIFTING', line: 'By rep six, your knees drift in.', sub: "You can't see it from where you're standing." },
  { rep: '09', form: 67, src: '/marketing/blind-09.jpg', focus: '50% 40%', alt: 'An exhausted lifter resting his head on the barbell between reps', tag: 'BACK ROUNDING', line: 'At rep nine, your back starts to round.', sub: 'Fatigue rewrites your form one rep at a time.' },
  { rep: '10', form: 61, src: '/marketing/blind-10.jpg', focus: '50% 22%', alt: 'A sweaty lifter catching his breath alone on a gym bench', tag: 'NOBODY FLAGGED IT', line: "And nobody's there to tell you.", sub: 'A mirror only shows the front. A coach costs more than the gym.' },
]

const formColor = (form: number) => (form > 80 ? '#F4F1EA' : form > 65 ? '#FF7A1A' : '#E5341A')

export default function ProblemChapter() {
  const ref = useRef<HTMLElement>(null)
  const progress = usePinnedProgress(ref)
  const beat = useBeat(progress, BEATS.length)
  const danger = useTransform(progress, [0.2, 0.95], [0, 0.6])
  const current = BEATS[beat]

  return (
    <section id="story" ref={ref} className="relative h-[340svh]">
      <div className="sticky top-0 h-[100svh] overflow-hidden bg-[#0E0C0A]">
        {/* Photo sequence: crossfade + slow push-in per beat */}
        <AnimatePresence initial={false}>
          <motion.img
            key={current.src}
            src={current.src}
            alt={current.alt}
            decoding="async"
            draggable={false}
            initial={{ opacity: 0, scale: 1.12 }}
            animate={{ opacity: 1, scale: 1.02 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 0.9, ease: EASE }, scale: { duration: 6, ease: 'linear' } }}
            className="absolute inset-0 h-full w-full select-none object-cover brightness-[0.62] contrast-[1.08] saturate-[0.55]"
            style={{ objectPosition: current.focus }}
          />
        </AnimatePresence>
        {/* Preload the rest of the set */}
        <div className="hidden">{BEATS.map((b) => <img key={b.src} src={b.src} alt="" loading="lazy" />)}</div>

        <motion.div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,#7a0f05_100%)] mix-blend-multiply" style={{ opacity: danger }} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0E0C0A]/90 via-[#0E0C0A]/45 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0E0C0A]/60 via-transparent to-[#0E0C0A]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(0deg,#fff_0_1px,transparent_1px_3px)]" />

        {/* Camera-style frame marks */}
        <div className="pointer-events-none absolute inset-5 hidden md:block lg:inset-8">
          {['left-0 top-14 border-l-2 border-t-2', 'right-0 top-14 border-r-2 border-t-2', 'left-0 bottom-0 border-b-2 border-l-2', 'right-0 bottom-0 border-b-2 border-r-2'].map((c) => (
            <span key={c} className={`absolute h-6 w-6 border-[#F4F1EA]/50 ${c}`} />
          ))}
          <div className="mono-data absolute right-10 top-[4.5rem] flex items-center gap-2 text-[10px] tracking-[0.26em] text-[#F4F1EA]/70">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#E5341A]" /> REC · SET 3 · BACK SQUAT
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={current.tag}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="mono-data absolute bottom-10 right-10 border px-3 py-1.5 text-[10px] tracking-[0.26em]"
              style={{ color: formColor(current.form), borderColor: formColor(current.form) }}
            >
              {current.tag}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-center px-5">
          <ChapterLabel index="01" title="The blind spot" />
          <div className="mt-6 grid items-end gap-6 lg:grid-cols-[auto_1fr] lg:gap-14">
            <div className="flex items-end gap-3">
              <span className="mono-data pb-4 text-[10px] tracking-[0.3em] text-[#F4F1EA]/60">REP</span>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={current.rep}
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -80, opacity: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="text-outline-bone block text-[clamp(7rem,22vw,18rem)] font-bold leading-[0.8] tabular-nums"
                >
                  {current.rep}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="min-h-[11rem] max-w-2xl">
              <AnimatePresence mode="wait">
                <motion.div key={beat} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }} transition={{ duration: 0.45, ease: EASE }}>
                  <p className="text-[clamp(2rem,5vw,4rem)] font-bold leading-[0.95] tracking-tight">{current.line}</p>
                  <p className="font-serifit mt-4 text-xl italic text-[#F4F1EA]/75 md:text-2xl">{current.sub}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-10 grid max-w-3xl gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <div className="mono-data flex justify-between text-[10px] tracking-[0.26em] text-[#F4F1EA]/60">
                <span>FORM QUALITY</span>
                <span className="tabular-nums text-[#F4F1EA]">{current.form}</span>
              </div>
              <div className="mt-2 h-2 bg-white/10">
                <motion.div className="h-full" animate={{ width: `${current.form}%`, backgroundColor: formColor(current.form) }} transition={{ duration: 0.6, ease: EASE }} />
              </div>
            </div>
            {/* Filmstrip of the set */}
            <div className="flex gap-2">
              {BEATS.map((b, i) => (
                <div key={b.src} className={`relative h-14 w-20 overflow-hidden border-2 transition-all duration-500 ${i === beat ? 'border-primary' : 'border-[#F4F1EA]/20 opacity-50'}`}>
                  <img src={b.src} alt="" loading="lazy" className="h-full w-full object-cover grayscale" style={{ objectPosition: b.focus }} />
                  <span className="mono-data absolute bottom-0.5 left-1 text-[8px] tracking-[0.2em] text-[#F4F1EA]">{b.rep}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
