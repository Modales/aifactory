import type { ReactNode } from 'react'
import type { MuscleId, MuscleLoadSummary } from '@/lib/muscleModel'

type Region = { id: MuscleId; shape: ReactNode }

const REGIONS: Region[] = [
  { id: 'traps', shape: <><path d="M112 139 158 171 201 139 185 201 132 201Z"/><path d="M487 144 553 108 616 144 591 230 554 305 517 230Z"/></> },
  { id: 'anterior_delts', shape: <><path d="M91 156Q42 172 20 229L54 264 96 205Z"/><path d="M226 155Q281 172 301 229L267 264 223 205Z"/><path d="M849 168Q897 172 919 219L884 253 851 211Z"/></> },
  { id: 'lateral_delts', shape: <><path d="M44 184Q10 205 6 265L38 284 67 224Z"/><path d="M274 184Q309 205 313 265L281 284 251 224Z"/></> },
  { id: 'rear_delts', shape: <><path d="M454 166Q414 182 401 230L435 260 473 207Z"/><path d="M653 166Q697 182 710 230L676 260 638 207Z"/><path d="M831 180Q805 207 811 255L843 267 860 214Z"/></> },
  { id: 'upper_chest', shape: <><path d="M100 181 155 205 154 251 77 231Z"/><path d="M217 181 163 205 164 251 239 231Z"/><path d="M864 226 927 247 914 299 862 286Z"/></> },
  { id: 'mid_chest', shape: <><path d="M77 235 154 256 154 308 69 291Z"/><path d="M239 235 164 256 164 308 247 291Z"/><path d="M861 289 915 305 891 356 852 330Z"/></> },
  { id: 'lower_chest', shape: <><path d="M70 296 154 313 142 340 81 329Z"/><path d="M246 296 164 313 176 340 236 329Z"/></> },
  { id: 'biceps_long', shape: <><path d="M42 260 80 276 69 368 33 347Z"/><path d="M276 260 238 276 249 368 285 347Z"/><path d="M911 278 954 304 936 390 903 362Z"/></> },
  { id: 'biceps_short', shape: <><path d="M25 274 44 261 33 347 15 328Z"/><path d="M293 274 275 261 285 347 303 328Z"/></> },
  { id: 'triceps_long', shape: <><path d="M427 260 466 275 455 374 420 348Z"/><path d="M681 260 642 275 653 374 688 348Z"/><path d="M836 266 870 281 862 372 827 345Z"/></> },
  { id: 'triceps_lateral', shape: <><path d="M410 276 429 261 420 348 401 329Z"/><path d="M698 276 679 261 688 348 707 329Z"/></> },
  { id: 'forearms', shape: <><path d="M18 355 62 381 41 513 7 491Z"/><path d="M300 355 256 381 277 513 311 491Z"/><path d="M404 358 448 383 427 513 394 489Z"/><path d="M704 358 660 383 681 513 714 489Z"/><path d="M913 367 953 388 949 500 917 515 895 451Z"/></> },
  { id: 'rectus_abdominis', shape: <><path d="M112 343 153 341 153 518 113 497Z"/><path d="M204 343 164 341 164 518 204 497Z"/><path d="M873 356 902 381 891 496 861 476Z"/></> },
  { id: 'obliques', shape: <><path d="M81 334 107 350 108 507 72 459Z"/><path d="M236 334 210 350 209 507 246 459Z"/><path d="M844 338 876 359 855 485 825 443Z"/></> },
  { id: 'transverse_abdominis', shape: <><path d="M95 435 153 449 153 510 108 497Z"/><path d="M222 435 164 449 164 510 209 497Z"/></> },
  { id: 'lats', shape: <><path d="M462 224 546 305 526 471 456 394 438 286Z"/><path d="M646 224 562 305 582 471 652 394 670 286Z"/><path d="M817 254 850 272 840 433 808 390Z"/></> },
  { id: 'erector_spinae', shape: <><path d="M526 300 550 322 548 521 513 462Z"/><path d="M582 300 558 322 560 521 595 462Z"/></> },
  { id: 'glutes', shape: <><path d="M455 487Q508 457 550 522L546 588Q480 605 446 552Z"/><path d="M653 487Q600 457 558 522L562 588Q628 605 662 552Z"/><path d="M810 474Q760 500 782 575L831 603 859 526Z"/></> },
  { id: 'hip_adductors', shape: <><path d="M113 523 153 540 141 734 101 635Z"/><path d="M204 523 164 540 176 734 216 635Z"/></> },
  { id: 'quads', shape: <><path d="M75 517 113 526 141 732 89 765 59 626Z"/><path d="M242 517 204 526 176 732 228 765 258 626Z"/><path d="M844 536 900 566 886 746 834 728 811 611Z"/></> },
  { id: 'hamstrings', shape: <><path d="M463 587 541 596 521 754 465 735 442 646Z"/><path d="M645 587 567 596 587 754 643 735 666 646Z"/><path d="M792 578 839 600 830 742 787 720 772 637Z"/></> },
  { id: 'calves', shape: <><path d="M77 753 133 750 120 929 79 976 54 860Z"/><path d="M240 753 184 750 197 929 238 976 263 860Z"/><path d="M465 754 522 756 508 936 467 980 442 861Z"/><path d="M643 754 586 756 600 936 641 980 666 861Z"/><path d="M801 742 858 750 844 932 805 978 782 858Z"/></> },
]

