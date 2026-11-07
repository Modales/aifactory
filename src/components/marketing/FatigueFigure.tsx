import { useRef, useState } from 'react'
import { AnimatePresence, motion, useAnimationFrame } from 'framer-motion'
import { EASE } from './scroll'

// Side-view squat rig. `fatigue` (0→1) slows the rep, cuts depth, drifts the knees and rounds the back.
const ANKLE = [210, 440] as const
const SHIN = 112
const THIGH = 118
const TORSO = 150
const rad = (deg: number) => (deg * Math.PI) / 180

function pose(t: number, fatigue: number) {
  const shinA = rad(t * (32 + fatigue * 12))
  const thighA = rad(t * (98 - fatigue * 30))
  const torsoA = rad(t * (38 + fatigue * 22))
  const knee = [ANKLE[0] + SHIN * Math.sin(shinA), ANKLE[1] - SHIN * Math.cos(shinA)]
  const hip = [knee[0] - THIGH * Math.sin(thighA), knee[1] - THIGH * Math.cos(thighA)]
  const dir = [Math.sin(torsoA), -Math.cos(torsoA)]
  const back = [-Math.cos(torsoA), -Math.sin(torsoA)]
  const shoulder = [hip[0] + TORSO * dir[0], hip[1] + TORSO * dir[1]]
  const bulge = fatigue * 34 * (0.35 + t)
  const spineCtrl = [(hip[0] + shoulder[0]) / 2 + back[0] * bulge, (hip[1] + shoulder[1]) / 2 + back[1] * bulge]
  const head = [shoulder[0] + dir[0] * 25 + 12, shoulder[1] + dir[1] * 25 - 6]
  const bar = [shoulder[0] + back[0] * 12, shoulder[1] + back[1] * 12]
  const elbow = [shoulder[0] - back[0] * 22 - dir[0] * 20, shoulder[1] - back[1] * 22 - dir[1] * 20 + 18]
  return { knee, hip, shoulder, spineCtrl, head, bar, elbow }
}

