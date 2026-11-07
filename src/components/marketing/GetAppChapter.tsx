import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowRight, Download, Monitor, PlusSquare, Share } from 'lucide-react'
import { useAuth } from '@/lib/authContext'
import { getSurface } from '@/lib/platform'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { ChapterLabel, CoverFrame } from './primitives'
import { EASE } from './scroll'

function InstallSteps() {
  const { isIOS } = getSurface()
  const { canInstall, install } = useInstallPrompt()

  if (canInstall) {
    return (
      <button type="button" onClick={install} className="inline-flex items-center gap-2 border-2 border-[#F4F1EA] bg-primary px-6 py-4 text-sm font-bold uppercase tracking-wide shadow-[6px_6px_0_#F4F1EA] transition-transform hover:-translate-y-0.5">
        <Download className="h-4 w-4" /> Install FormFit
      </button>
    )
  }

  const steps = isIOS
    ? [
        { icon: Share, text: <>Tap <b>Share</b> in Safari's toolbar</> },
        { icon: PlusSquare, text: <>Choose <b>Add to Home Screen</b></> },
        { icon: ArrowRight, text: <>Open <b>FormFit</b> from your home screen</> },
      ]
    : [
        { icon: Share, text: <>Open your browser menu <b>⋮</b></> },
        { icon: PlusSquare, text: <>Tap <b>Install app</b> or <b>Add to Home screen</b></> },
        { icon: ArrowRight, text: <>Open <b>FormFit</b> from your home screen</> },
      ]

  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {steps.map(({ icon: Icon, text }, i) => (
        <li key={i} className="border-2 border-[#F4F1EA]/80 bg-[#0E0C0A]/70 p-4 backdrop-blur">
          <span className="mono-data text-[10px] tracking-[0.24em] text-primary">STEP {i + 1}</span>
          <Icon className="mt-3 h-6 w-6" />
          <p className="mt-2 text-sm leading-snug">{text}</p>
        </li>
      ))}
    </ol>
  )
}

function OpenActions() {
  const { status } = useAuth()
  const signedIn = status === 'authenticated'
  return (
    <div>
      <div className="flex flex-wrap items-center gap-5">
        <Link to={signedIn ? '/dashboard' : '/signup'} className="inline-flex items-center gap-2 border-2 border-[#F4F1EA] bg-primary px-6 py-4 text-sm font-bold uppercase tracking-wide shadow-[6px_6px_0_#F4F1EA] transition-transform hover:-translate-y-0.5">
          <Monitor className="h-4 w-4" /> {signedIn ? 'Open the app' : 'Create your free account'}
        </Link>
        {!signedIn && <Link to="/login" className="mono-data text-[11px] tracking-[0.24em] underline underline-offset-4">I ALREADY HAVE ONE</Link>}
      </div>
    </div>
  )
}

export default function GetAppChapter() {
  const { device } = getSurface()

  return (
    <section id="get-app" className="relative min-h-[100svh] scroll-mt-0 overflow-hidden bg-[#0E0C0A]">
      <CoverFrame src="/marketing/final.jpg" alt="An athlete in a cap catching his breath between sets in a dark gym" ratio={1067 / 1600} focus={[0.5, 0.3]} imgClassName="brightness-[0.75]" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0E0C0A] via-[#0E0C0A]/75 to-[#0E0C0A]/40 md:bg-gradient-to-r md:from-[#0E0C0A] md:via-[#0E0C0A]/85 md:to-[#0E0C0A]/20" />

      <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.8, ease: EASE }} className="relative mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-end px-5 pb-20 pt-32 md:justify-center">
        <ChapterLabel index="07" title="Your move" />
        <h2 className="mt-5 max-w-3xl text-[clamp(2.8rem,8vw,7rem)] font-bold uppercase leading-[0.85] tracking-[-0.03em]">
          Start your <span className="font-serifit block normal-case italic tracking-normal text-primary">first set.</span>
        </h2>
        <p className="mt-5 max-w-md text-base leading-relaxed text-[#F4F1EA]/75">
          FormFit runs right in your browser on any phone, tablet or computer. Point the camera, step back, lift.
        </p>
        <div className="mt-10"><OpenActions /></div>
        {device !== 'desktop' && (
          <div className="mt-12">
            <p className="mono-data mb-4 text-[10px] tracking-[0.24em] text-[#F4F1EA]/70">OR ADD IT TO YOUR HOME SCREEN</p>
            <InstallSteps />
          </div>
        )}
      </motion.div>
    </section>
  )
}
