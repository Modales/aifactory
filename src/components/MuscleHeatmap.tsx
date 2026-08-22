import type { ReactNode } from 'react'
import type { MuscleId, MuscleLoadSummary } from '@/lib/muscleModel'

type View = 'FRONT' | 'BACK' | 'SIDE'
type Region = { id: MuscleId; shape: ReactNode }

const FRONT: Region[] = [
  { id: 'traps', shape: <path d="M58 48 75 66 92 48 88 68 62 68Z" /> },
  { id: 'anterior_delts', shape: <><path d="M58 59Q39 59 34 80L47 87 59 68Z"/><path d="M92 59Q111 59 116 80L103 87 91 68Z"/></> },
  { id: 'upper_chest', shape: <><path d="M60 64 73 69 73 84 51 78Z"/><path d="M90 64 77 69 77 84 99 78Z"/></> },
  { id: 'mid_chest', shape: <><path d="M51 80 73 86 73 100 49 96Z"/><path d="M99 80 77 86 77 100 101 96Z"/></> },
  { id: 'lower_chest', shape: <><path d="M49 98 73 102 69 110 52 107Z"/><path d="M101 98 77 102 81 110 98 107Z"/></> },
  { id: 'biceps_long', shape: <><path d="M36 86 48 89 44 119 32 113Z"/><path d="M114 86 102 89 106 119 118 113Z"/></> },
  { id: 'biceps_short', shape: <><path d="M31 88 36 86 32 113 26 108Z"/><path d="M119 88 114 86 118 113 124 108Z"/></> },
  { id: 'forearms', shape: <><path d="M27 112 42 121 31 154 19 149Z"/><path d="M123 112 108 121 119 154 131 149Z"/></> },
  { id: 'rectus_abdominis', shape: <><rect x="62" y="111" width="11" height="15" rx="4"/><rect x="77" y="111" width="11" height="15" rx="4"/><rect x="62" y="128" width="11" height="15" rx="4"/><rect x="77" y="128" width="11" height="15" rx="4"/><rect x="65" y="145" width="8" height="14" rx="3"/><rect x="77" y="145" width="8" height="14" rx="3"/></> },
  { id: 'obliques', shape: <><path d="M51 108 60 113 60 158 48 145Z"/><path d="M99 108 90 113 90 158 102 145Z"/></> },
  { id: 'hip_adductors', shape: <><path d="M62 164 73 169 68 219 57 193Z"/><path d="M88 164 77 169 82 219 93 193Z"/></> },
  { id: 'quads', shape: <><path d="M48 161 61 164 68 220 52 229 43 190Z"/><path d="M102 161 89 164 82 220 98 229 107 190Z"/></> },
  { id: 'calves', shape: <><path d="M49 231 65 229 61 276 48 286 41 258Z"/><path d="M101 231 85 229 89 276 102 286 109 258Z"/></> },
]

const BACK: Region[] = [
  { id: 'traps', shape: <><path d="M58 48 73 62 73 108 51 73Z"/><path d="M92 48 77 62 77 108 99 73Z"/></> },
  { id: 'rear_delts', shape: <><path d="M57 61Q39 62 34 81L48 87 60 69Z"/><path d="M93 61Q111 62 116 81L102 87 90 69Z"/></> },
  { id: 'triceps_long', shape: <><path d="M36 87 49 90 45 120 33 113Z"/><path d="M114 87 101 90 105 120 117 113Z"/></> },
  { id: 'triceps_lateral', shape: <><path d="M30 89 36 87 33 113 26 108Z"/><path d="M120 89 114 87 117 113 124 108Z"/></> },
  { id: 'forearms', shape: <><path d="M27 112 42 122 31 154 19 149Z"/><path d="M123 112 108 122 119 154 131 149Z"/></> },
  { id: 'lats', shape: <><path d="M50 76 72 106 69 147 50 126 45 96Z"/><path d="M100 76 78 106 81 147 100 126 105 96Z"/></> },
  { id: 'erector_spinae', shape: <><path d="M67 105 73 110 72 159 64 145Z"/><path d="M83 105 77 110 78 159 86 145Z"/></> },
  { id: 'glutes', shape: <><path d="M48 151Q61 141 73 161L72 185Q53 189 46 171Z"/><path d="M102 151Q89 141 77 161L78 185Q97 189 104 171Z"/></> },
  { id: 'hamstrings', shape: <><path d="M49 187 71 188 65 230 49 226 43 200Z"/><path d="M101 187 79 188 85 230 101 226 107 200Z"/></> },
  { id: 'calves', shape: <><path d="M49 232 65 231 61 276 48 286 41 258Z"/><path d="M101 232 85 231 89 276 102 286 109 258Z"/></> },
]

