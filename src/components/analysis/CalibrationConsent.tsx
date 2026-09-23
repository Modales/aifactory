import { useEffect, useState } from 'react'
import { Database } from 'lucide-react'
import { fetchCalibrationConsent, setCalibrationConsent, type CalibrationConsent as Consent } from '@/lib/analysisApi'

/**
 * Opt-in terms for storing body-point data from each finished set to calibrate detection.
 * Asked once (per terms version); the athlete can change their answer at any time.
 */
export default function CalibrationConsent() {
  const [consent, setConsent] = useState<Consent | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchCalibrationConsent().then(c => { setConsent(c); setOpen(!c.decided) }).catch(() => {}) }, [])

  async function decide(accepted: boolean) {
    setBusy(true); setError('')
    try { setConsent(await setCalibrationConsent(accepted)); setOpen(false) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  if (!consent) return null
  if (!open) return (
    <p className="setup-note calibration-status">
      <Database size={13} />
      {consent.accepted ? `Sharing body-point data to improve detection · ${consent.recordings} set${consent.recordings === 1 ? '' : 's'} stored.` : 'Not sharing body-point data.'}
      <button className="link-button" onClick={() => setOpen(true)}>Change</button>
    </p>
  )

  return (
    <section className="record-card pad calibration-card" aria-labelledby="calibration-title">
      <p className="record-section-title" id="calibration-title">Help improve detection — terms</p>
      <ul className="calibration-terms">
        <li>If you agree, every set you finish stores the <strong>body-point positions</strong> (33 joint coordinates per frame), the chosen or confirmed exercise, and the detected result.</li>
        <li><strong>No video or images</strong> are ever stored. Video stays on your device; to identify the exercise, a few small stills are sent to the AI model (OpenAI via OpenRouter) and discarded.</li>
        <li>The data is used only to test and calibrate exercise detection and rep counting in this app. It is not sold or shared with third parties.</li>
        <li>You can change your answer at any time. Choosing <em>No</em> deletes every set already stored.</li>
      </ul>
      {error && <p className="record-error" role="alert">{error}</p>}
      <div className="calibration-actions">
        <button className="solid-button" disabled={busy} onClick={() => void decide(true)}>Yes, I agree</button>
        <button className="ghost-button" disabled={busy} onClick={() => void decide(false)}>No thanks</button>
      </div>
    </section>
  )
}
