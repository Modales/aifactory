import type { ReactNode } from 'react'
import type { MuscleId, MuscleLoadSummary } from '@/lib/muscleModel'

type Region = { id: MuscleId; shape: ReactNode }

const FRONT: Region[] = [
  { id: 'anterior_delts', shape: <><ellipse cx="38" cy="51" rx="8" ry="7" /><ellipse cx="82" cy="51" rx="8" ry="7" /></> },
  { id: 'lateral_delts', shape: <><ellipse cx="31" cy="55" rx="5" ry="9" /><ellipse cx="89" cy="55" rx="5" ry="9" /></> },
  { id: 'upper_chest', shape: <path d="M46 54 Q60 47 74 54 L72 61 Q60 65 48 61Z" /> },
  { id: 'mid_chest', shape: <path d="M48 62 Q60 59 72 62 L71 70 Q60 74 49 70Z" /> },
  { id: 'lower_chest', shape: <path d="M49 71 Q60 69 71 71 L69 77 Q60 80 51 77Z" /> },
  { id: 'biceps_long', shape: <><ellipse cx="34" cy="77" rx="4" ry="13" /><ellipse cx="86" cy="77" rx="4" ry="13" /></> },
  { id: 'biceps_short', shape: <><ellipse cx="38" cy="78" rx="3" ry="12" /><ellipse cx="82" cy="78" rx="3" ry="12" /></> },
  { id: 'brachialis', shape: <><ellipse cx="31" cy="87" rx="3" ry="8" /><ellipse cx="89" cy="87" rx="3" ry="8" /></> },
  { id: 'forearms', shape: <><ellipse cx="28" cy="105" rx="5" ry="15" /><ellipse cx="92" cy="105" rx="5" ry="15" /></> },
  { id: 'rectus_abdominis', shape: <path d="M52 78 Q60 75 68 78 L68 112 Q60 118 52 112Z" /> },
  { id: 'obliques', shape: <><path d="M47 79 L52 83 L52 110 L47 106Z" /><path d="M73 79 L68 83 L68 110 L73 106Z" /></> },
  { id: 'quads', shape: <><path d="M46 122 Q53 118 58 125 L56 168 Q48 173 44 161Z" /><path d="M74 122 Q67 118 62 125 L64 168 Q72 173 76 161Z" /></> },
  { id: 'calves', shape: <><ellipse cx="50" cy="190" rx="6" ry="18" /><ellipse cx="70" cy="190" rx="6" ry="18" /></> },
]

const BACK: Region[] = [
  { id: 'rear_delts', shape: <><ellipse cx="38" cy="51" rx="8" ry="7" /><ellipse cx="82" cy="51" rx="8" ry="7" /></> },
  { id: 'traps', shape: <path d="M45 47 Q60 37 75 47 L72 61 L48 61Z" /> },
  { id: 'triceps_long', shape: <><ellipse cx="34" cy="76" rx="4" ry="14" /><ellipse cx="86" cy="76" rx="4" ry="14" /></> },
  { id: 'triceps_lateral', shape: <><ellipse cx="39" cy="77" rx="3" ry="13" /><ellipse cx="81" cy="77" rx="3" ry="13" /></> },
  { id: 'forearms', shape: <><ellipse cx="28" cy="105" rx="5" ry="15" /><ellipse cx="92" cy="105" rx="5" ry="15" /></> },
  { id: 'lats', shape: <path d="M43 57 Q60 48 77 57 L74 92 L68 103 L60 98 L52 103 L46 92Z" /> },
  { id: 'erector_spinae', shape: <><rect x="53" y="61" width="5" height="50" rx="2" /><rect x="62" y="61" width="5" height="50" rx="2" /></> },
  { id: 'glutes', shape: <><ellipse cx="53" cy="127" rx="10" ry="12" /><ellipse cx="67" cy="127" rx="10" ry="12" /></> },
  { id: 'hamstrings', shape: <><ellipse cx="51" cy="153" rx="7" ry="20" /><ellipse cx="69" cy="153" rx="7" ry="20" /></> },
  { id: 'calves', shape: <><ellipse cx="50" cy="190" rx="6" ry="18" /><ellipse cx="70" cy="190" rx="6" ry="18" /></> },
]

function heat(score: number) {
  if (!score) return '#e7e5e4'
  if (score < 35) return '#fde68a'
  if (score < 60) return '#fb923c'
  if (score < 80) return '#f97316'
  return '#dc2626'
}

const LEGACY_MUSCLE_IDS: Record<string, MuscleId> = {
  chest: 'mid_chest', front_delts: 'anterior_delts', triceps: 'triceps_lateral',
  biceps: 'biceps_long', core: 'rectus_abdominis',
}

function Body({ side, summary, large }: { side: 'FRONT' | 'BACK'; summary: MuscleLoadSummary; large: boolean }) {
  const scores = new Map<MuscleId, number>()
  summary.entries.forEach((entry) => scores.set(LEGACY_MUSCLE_IDS[entry.id] ?? entry.id, entry.score))
  return <div className="text-center"><p className="mono-data mb-1 text-[8px] tracking-[0.2em] text-muted-foreground">{side}</p><svg viewBox="0 0 120 220" className={`mx-auto ${large ? 'h-64 w-36' : 'h-44 w-24'}`} role="img" aria-label={`${side.toLowerCase()} anatomical muscle demand map`}>
    <circle cx="60" cy="20" r="13" fill="#e7e5e4" stroke="currentColor" strokeWidth="2" />
    <path d="M45 39 Q60 33 75 39 L88 68 L98 118 L89 121 L77 82 L75 116 L78 128 L76 171 L75 214 L64 214 L60 174 L56 214 L45 214 L44 171 L42 128 L45 116 L43 82 L31 121 L22 118 L32 68Z" fill="#f5f5f4" stroke="currentColor" strokeWidth="2" />
    {(side === 'FRONT' ? FRONT : BACK).map(({ id, shape }) => <g key={id} fill={heat(scores.get(id) ?? 0)} stroke="#292524" strokeWidth="0.55">{shape}</g>)}
  </svg></div>
}

export default function MuscleHeatmap({ summary, compact = false }: { summary: MuscleLoadSummary; compact?: boolean }) {
  const top = summary.entries.slice(0, compact ? 3 : 7)
  return <section className="border-2 border-foreground bg-background p-3"><div className="flex items-center justify-between gap-3"><div><p className="mono-data text-[9px] tracking-[0.2em] text-primary">ANATOMICAL MUSCLE DEMAND</p><p className="mt-1 text-xs text-muted-foreground">Colour intensity shows relative estimated workload.</p></div><span className="mono-data border border-foreground px-2 py-1 text-[8px]">MODEL {summary.modelVersion}</span></div><div className={`mt-3 grid items-start gap-3 ${compact ? 'grid-cols-[auto_1fr]' : 'grid-cols-2 sm:grid-cols-[auto_auto_1fr]'}`}><Body side="FRONT" summary={summary} large={!compact} />{!compact && <Body side="BACK" summary={summary} large />}<div className="space-y-2">{top.map((muscle) => <div key={muscle.id}><div className="flex justify-between gap-3 text-[10px] font-bold uppercase"><span>{muscle.name}</span><span>{muscle.score}</span></div><div className="mt-1 h-2 bg-muted"><div className="h-full" style={{ width: `${muscle.score}%`, backgroundColor: heat(muscle.score) }} /></div></div>)}</div></div>{!compact && <p className="mt-3 border-t border-foreground/20 pt-2 text-[9px] leading-relaxed text-muted-foreground">{summary.disclaimer}</p>}</section>
}
