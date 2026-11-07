import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import { motion, type MotionStyle } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

/**
 * Fills its positioned parent like `object-fit: cover`, but as a real box, so children
 * positioned in percentages stay pinned to the same spot of the photo at any viewport shape.
 */
export function CoverFrame({
  src,
  alt,
  ratio,
  focus = [0.5, 0.5],
  style,
  imgClassName = '',
  eager = false,
  children,
}: {
  src: string
  alt: string
  ratio: number
  focus?: [number, number]
  style?: MotionStyle
  imgClassName?: string
  eager?: boolean
  children?: ReactNode
}) {
  const box = {
    '--w': `max(100cqw, calc(100cqh * ${ratio}))`,
    '--h': `max(100cqh, calc(100cqw / ${ratio}))`,
    width: 'var(--w)',
    height: 'var(--h)',
    left: `calc((100cqw - var(--w)) * ${focus[0]})`,
    top: `calc((100cqh - var(--h)) * ${focus[1]})`,
  } as CSSProperties
  return (
    <div className="absolute inset-0 overflow-hidden [container-type:size]">
      <div className="absolute" style={box}>
        <motion.div className="relative h-full w-full" style={style}>
          <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" className={`block h-full w-full select-none ${imgClassName}`} draggable={false} />
          {children}
        </motion.div>
      </div>
    </div>
  )
}

export function ChapterLabel({ index, title, className = '' }: { index: string; title: string; className?: string }) {
  return (
    <p className={`mono-data flex items-center gap-3 text-[10px] font-semibold tracking-[0.32em] text-primary ${className}`}>
      <span className="inline-block h-px w-8 bg-primary" />
      CHAPTER {index} / {title.toUpperCase()}
    </p>
  )
}

/** The one call to action: open the app on any device. */
export function PrimaryCta({ size = 'lg', className = '' }: { size?: 'sm' | 'lg'; className?: string }) {
  const base = `group inline-flex items-center gap-2 whitespace-nowrap border-2 border-[#F4F1EA] bg-primary font-bold uppercase tracking-wide text-[#F4F1EA] transition-transform hover:-translate-y-0.5 ${
    size === 'lg' ? 'px-6 py-4 text-sm shadow-[6px_6px_0_#F4F1EA]' : 'px-4 py-2 text-xs'
  } ${className}`
  return (
    <Link to="/dashboard" className={base}>
      Open the app <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Link>
  )
}
