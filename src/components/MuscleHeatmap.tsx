import type { ReactNode } from 'react'
import type { MuscleId, MuscleLoadSummary } from '@/lib/muscleModel'

type Region = { id: MuscleId; shape: ReactNode }

const FRONT: Region[] = [
  { id: 'traps', shape: <path d="M58 43 75 62 92 43 88 68 62 68Z" /> },
  { id: 'anterior_delts', shape: <><path d="M57 58Q42 58 38 74L48 82 59 68Z"/><path d="M93 58Q108 58 112 74L102 82 91 68Z"/></> },
  { id: 'upper_chest', shape: <><path d="M60 61 73 68 73 82 54 74Z"/><path d="M90 61 77 68 77 82 96 74Z"/></> },
  { id: 'mid_chest', shape: <><path d="M54 76 73 84 73 96 51 91Z"/><path d="M96 76 77 84 77 96 99 91Z"/></> },
  { id: 'lower_chest', shape: <><path d="M51 93 73 98 70 106 53 103Z"/><path d="M99 93 77 98 80 106 97 103Z"/></> },
  { id: 'biceps_long', shape: <><path d="M41 79 51 83 47 111 37 106Z"/><path d="M109 79 99 83 103 111 113 106Z"/></> },
  { id: 'biceps_short', shape: <><path d="M36 80 41 79 37 106 31 101Z"/><path d="M114 80 109 79 113 106 119 101Z"/></> },
  { id: 'forearms', shape: <><path d="M31 104 42 112 31 143 22 138Z"/><path d="M119 104 108 112 119 143 128 138Z"/></> },
  { id: 'rectus_abdominis', shape: <path d="M62 108 73 106 73 151 62 145M88 108 77 106 77 151 88 145" /> },
  { id: 'obliques', shape: <><path d="M53 105 61 109 60 148 51 134Z"/><path d="M97 105 89 109 90 148 99 134Z"/></> },
  { id: 'hip_adductors', shape: <><path d="M61 153 73 157 68 205 58 184Z"/><path d="M89 153 77 157 82 205 92 184Z"/></> },
  { id: 'quads', shape: <><path d="M50 151 60 153 68 207 53 216 45 180Z"/><path d="M100 151 90 153 82 207 97 216 105 180Z"/></> },
  { id: 'calves', shape: <><path d="M51 219 65 217 61 262 49 270 43 245Z"/><path d="M99 219 85 217 89 262 101 270 107 245Z"/></> },
]

const BACK: Region[] = [
  { id: 'traps', shape: <><path d="M59 45 73 58 73 105 53 71Z"/><path d="M91 45 77 58 77 105 97 71Z"/></> },
  { id: 'rear_delts', shape: <><path d="M55 59Q42 60 38 75L49 82 59 68Z"/><path d="M95 59Q108 60 112 75L101 82 91 68Z"/></> },
  { id: 'triceps_long', shape: <><path d="M39 80 50 83 46 112 36 105Z"/><path d="M111 80 100 83 104 112 114 105Z"/></> },
  { id: 'triceps_lateral', shape: <><path d="M34 82 39 80 36 105 29 101Z"/><path d="M116 82 111 80 114 105 121 101Z"/></> },
  { id: 'forearms', shape: <><path d="M30 104 42 113 31 143 22 138Z"/><path d="M120 104 108 113 119 143 128 138Z"/></> },
  { id: 'lats', shape: <><path d="M52 76 72 104 70 137 52 118 47 92Z"/><path d="M98 76 78 104 80 137 98 118 103 92Z"/></> },
  { id: 'erector_spinae', shape: <><path d="M68 98 73 104 72 150 65 139Z"/><path d="M82 98 77 104 78 150 85 139Z"/></> },
  { id: 'glutes', shape: <><path d="M49 141Q61 132 73 151L72 174Q54 179 47 162Z"/><path d="M101 141Q89 132 77 151L78 174Q96 179 103 162Z"/></> },
  { id: 'hamstrings', shape: <><path d="M50 176 71 177 65 218 50 213 44 190Z"/><path d="M100 176 79 177 85 218 100 213 106 190Z"/></> },
  { id: 'calves', shape: <><path d="M50 220 65 219 61 262 49 270 43 245Z"/><path d="M100 220 85 219 89 262 101 270 107 245Z"/></> },
]

