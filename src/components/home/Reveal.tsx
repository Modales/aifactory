import { motion } from 'framer-motion'

export const EASE = [0.22, 1, 0.36, 1] as const

const rise = {
  hidden: { opacity: 0, y: 32 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.09, duration: 0.7, ease: EASE },
  }),
}

interface RevealProps {
  children: React.ReactNode
  className?: string
  /** stagger index */
  i?: number
  /** animate on mount instead of when scrolled into view */
  onMount?: boolean
}

/** Shared rise-in animation used across the landing page. */
export default function Reveal({ children, className, i = 0, onMount = false }: RevealProps) {
  return (
    <motion.div
      className={className}
      variants={rise}
      initial="hidden"
      custom={i}
      {...(onMount
        ? { animate: 'show' }
        : { whileInView: 'show', viewport: { once: true, margin: '-60px' } })}
    >
      {children}
    </motion.div>
  )
}
