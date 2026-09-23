import type { ReactNode } from 'react'
import type { MuscleId, MuscleLoadSummary } from '@/lib/muscleModel'

type Region = { id: MuscleId; shape: ReactNode }

// Coordinates are calibrated to the supplied 1022:1024 front/back/side artwork.
const REGIONS: Region[] = [
  { id: 'traps', shape: <><path d="M108 137 159 172 211 137 193 194 160 207 126 194Z"/><path d="M473 159 564 106 653 159 614 239 566 315 515 239Z"/></> },
  { id: 'anterior_delts', shape: <><path d="M78 175Q29 179 3 223L10 269 53 267 85 214Z"/><path d="M242 175Q293 179 318 223L311 269 270 267 236 214Z"/><path d="M870 179Q918 185 944 230L917 270 876 251Z"/></> },
  { id: 'lateral_delts', shape: <><path d="M3 223Q1 198 34 182L78 175 53 267 10 269Z"/><path d="M318 223Q319 198 287 182L242 175 270 267 311 269Z"/></> },
  { id: 'rear_delts', shape: <><path d="M460 178Q416 186 404 222L410 267 450 269 489 211Z"/><path d="M666 178Q709 186 722 222L716 267 676 269 637 211Z"/><path d="M842 181Q815 197 807 234L814 276 850 263 871 210Z"/></> },

  { id: 'upper_chest', shape: <><path d="M79 190 157 207 157 252 65 235Z"/><path d="M241 190 163 207 163 252 255 235Z"/><path d="M873 226 950 247 944 286 873 273Z"/></> },
  { id: 'mid_chest', shape: <><path d="M65 238 157 256 157 297 65 291Z"/><path d="M255 238 163 256 163 297 255 291Z"/><path d="M873 276 944 289 933 324 866 315Z"/></> },
  { id: 'lower_chest', shape: <><path d="M65 294Q105 318 157 306L157 321Q103 333 70 313Z"/><path d="M255 294Q215 318 163 306L163 321Q217 333 250 313Z"/><path d="M866 318 932 328 912 357 858 346Z"/></> },

  { id: 'biceps_long', shape: <><path d="M18 266 55 271 62 318 48 373 15 362 6 314Z"/><path d="M302 266 265 271 258 318 272 373 305 362 314 314Z"/><path d="M940 268 984 283 999 322 981 373 946 360Z"/></> },
  { id: 'biceps_short', shape: <><path d="M55 271 74 283 67 351 48 373 62 318Z"/><path d="M265 271 246 283 253 351 272 373 258 318Z"/></> },
  { id: 'triceps_long', shape: <><path d="M414 267 449 272 466 320 452 375 417 362 407 314Z"/><path d="M712 267 677 272 660 320 674 375 709 362 719 314Z"/><path d="M822 270 854 274 874 319 860 374 827 359 814 315Z"/></> },
  { id: 'triceps_lateral', shape: <><path d="M449 272 470 286 464 350 452 375 466 320Z"/><path d="M677 272 656 286 662 350 674 375 660 320Z"/></> },
  { id: 'forearms', shape: <><path d="M15 374 48 379 53 418 40 528 9 525 5 462Z"/><path d="M305 374 272 379 267 418 280 528 311 525 315 462Z"/><path d="M417 375 452 382 457 421 441 527 410 526 403 465Z"/><path d="M709 375 674 382 669 421 685 527 716 526 723 465Z"/><path d="M948 368 986 377 1004 421 990 505 953 518 929 466Z"/></> },

  { id: 'rectus_abdominis', shape: <><path d="M104 317 156 317 156 367 104 364ZM104 371 156 371 156 420 103 417ZM108 424 156 424 156 475 111 472ZM116 480 156 480 156 532 126 515Z"/><path d="M216 317 164 317 164 367 216 364ZM216 371 164 371 164 420 217 417ZM212 424 164 424 164 475 209 472ZM204 480 164 480 164 532 194 515Z"/><path d="M875 344 915 355 912 404 872 397ZM870 403 910 411 901 463 862 453Z"/></> },
  { id: 'obliques', shape: <><path d="M69 315 99 322 98 420 113 491 81 521 62 454Z"/><path d="M251 315 221 322 222 420 207 491 239 521 258 454Z"/><path d="M837 325 870 341 861 454 829 491 812 420Z"/></> },
  { id: 'transverse_abdominis', shape: <><path d="M99 420 156 424 156 512 125 513 108 479Z"/><path d="M221 420 164 424 164 512 195 513 212 479Z"/></> },

  { id: 'lats', shape: <><path d="M460 236 554 314 543 469 514 514 463 443 444 326Z"/><path d="M666 236 572 314 583 469 612 514 663 443 682 326Z"/><path d="M812 267 844 280 853 396 829 489 804 434Z"/></> },
  { id: 'erector_spinae', shape: <><path d="M532 306 559 323 558 514 526 487Z"/><path d="M594 306 567 323 568 514 600 487Z"/></> },
  { id: 'glutes', shape: <><path d="M462 487Q513 463 558 519L557 573Q513 609 463 580L447 536Z"/><path d="M664 487Q613 463 568 519L569 573Q613 609 663 580L679 536Z"/><path d="M812 465Q775 476 770 530L784 589 833 607 860 535 850 485Z"/></> },

  { id: 'hip_adductors', shape: <><path d="M119 537 156 545 156 688 142 736 111 633Z"/><path d="M201 537 164 545 164 688 178 736 209 633Z"/></> },
  { id: 'quads', shape: <><path d="M64 532 115 539 139 634 142 736 103 737 75 683 55 587Z"/><path d="M256 532 205 539 181 634 178 736 217 737 245 683 265 587Z"/><path d="M854 527 914 548 945 623 927 728 883 741 850 671 829 584Z"/></> },
  { id: 'hamstrings', shape: <><path d="M465 582 554 592 548 669 526 742 477 738 454 660Z"/><path d="M661 582 572 592 578 669 600 742 649 738 672 660Z"/><path d="M784 581 836 596 849 667 832 741 792 731 769 646Z"/></> },
  { id: 'calves', shape: <><path d="M82 747 142 751 148 817 126 936 100 974 72 915 60 825Z"/><path d="M238 747 178 751 172 817 194 936 220 974 248 915 260 825Z"/><path d="M480 745 548 750 553 824 525 945 500 978 471 924 458 827Z"/><path d="M646 745 578 750 573 824 601 945 626 978 655 924 668 827Z"/><path d="M802 741 856 748 869 824 846 944 820 980 792 920 779 825Z"/></> },
]