const SIDE: Region[] = [
  { id: 'anterior_delts', shape: <path d="M77 60Q95 62 99 81L87 88 77 70Z"/> },
  { id: 'rear_delts', shape: <path d="M75 60Q62 61 58 78L68 85 79 69Z"/> },
  { id: 'upper_chest', shape: <path d="M81 78 99 84 95 101 80 98Z"/> },
  { id: 'mid_chest', shape: <path d="M80 99 95 103 89 119 77 111Z"/> },
  { id: 'triceps_long', shape: <path d="M65 84 76 86 72 119 62 112Z"/> },
  { id: 'biceps_long', shape: <path d="M77 87 87 91 84 120 73 117Z"/> },
  { id: 'forearms', shape: <path d="M69 119 83 123 84 157 73 160 64 143Z"/> },
  { id: 'rectus_abdominis', shape: <path d="M84 120 91 126 87 157 79 153Z"/> },
  { id: 'obliques', shape: <path d="M67 115 79 121 77 157 65 146Z"/> },
  { id: 'glutes', shape: <path d="M58 154Q42 158 45 184L61 194 72 173Z"/> },
  { id: 'quads', shape: <path d="M72 168 88 178 84 230 69 225 62 194Z"/> },
  { id: 'hamstrings', shape: <path d="M55 186 69 190 67 228 53 222 47 200Z"/> },
  { id: 'calves', shape: <path d="M58 230 75 232 70 278 57 287 50 258Z"/> },
]

const HEAT = ['#0b0b0b', '#f3a127', '#ec7c2e', '#dc5330', '#c53832', '#98252b']
const LEGACY_MUSCLE_IDS: Record<string, MuscleId> = { chest: 'mid_chest', front_delts: 'anterior_delts', triceps: 'triceps_lateral', biceps: 'biceps_long', core: 'rectus_abdominis' }
const ALL_MUSCLE_NAMES = 'Upper pectoralis, Mid pectoralis, Lower pectoralis, Anterior deltoids, Lateral deltoids, Rear deltoids, Triceps long head, Triceps lateral head, Biceps long head, Biceps short head, Brachialis, Forearms, Rectus abdominis, Obliques, Deep core, Latissimus dorsi, Trapezius, Erector spinae, Gluteus maximus, Hip adductors, Quadriceps, Hamstrings, Calves'
const level = (score: number) => score <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil(score / 20)))

function Body({ view, summary, compact }: { view: View; summary: MuscleLoadSummary; compact: boolean }) {
  const scores = new Map<MuscleId, number>()
  summary.entries.forEach((entry) => scores.set(LEGACY_MUSCLE_IDS[entry.id] ?? entry.id, entry.score))
  const regions = view === 'FRONT' ? FRONT : view === 'BACK' ? BACK : SIDE
  const silhouette = view === 'SIDE'
    ? <path d="M63 45Q55 55 58 68L53 82 58 116 59 148 43 167 45 205 51 228 49 276 58 292 73 287 77 238 87 211 89 175 83 151 88 121 99 108 101 88 91 65 81 51Z" />
    : <path d="M58 47 44 61 34 86 25 114 16 150 27 156 42 122 48 96 49 149 42 169 42 216 48 232 41 279 53 291 65 278 71 229 75 194 79 229 85 278 97 291 109 279 102 232 108 216 108 169 101 149 102 96 108 122 123 156 134 150 125 114 116 86 106 61 92 47Z" />
  return <div className="text-center"><p className={`${compact ? 'text-[8px]' : 'text-sm'} mb-1 font-sans font-medium tracking-tight text-black`}>{view}</p><svg viewBox="0 0 150 305" className={`mx-auto ${compact ? 'h-36 w-full' : 'h-[285px] w-full max-w-[145px]'}`} role="img" aria-label={`${view.toLowerCase()} anatomical muscle demand map`}>
    <g fill="#080808">{view === 'SIDE' ? <path d="M63 8Q80 2 88 15L91 34 82 49 63 45 57 29Z"/> : <><circle cx="75" cy="25" r="19"/><rect x="55" y="21" width="40" height="17" rx="7"/></>}{silhouette}</g>
    {regions.map(({ id, shape }) => <g key={id} fill={HEAT[level(scores.get(id) ?? 0)]} stroke="#f7f3ea" strokeWidth="1.8" strokeLinejoin="round">{shape}</g>)}
  </svg></div>
}

export default function MuscleHeatmap({ summary, compact = false }: { summary: MuscleLoadSummary; compact?: boolean }) {
  if (compact) return <section className="border border-black bg-white p-2 text-black"><div className="grid grid-cols-3 gap-1"><Body view="FRONT" summary={summary} compact /><Body view="BACK" summary={summary} compact /><Body view="SIDE" summary={summary} compact /></div><div className="mt-1 flex h-2 overflow-hidden">{HEAT.slice(1).map((colour) => <span key={colour} className="flex-1" style={{ backgroundColor: colour }} />)}</div></section>
  return <section className="bg-white px-4 py-6 text-center font-sans text-black sm:px-6"><h3 className="text-3xl font-black uppercase leading-[0.9] tracking-tight">Anatomical<br/>Muscle Demand</h3><p className="mt-2 text-sm leading-tight">Colour intensity shows relative estimated workload.</p><p className="mt-1 text-base font-black">MODEL {summary.modelVersion}</p><div className="mx-auto mt-2 grid max-w-xl grid-cols-3 items-start gap-1 sm:gap-4"><Body view="FRONT" summary={summary} compact={false} /><Body view="BACK" summary={summary} compact={false} /><Body view="SIDE" summary={summary} compact={false} /></div><div className="mx-auto mt-2 flex h-8 max-w-sm">{HEAT.slice(1).map((colour, index) => <span key={colour} className="flex flex-1 items-center justify-center text-sm font-black text-white" style={{ backgroundColor: colour }}>{index + 1}</span>)}</div><p className="mx-auto mt-3 max-w-lg text-xs font-medium leading-tight">{ALL_MUSCLE_NAMES}</p><p className="mx-auto mt-4 max-w-lg text-[10px] leading-tight">{summary.disclaimer}</p></section>
}
