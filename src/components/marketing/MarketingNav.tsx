import { useState } from 'react'
import { Link } from 'react-router'
import { motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { getSurface } from '@/lib/platform'
import { PrimaryCta } from './primitives'
import { scrollToId } from './scroll'

const LINKS = [
  ['The story', 'story'],
  ['How it works', 'how'],
  ['Movements', 'movements'],
  ['Crew', 'crew'],
] as const

export default function MarketingNav() {
  const { scrollY, scrollYProgress } = useScroll()
  const [solid, setSolid] = useState(false)
  useMotionValueEvent(scrollY, 'change', (value) => setSolid(value > 40))
  const desktop = getSurface().device === 'desktop'

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${solid ? 'border-b border-white/10 bg-[#0E0C0A]/85 backdrop-blur-md' : ''}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-xl font-bold tracking-tight">
          FORMFIT<span className="text-primary">*</span>
        </button>
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Website">
          {LINKS.map(([label, id]) => (
            <button key={id} type="button" onClick={() => scrollToId(id)} className="underline-sweep mono-data whitespace-nowrap text-[11px] tracking-[0.22em] text-[#F4F1EA]/75 hover:text-[#F4F1EA]">
              {label.toUpperCase()}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          {desktop && (
            <Link to="/login" className="mono-data hidden text-[11px] tracking-[0.22em] text-[#F4F1EA]/75 hover:text-[#F4F1EA] whitespace-nowrap sm:block">
              LOG IN
            </Link>
          )}
          <PrimaryCta size="sm" />
        </div>
      </div>
      <motion.div className="absolute bottom-0 left-0 h-[2px] w-full origin-left bg-primary" style={{ scaleX: scrollYProgress }} />
    </header>
  )
}
