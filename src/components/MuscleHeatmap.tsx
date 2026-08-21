import type { MuscleId, MuscleLoadSummary } from '@/lib/muscleModel'

const FRONT: Array<{ id: MuscleId; shape: React.ReactNode }> = [
  { id: 'front_delts', shape: <><ellipse cx="38" cy="50" rx="8" ry="7" /><ellipse cx="82" cy="50" rx="8" ry="7" /></> },
  { id: 'chest', shape: <path d="M45 50 Q60 43 75 50 L72 70 Q60 75 48 70Z" /> },
  { id: 'biceps', shape: <><ellipse cx="34" cy="75" rx="6" ry="14" /><ellipse cx="86" cy="75" rx="6" ry="14" /></> },
  { id: 'forearms', shape: <><ellipse cx="28" cy="104" rx="5" ry="15" /><ellipse cx="92" cy="104" rx="5" ry="15" /></> },
  { id: 'core', shape: <path d="M49 73 Q60 78 71 73 L69 113 Q60 119 51 113Z" /> },
  { id: 'quads', shape: <><path d="M47 123 Q54 117 59 125 L56 169 Q48 174 44 162Z" /><path d="M73 123 Q66 117 61 125 L64 169 Q72 174 76 162Z" /></> },
  { id: 'calves', shape: <><ellipse cx="50" cy="190" rx="6" ry="18" /><ellipse cx="70" cy="190" rx="6" ry="18" /></> },
]

const BACK: Array<{ id: MuscleId; shape: React.ReactNode }> = [
  { id: 'front_delts', shape: <><ellipse cx="38" cy="50" rx="8" ry="7" /><ellipse cx="82" cy="50" rx="8" ry="7" /></> },
  { id: 'triceps', shape: <><ellipse cx="34" cy="76" rx="6" ry="14" /><ellipse cx="86" cy="76" rx="6" ry="14" /></> },
  { id: 'forearms', shape: <><ellipse cx="28" cy="104" rx="5" ry="15" /><ellipse cx="92" cy="104" rx="5" ry="15" /></> },
  { id: 'lats', shape: <path d="M43 54 Q60 47 77 54 L72 94 L60 105 L48 94Z" /> },
  { id: 'erector_spinae', shape: <><rect x="53" y="59" width="5" height="52" rx="2" /><rect x="62" y="59" width="5" height="52" rx="2" /></> },
  { id: 'glutes', shape: <><ellipse cx="53" cy="127" rx="10" ry="12" /><ellipse cx="67" cy="127" rx="10" ry="12" /></> },
  { id: 'hamstrings', shape: <><ellipse cx="51" cy="153" rx="7" ry="20" /><ellipse cx="69" cy="153" rx="7" ry="20" /></> },
  { id: 'calves', shape: <><ellipse cx="50" cy="190" rx="6" ry="18" /><ellipse cx="70" cy="190" rx="6" ry="18" /></> },
]

function Body({ side, summary }: { side: 'FRONT' | 'BACK'; summary: MuscleLoadSummary }) {
  const scores = new Map(summary.entries.map((entry) => [entry.id, entry.score]))
  const regions = side === 'FRONT' ? FRONT : BACK
  return (
    <div className="text-center">
      <p className="mono-data mb-1 text-[8px] tracking-[0.2em] text-muted-foreground">{side}</p>
      <svg viewBox="0 0 120 220" className="mx-auto h-48 w-28" role="img" aria-label={`${side.toLowerCase()} muscle demand map`}>
        <circle cx="60" cy="20" r="13" className="fill-muted stroke-foreground" strokeWidth="2" />
        <path d="M45 39 Q60 33 75 39 L88 68 L98 118 L89 121 L77 82 L75 116 L78 128 L76 171 L75 214 L64 214 L60 174 L56 214 L45 214 L44 171 L42 128 L45 116 L43 82 L31 121 L22 118 L32 68Z" className="fill-muted stroke-foreground" strokeWidth="2" />
        {regions.map(({ id, shape }) => {
          const score = scores.get(id) ?? 0
          return <g key={id} fill="#FF4D00" opacity={score ? 0.18 + score / 125 : 0}>{shape}</g>
        })}
      </svg>
    </div>
  )
}

export default function MuscleHeatmap({ summary, compact = false }: { summary: MuscleLoadSummary; compact?: boolean }) {
  const top = summary.entries.slice(0, compact ? 3 : 5)
  return (
    <div className="border-2 border-foreground bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="mono-data text-[9px] tracking-[0.2em] text-primary">ESTIMATED MUSCLE DEMAND</p>
          <p className="mt-1 text-xs text-muted-foreground">Confidence: {summary.confidence}</p>
        </div>
        <span className="mono-data border border-foreground px-2 py-1 text-[8px]">MODEL {summary.modelVersion}</span>
      </div>
      <div className={`mt-3 grid items-start gap-3 ${compact ? 'grid-cols-[auto_1fr]' : 'grid-cols-[1fr_1fr] sm:grid-cols-[auto_auto_1fr]'}`}>
        <Body side="FRONT" summary={summary} />
        {!compact && <Body side="BACK" summary={summary} />}
        <div className="space-y-2">
          {top.map((muscle) => (
            <div key={muscle.id}>
              <div className="flex justify-between gap-3 text-[10px] font-bold uppercase"><span>{muscle.name}</span><span>{muscle.score}</span></div>
              <div className="mt-1 h-1.5 bg-muted"><div className="h-full bg-primary" style={{ width: `${muscle.score}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      {!compact && <p className="mt-3 border-t border-foreground/20 pt-2 text-[9px] leading-relaxed text-muted-foreground">{summary.disclaimer}</p>}
    </div>
  )
}
