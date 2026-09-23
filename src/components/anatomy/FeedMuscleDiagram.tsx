import type { MuscleId, MuscleLoadSummary } from '@/lib/muscleModel'

type Region = { id: MuscleId; d: string }
// Original bilateral anatomical illustration. Paths are authored against this silhouette,
// not approximated overlays on a photograph. Deep groups are schematic projections.
const FRONT: Region[] = [
  { id: 'traps', d: 'M88 72Q86 83 66 88L83 95 97 99 95 82Z' },
  { id: 'anterior_delts', d: 'M65 90Q48 91 45 113L56 122Q64 112 72 108Z' },
  { id: 'lateral_delts', d: 'M48 99Q38 113 41 132L49 129 55 116Z' },
  { id: 'upper_chest', d: 'M72 92Q85 96 98 98L98 107Q84 104 63 112Z' },
  { id: 'mid_chest', d: 'M64 113Q80 106 98 109L98 129Q81 137 61 123Z' },
  { id: 'lower_chest', d: 'M62 125Q80 139 98 131L97 140Q78 144 65 135Z' },
  { id: 'biceps_long', d: 'M44 133Q35 148 35 169L43 180Q52 161 51 140Z' },
  { id: 'biceps_short', d: 'M53 131Q60 143 52 163L45 178Q47 153 53 131Z' },
  { id: 'brachialis', d: 'M34 152L30 173 34 181 38 176Z' },
  { id: 'forearms', d: 'M32 183Q21 202 19 225L23 239 30 235Q36 211 41 186Z' },
  { id: 'rectus_abdominis', d: 'M83 144Q90 141 98 144L98 160 84 159ZM84 163L98 164 98 179 84 177ZM84 182L98 183 98 198 86 198ZM86 202L98 202 98 219Q91 216 88 213Z' },
  { id: 'obliques', d: 'M65 140L79 147 79 183 86 209 70 199 64 170Z' },
  { id: 'transverse_abdominis', d: 'M72 205L85 217 98 223 98 234Q79 228 72 220Z' },
  { id: 'hip_adductors', d: 'M89 237L98 240 96 285 87 312 82 280Z' },
  { id: 'quads', d: 'M72 226Q59 242 60 271L66 316Q70 329 80 320L86 294 85 251Z' },
  { id: 'calves', d: 'M67 341Q58 359 64 387L70 423 76 426 81 377 79 342Z' },
]
const BACK: Region[] = [
  { id: 'traps', d: 'M89 73Q85 84 63 91L75 107 97 135 98 88Z' },
  { id: 'rear_delts', d: 'M61 93Q43 94 41 116L47 131Q58 124 67 110Z' },
  { id: 'lateral_delts', d: 'M43 112L39 127 42 138 48 132Z' },
  { id: 'triceps_long', d: 'M49 133Q54 151 45 175L38 180 35 164 40 141Z' },
  { id: 'triceps_lateral', d: 'M39 135L32 153 30 173 35 180 38 160 44 138Z' },
  { id: 'forearms', d: 'M32 183Q21 201 19 225L23 239 29 235Q35 211 42 184Z' },
  { id: 'lats', d: 'M62 118Q74 130 92 138L88 180 75 199Q67 181 64 162Z' },
  { id: 'erector_spinae', d: 'M94 141L98 145 98 213 86 217Q91 180 94 141Z' },
  { id: 'obliques', d: 'M66 174L76 201 84 215 69 224 64 202Z' },
  { id: 'glutes', d: 'M70 219Q85 211 98 225L98 254Q84 270 64 255L61 242Z' },
  { id: 'hamstrings', d: 'M63 259Q77 272 96 259L88 292 81 324 70 322 63 292Z' },
  { id: 'hip_adductors', d: 'M94 270L97 282 88 318 84 321Z' },
  { id: 'calves', d: 'M68 338Q57 358 63 379L69 395 76 411 81 372 80 340Z' },
]
const OUTLINE = 'M100 28C85 28 80 40 81 54L85 70 89 77 87 83C77 87 56 88 47 96C37 105 38 123 35 138L29 165 28 179C22 192 19 210 17 229L12 245Q10 254 13 258L17 252 16 267Q19 271 21 264L24 252 23 269Q26 272 28 265L32 247 36 240 34 229 43 202 48 184 57 157 61 136 65 160 65 184 60 219C55 242 56 271 60 292L65 325 64 339C58 356 59 375 64 393L68 427 65 445 59 455Q60 463 80 459L84 450 83 431 88 389 87 365 85 340 87 319 96 286 100 264';
const LEGACY: Record<string, MuscleId> = { chest: 'mid_chest', front_delts: 'anterior_delts', biceps: 'biceps_long', triceps: 'triceps_lateral', core: 'rectus_abdominis' }
const COLORS = ['#d4c9bc', '#dca66b', '#d9864e', '#cd613c', '#ae3e2d', '#812d29']

export default function FeedMuscleDiagram({ summary }: { summary: MuscleLoadSummary }) {
  const scores = new Map<string, number>()
  summary.entries.forEach(entry => {
    const id = LEGACY[entry.id] ?? entry.id
    scores.set(id, Math.max(scores.get(id) ?? 0, entry.score))
  })
  return <svg viewBox="0 0 420 470" role="img" aria-label="Front and back silhouettes colored by muscle demand" className="mx-auto block w-full max-w-[420px]" data-testid="feed-muscle-diagram">
    <title>Muscle demand</title>
    <desc>{summary.entries.filter(entry => entry.score > 0).map(entry => entry.name).join(', ')}</desc>
    {[FRONT, BACK].map((regions, view) => <g key={view} transform={`translate(${view * 210 + 5} 0)`}>
      {[false, true].map(mirror => <g key={String(mirror)} transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
        <path d={`${OUTLINE}Z`} fill="#d4c9bc" />
        {regions.map(region => {
          const score = scores.get(region.id) ?? 0
          const color = COLORS[score <= 0 ? 0 : Math.min(5, Math.ceil(score / 20))]
          return <path key={region.id} d={region.d} fill={color} data-muscle={region.id} data-score={score} />
        })}
      </g>)}
    </g>)}
    {['ANTERIOR', 'POSTERIOR'].map((label, view) => <text key={label} x={view * 210 + 105} y={466} textAnchor="middle" fill="#8a827a" fontSize="10" letterSpacing="2">{label}</text>)}
  </svg>
}
