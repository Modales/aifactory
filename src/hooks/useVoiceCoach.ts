import { useEffect, useRef, useState } from 'react'
import type { AnalysisReport } from '@/lib/analysisApi'

const KEY = 'formfit.voiceCoach'
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

/** Speaks each new rep count (and its main fix) so the athlete never has to look at the screen mid-set. */
export function useVoiceCoach(report: AnalysisReport | null) {
  const [enabled, setEnabled] = useState(() => supported && localStorage.getItem(KEY) !== 'off')
  const spoken = useRef(0)
  const toggle = () => setEnabled(on => {
    localStorage.setItem(KEY, on ? 'off' : 'on')
    if (on) window.speechSynthesis.cancel()
    return !on
  })

  useEffect(() => {
    const rep = report?.reps.at(-1)
    if (!rep) { spoken.current = 0; return }
    if (rep.index <= spoken.current) return
    spoken.current = rep.index
    if (!enabled) return
    const issue = rep.checks.filter(c => !c.passed).sort((a, b) => a.score - b.score)[0]
    // Short phrases only: the cue's final sentence is the action ("Sit lower."), not the measurement.
    const text = issue ? `${rep.index}. ${issue.cue.split(/(?<=\.)\s/).at(-1)}` : `${rep.index}`
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { rate: 1.1 }))
  }, [report, enabled])

  useEffect(() => () => { if (supported) window.speechSynthesis.cancel() }, [])
  return { supported, enabled, toggle }
}
