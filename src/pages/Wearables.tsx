import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Check, ChevronRight, HeartPulse, Loader2, Lock, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/authContext'

type Provider = 'Apple Health' | 'Fitbit' | 'Garmin Connect'

const providers: Array<{ name: Provider; short: string; description: string; signals: string[]; mobileOnly?: boolean }> = [
  { name: 'Apple Health', short: 'AH', description: 'Bring Apple Watch heart rate, recovery, active energy, and workout data into FormFit.', signals: ['HEART RATE', 'ACTIVE ENERGY', 'SLEEP'], mobileOnly: true },
  { name: 'Fitbit', short: 'FB', description: 'Sync your daily readiness signals and tracked exercise from Fitbit.', signals: ['HEART RATE', 'STEPS', 'SLEEP'] },
  { name: 'Garmin Connect', short: 'GC', description: 'Connect Garmin training load, heart rate, and recovery data to your lifting log.', signals: ['HEART RATE', 'HRV', 'TRAINING LOAD'] },
]

export default function Wearables() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Provider | null>(null)

  useEffect(() => {
    if (status === 'anonymous') navigate('/login', { replace: true, state: { from: '/wearables' } })
  }, [status, navigate])

  if (status !== 'authenticated') return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>

  return (
    <div className="min-h-screen bg-background">
      <div className="noise" />
      <header className="border-b-2 border-foreground bg-background/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/terminal" className="flex items-center gap-2 text-xs font-bold tracking-[0.18em]"><ArrowLeft className="h-4 w-4" /> TERMINAL</Link>
          <Link to="/" className="text-xl font-bold tracking-tight">FORMFIT<span className="text-primary">*</span></Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
        <div className="max-w-2xl"><p className="mono-data text-[10px] tracking-[0.25em] text-primary">CONNECTED DEVICES / 04</p><h1 className="mt-3 text-4xl font-black uppercase leading-none sm:text-6xl">Train with the<br /><span className="font-serifit normal-case italic text-primary">full signal.</span></h1><p className="mt-5 max-w-xl text-muted-foreground">Connect the biometric signals around your lifts—then pair form, effort, and recovery in one training record.</p></div>

        <section className="mt-10 grid gap-4 lg:grid-cols-3">
          {providers.map((provider) => (
            <article key={provider.name} className="flex min-h-80 flex-col border-2 border-foreground bg-card p-5">
              <div className="flex items-start justify-between"><div className="flex h-12 w-12 items-center justify-center bg-foreground font-black text-background">{provider.short}</div>{provider.mobileOnly ? <span className="mono-data border border-foreground px-2 py-1 text-[8px] tracking-[0.14em]">IPHONE</span> : <span className="mono-data border border-foreground px-2 py-1 text-[8px] tracking-[0.14em]">OAUTH</span>}</div>
              <div className="mt-8"><h2 className="text-xl font-black uppercase">{provider.name}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{provider.description}</p></div>
              <div className="mt-6 flex flex-wrap gap-2">{provider.signals.map((signal) => <span key={signal} className="mono-data border border-foreground px-2 py-1 text-[8px] tracking-[0.14em]">{signal}</span>)}</div>
              <button type="button" onClick={() => setSelected(provider.name)} className="mt-auto flex w-full items-center justify-between border-2 border-foreground bg-background px-3 py-3 text-left text-xs font-bold transition-colors hover:bg-primary hover:text-primary-foreground"><span>CONNECT {provider.name.toUpperCase()}</span><ChevronRight className="h-4 w-4" /></button>
            </article>
          ))}
        </section>

        <section className="mt-8 grid gap-4 border-2 border-foreground bg-foreground p-5 text-background md:grid-cols-[auto_1fr] md:items-center"><div className="flex h-12 w-12 items-center justify-center border-2 border-background"><HeartPulse className="h-6 w-6 text-primary" /></div><div><p className="mono-data text-[9px] tracking-[0.2em] text-primary">WHAT GETS BETTER</p><p className="mt-1 text-sm">Workout intensity is enriched with real heart-rate response and recovery context—without sharing your health data in the social feed.</p></div></section>
      </main>

      {selected && <div className="fixed inset-0 z-[70] flex items-end bg-foreground/50 p-4 sm:items-center sm:justify-center"><div className="w-full max-w-md border-2 border-foreground bg-background p-6 shadow-[8px_8px_0_hsl(var(--foreground))]"><div className="flex h-10 w-10 items-center justify-center bg-primary text-primary-foreground"><Lock className="h-4 w-4" /></div><h2 className="mt-5 text-2xl font-black uppercase">{selected}<br />connection ready.</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">The secure connection flow is staged for this provider. Complete the provider setup when its developer credentials or native mobile companion are ready; your current training data stays private until then.</p><div className="mt-6 flex gap-3"><Button onClick={() => setSelected(null)} className="border-2 border-foreground font-bold">GOT IT <Check className="ml-2 h-4 w-4" /></Button><Link to="/terminal"><Button variant="outline" className="border-2 border-foreground"><Smartphone className="mr-2 h-4 w-4" /> BACK TO TERMINAL</Button></Link></div></div></div>}
    </div>
  )
}