const P = (p: readonly number[]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`

export const REP_FORM = [98, 97, 95, 92, 88, 84, 79, 73, 67, 61]
const OK = '#B8F25C'
const WARN = '#FF7A1A'
const BAD = '#E5341A'

export default function FatigueFigure({ beat, rep, fatigue }: { beat: number; rep: number; fatigue: number }) {
  const [t, setT] = useState(0)
  const phase = useRef(0)
  useAnimationFrame((_, delta) => {
    phase.current += delta / (2100 + fatigue * 1500)
    const wave = (1 - Math.cos(phase.current * Math.PI * 2)) / 2
    setT(Math.round(wave * 400) / 400)
  })

  const p = pose(t, fatigue)
  const kneeBad = beat >= 1
  const backBad = beat >= 2
  const kneeColor = beat >= 3 ? BAD : kneeBad ? WARN : OK
  const backColor = backBad ? BAD : OK
  const depth = Math.round(t * (98 - fatigue * 30))
  const mono = { fontFamily: 'ui-monospace,monospace', fontSize: 11, letterSpacing: 1.5 }

  return (
    <div className="relative border-2 border-[#F4F1EA]/80 bg-[#0E0C0A]/75 shadow-[8px_8px_0_#FF4F12] backdrop-blur-sm">
      <div className="mono-data flex items-center justify-between border-b border-[#F4F1EA]/15 px-4 py-2.5 text-[9px] tracking-[0.24em] text-[#F4F1EA]/60">
        <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#E5341A]" />BACK SQUAT · SIDE VIEW</span>
        <span className="tabular-nums text-[#F4F1EA]">REP {rep}/10</span>
      </div>

      <svg viewBox="0 0 400 470" className="block h-[26svh] w-full lg:h-[min(46svh,26rem)]" role="img" aria-label="A lifter squatting whose form breaks down with every rep">
        <defs>
          <pattern id="fatigue-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="#F4F1EA" strokeOpacity="0.06" />
          </pattern>
        </defs>
        <rect width="400" height="470" fill="url(#fatigue-grid)" />
        <line x1={196} y1={60} x2={196} y2={300} stroke="#F4F1EA" strokeOpacity="0.25" strokeDasharray="4 7" />
        <line x1={110} y1={450} x2={330} y2={450} stroke="#F4F1EA" strokeOpacity="0.35" strokeWidth={2} />

        <g stroke="#F4F1EA" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d={`M195 444L${ANKLE[0] + 40} 444`} strokeWidth={9} />
          <path d={`M${P(ANKLE)}L${P(p.knee)}`} strokeWidth={14} />
          <path d={`M${P(p.knee)}L${P(p.hip)}`} strokeWidth={18} />
          <path d={`M${P(p.hip)}Q${P(p.spineCtrl)} ${P(p.shoulder)}`} strokeWidth={20} stroke={backBad ? BAD : '#F4F1EA'} style={{ transition: 'stroke 0.5s' }} />
          <path d={`M${P(p.shoulder)}L${P(p.elbow)}L${P(p.bar)}`} strokeWidth={8} />
        </g>
        <line x1={p.bar[0] - 70} y1={p.bar[1]} x2={p.bar[0] + 70} y2={p.bar[1]} stroke="#8a827a" strokeWidth={6} />
        <circle cx={p.bar[0]} cy={p.bar[1]} r={27} fill="#1c1916" stroke="#FF4F12" strokeWidth={5} />
        <circle cx={p.bar[0]} cy={p.bar[1]} r={6} fill="#FF4F12" />
        <circle cx={p.head[0]} cy={p.head[1]} r={17} fill="#F4F1EA" stroke="#0E0C0A" strokeWidth={3} />

        {[
          { at: ANKLE, c: OK },
          { at: p.knee, c: kneeColor },
          { at: p.hip, c: backColor },
          { at: p.shoulder, c: OK },
        ].map(({ at, c }, i) => (
          <g key={i}>
            <circle cx={at[0]} cy={at[1]} r={11} fill="none" stroke={c} strokeWidth={2} strokeOpacity={0.6} />
            <circle cx={at[0]} cy={at[1]} r={4.5} fill={c} />
          </g>
        ))}

        {kneeBad && (
          <g>
            <line x1={p.knee[0]} y1={p.knee[1]} x2={p.knee[0] + 46} y2={p.knee[1] - 34} stroke={kneeColor} strokeWidth={1.5} />
            <text x={p.knee[0] + 50} y={p.knee[1] - 38} fill={kneeColor} {...mono}>KNEE DRIFT</text>
          </g>
        )}
        {backBad && (
          <g>
            <line x1={p.spineCtrl[0]} y1={p.spineCtrl[1]} x2={p.spineCtrl[0] - 40} y2={p.spineCtrl[1] - 46} stroke={BAD} strokeWidth={1.5} />
            <text x={p.spineCtrl[0] - 44} y={p.spineCtrl[1] - 52} fill={BAD} textAnchor="end" {...mono}>BACK ROUNDING</text>
          </g>
        )}
        <text x={18} y={30} fill="#F4F1EA" fillOpacity={0.55} {...mono} fontSize={10}>DEPTH {depth}°</text>
        <text x={382} y={30} fill="#F4F1EA" fillOpacity={0.55} textAnchor="end" {...mono} fontSize={10}>TEMPO {(2.1 + fatigue * 1.5).toFixed(1)}s</text>
      </svg>

      <div className="border-t border-[#F4F1EA]/15 px-4 pb-3 pt-2.5">
        <div className="mono-data mb-2 flex justify-between text-[8px] tracking-[0.24em] text-[#F4F1EA]/50">
          <span>FORM SCORE PER REP</span>
          <AnimatePresence mode="wait">
            <motion.span key={beat} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ color: beat >= 3 ? BAD : beat >= 1 ? WARN : OK }}>
              {beat >= 3 ? 'NOBODY FLAGGED IT' : beat >= 1 ? 'DEGRADING' : 'CLEAN'}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="flex h-12 items-end gap-1.5">
          {REP_FORM.map((score, i) => {
            const shown = i < rep
            const color = score > 80 ? '#F4F1EA' : score > 65 ? WARN : BAD
            return (
              <motion.span
                key={i}
                className="flex-1"
                initial={false}
                animate={{ height: shown ? `${(score - 40) * 1.66}%` : '6%', backgroundColor: shown ? color : 'rgba(244,241,234,0.12)' }}
                transition={{ duration: 0.5, ease: EASE }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
