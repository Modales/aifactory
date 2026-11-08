import { motion, useScroll, useSpring } from 'framer-motion'

/** Thin page-progress bar pinned under the header. */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 24, mass: 0.3 })
  return (
    <motion.div
      aria-hidden
      className="absolute inset-x-0 -bottom-[2px] h-[3px] origin-left bg-primary"
      style={{ scaleX }}
    />
  )
}