const HEAT = ['#f3a127', '#ec7c2e', '#dc5330', '#c53832', '#98252b']
const LEGACY_MUSCLE_IDS: Record<string, MuscleId> = { chest: 'mid_chest', front_delts: 'anterior_delts', triceps: 'triceps_lateral', biceps: 'biceps_long', core: 'rectus_abdominis' }
const level = (score: number) => Math.min(4, Math.max(0, Math.ceil(score / 20) - 1))

function ImageDiagram({ summary, compact }: { summary: MuscleLoadSummary; compact: boolean }) {
  const scores = new Map<MuscleId, number>()
  summary.entries.forEach((entry) => scores.set(LEGACY_MUSCLE_IDS[entry.id] ?? entry.id, entry.score))

  return <div className={`relative mx-auto w-full overflow-hidden bg-white ${compact ? 'max-w-sm' : 'max-w-2xl'}`}>
    <img src="/images/anatomy-muscle-reference.png" alt="Front, back, and side anatomical muscle diagram" className="block h-auto w-full" />
    <svg viewBox="0 0 1022 1024" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {REGIONS.map(({ id, shape }) => {
        const score = scores.get(id) ?? 0
        if (score <= 0) return null
        return <g key={id} fill={HEAT[level(score)]} fillOpacity="0.82" style={{ mixBlendMode: 'screen' }}>{shape}</g>
      })}
    </svg>
  </div>
}

export default function MuscleHeatmap({ summary, compact = false }: { summary: MuscleLoadSummary; compact?: boolean }) {
  if (compact) return <section className="border border-black bg-white p-2 text-black"><ImageDiagram summary={summary} compact /><div className="mt-2 flex h-2 overflow-hidden">{HEAT.map((colour) => <span key={colour} className="flex-1" style={{ backgroundColor: colour }} />)}</div></section>

  const activeMuscles = summary.entries.filter((entry) => entry.score > 0).slice(0, 8)
  return <section className="bg-white px-4 py-6 text-center font-sans text-black sm:px-6"><h3 className="text-3xl font-black uppercase leading-[0.9] tracking-tight">Anatomical<br/>Muscle Demand</h3><p className="mt-2 text-sm leading-tight">Session workload is highlighted directly on the supplied anatomy diagram.</p><p className="mt-1 text-base font-black">MODEL {summary.modelVersion}</p><div className="mt-4"><ImageDiagram summary={summary} compact={false} /></div><div className="mx-auto mt-3 flex h-8 max-w-sm">{HEAT.map((colour, index) => <span key={colour} className="flex flex-1 items-center justify-center text-sm font-black text-white" style={{ backgroundColor: colour }}>{index + 1}</span>)}</div><p className="mx-auto mt-3 max-w-lg text-xs font-medium leading-tight">{activeMuscles.map((entry) => `${entry.name} ${entry.score}`).join(' · ')}</p><p className="mx-auto mt-4 max-w-lg text-[10px] leading-tight">{summary.disclaimer}</p></section>
}
