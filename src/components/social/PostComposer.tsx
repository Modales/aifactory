import { useEffect, useState } from 'react'
import { Plus, Send } from 'lucide-react'
import { api, type HistoryItem, type SocialActivity } from '@/lib/api'
import { social } from '@/lib/socialApi'
import { Avatar } from './SocialShell'

export default function PostComposer({ name, onPost }: { name: string; onPost: (item: SocialActivity) => void }) {
  const [open, setOpen] = useState(false)
  const [caption, setCaption] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'followers'>('followers')
  const [session, setSession] = useState('')
  const [workouts, setWorkouts] = useState<HistoryItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (open) void api.history({ limit: 100 }).then(h => setWorkouts(h.items)).catch(e => setError(e.message)) }, [open])
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { onPost(await social.post(caption, visibility, session || undefined)); setCaption(''); setSession(''); setOpen(false) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <section className="social-card composer"><div className="composer-prompt"><Avatar name={name} /><button onClick={() => setOpen(!open)} aria-expanded={open}>How did training go, {name.split(' ')[0]}?</button><Plus size={19} /></div>
    {open && <form onSubmit={submit} className="composer-form"><textarea aria-label="Post caption" placeholder="A breakthrough, a tough set, a small win…" value={caption} onChange={e => setCaption(e.target.value)} maxLength={2000} rows={3} /><label>Attach a saved set<select aria-label="Attach a saved set" value={session} onChange={e => setSession(e.target.value)}><option value="">Just an update</option>{workouts.map(w => <option key={w.id} value={w.id}>{w.exerciseName} · {w.totalReps} reps · {new Date(w.createdAt).toLocaleDateString()}</option>)}</select></label><div className="composer-footer"><select aria-label="Post visibility" value={visibility} onChange={e => setVisibility(e.target.value as typeof visibility)}><option value="followers">Followers only</option><option value="public">Everyone</option></select><button className="social-button primary" disabled={busy || (!caption.trim() && !session)}><Send size={15} />{busy ? 'Sharing…' : 'Share activity'}</button></div></form>}
    {error && <p className="social-error" role="alert">{error}</p>}
  </section>
}