const HEAT = ['#f3f0e9', '#f3a127', '#ec7c2e', '#dc5330', '#c53832', '#98252b']
const LEGACY_MUSCLE_IDS: Record<string, MuscleId> = { chest: 'mid_chest', front_delts: 'anterior_delts', triceps: 'triceps_lateral', biceps: 'biceps_long', core: 'rectus_abdominis' }
const ALL_MUSCLE_NAMES = 'Upper pectoralis, Mid pectoralis, Lower pectoralis, Anterior deltoids, Lateral deltoids, Rear deltoids, Triceps long head, Triceps lateral head, Biceps long head, Biceps short head, Brachialis, Forearms, Rectus abdominis, Obliques, Deep core, Latissimus dorsi, Trapezius, Erector spinae, Gluteus maximus, Hip adductors, Quadriceps, Hamstrings, Calves'
const level = (score: number) => score <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil(score / 20)))

function Body({ side, summary, compact }: { side: 'FRONT' | 'BACK'; summary: MuscleLoadSummary; compact: boolean }) {
  const scores = new Map<MuscleId, number>()
  summary.entries.forEach((entry) => scores.set(LEGACY_MUSCLE_IDS[entry.id] ?? entry.id, entry.score))
  return <div className="text-center"><p className="mb-1 font-sans text-sm font-medium tracking-tight text-black">{side}</p><svg viewBox="0 0 150 300" className={`mx-auto ${compact ? 'h-40 w-20' : 'h-[270px] w-[135px]'}`} role="img" aria-label={`${side.toLowerCase()} anatomical muscle demand map`}>
    <circle cx="75" cy="24" r="18" fill="#050505" />
    <path d="M58 44 45 58 36 82 27 108 18 142 27 147 42 116 48 91 50 140 43 160 43 205 48 222 42 270 53 279 65 267 71 218 75 185 79 218 85 267 97 279 108 270 102 222 107 205 107 160 100 140 102 91 108 116 123 147 132 142 123 108 114 82 105 58 92 44Z" fill="#080808" />
    {(side === 'FRONT' ? FRONT : BACK).map(({ id, shape }) => <g key={id} fill={HEAT[level(scores.get(id) ?? 0)]} stroke="#fffaf2" strokeWidth="1.7" strokeLinejoin="round">{shape}</g>)}
  </svg></div>
}

export default function MuscleHeatmap({ summary, compact = false }: { summary: MuscleLoadSummary; compact?: boolean }) {
  if (compact) return <section className="border border-black bg-[#f4f1ea] p-2 text-black"><div className="grid grid-cols-2"><Body side="FRONT" summary={summary} compact /><Body side="BACK" summary={summary} compact /></div><div className="mt-1 flex h-2 overflow-hidden">{HEAT.slice(1).map((colour) => <span key={colour} className="flex-1" style={{ backgroundColor: colour }} />)}</div></section>
  return <section className="bg-[#f4f1ea] px-5 py-6 text-center font-sans text-black sm:px-8"><h3 className="text-3xl font-black uppercase leading-[0.9] tracking-tight">Anatomical<br/>Muscle Demand</h3><p className="mt-2 text-sm leading-tight">Colour intensity shows relative estimated workload.</p><p className="mt-1 text-base font-black">MODEL {summary.modelVersion}</p><div className="mx-auto mt-1 flex max-w-sm items-start justify-center gap-3 sm:gap-8"><Body side="FRONT" summary={summary} compact={false} /><Body side="BACK" summary={summary} compact={false} /></div><div className="mx-auto mt-2 flex h-8 max-w-sm">{HEAT.slice(1).map((colour, index) => <span key={colour} className="flex flex-1 items-center justify-center text-sm font-black text-white" style={{ backgroundColor: colour }}>{index + 1}</span>)}</div><p className="mx-auto mt-3 max-w-lg text-xs font-medium leading-tight">{ALL_MUSCLE_NAMES}</p><p className="mx-auto mt-4 max-w-lg text-[10px] leading-tight">{summary.disclaimer}</p></section>
}