const HEAT = ['#f3a127', '#ec7c2e', '#dc5330', '#c53832', '#98252b']
const LEGACY_MUSCLE_IDS: Record<string, MuscleId> = { chest: 'mid_chest', front_delts: 'anterior_delts', triceps: 'triceps_lateral', biceps: 'biceps_long', core: 'rectus_abdominis' }
const level = (score: number) => Math.min(4, Math.max(0, Math.ceil(score / 20) - 1))

function ImageDiagram({ summary, compact }: { summary: MuscleLoadSummary; compact: boolean }) {
  const scores = new Map<MuscleId, number>()
  summary.entries.forEach((entry) => scores.set(LEGACY_MUSCLE_IDS[entry.id] ?? entry.id, entry.score))

  return <div className={`relative mx-auto w-full overflow-hidden bg-white ${compact ? 'max-w-sm' : 'max-w-2xl'}`}>
    <img src="/images/anatomy-muscle-reference.jpg" alt="Front, back, and side anatomical muscle diagram" className="block h-auto w-full" />
    <svg viewBox="0 0 997 1000" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {REGIONS.map(({ id, shape }) => {
        const score = scores.get(id) ?? 0
        if (score <= 0) return null
        return <g key={id} fill={HEAT[level(score)]} fillOpacity="0.76" stroke="#fff4e8" strokeOpacity="0.8" strokeWidth="2">{shape}</g>
      })}
    </svg>
  </div>
}

export default function MuscleHeatmap({ summary, compact = false }: { summary: MuscleLoadSummary; compact?: boolean }) {
  if (compact) return <section className="border border-black bg-white p-2 text-black"><ImageDiagram summary={summary} compact /><div className="mt-2 flex h-2 overflow-hidden">{HEAT.map((colour) => <span key={colour} className="flex-1" style={{ backgroundColor: colour }} />)}</div></section>

  const activeMuscles = summary.entries.filter((entry) => entry.score > 0).slice(0, 8)
  return <section className="bg-white px-4 py-6 text-center font-sans text-black sm:px-6"><h3 className="text-3xl font-black uppercase leading-[0.9] tracking-tight">Anatomical<br/>Muscle Demand</h3><p className="mt-2 text-sm leading-tight">Session workload is highlighted directly on the supplied anatomy diagram.</p><p className="mt-1 text-base font-black">MODEL {summary.modelVersion}</p><div className="mt-4"><ImageDiagram summary={summary} compact={false} /></div><div className="mx-auto mt-3 flex h-8 max-w-sm">{HEAT.map((colour, index) => <span key={colour} className="flex flex-1 items-center justify-center text-sm font-black text-white" style={{ backgroundColor: colour }}>{index + 1}</span>)}</div><p className="mx-auto mt-3 max-w-lg text-xs font-medium leading-tight">{activeMuscles.map((entry) => `${entry.name} ${entry.score}`).join(' · ')}</p><p className="mx-auto mt-4 max-w-lg text-[10px] leading-tight">{summary.disclaimer}</p></section>
}
