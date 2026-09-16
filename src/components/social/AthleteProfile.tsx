import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { social, type AthleteDetail } from '@/lib/socialApi'
import { useAuth } from '@/lib/authContext'
import { Avatar } from './SocialShell'

export default function AthleteProfile({ id, onClose, onChange }: { id: string | null; onClose: () => void; onChange: () => void }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<AthleteDetail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!id) return; let active = true; setProfile(null); setError(''); social.profile(id).then(p => active && setProfile(p)).catch(e => active && setError(e.message)); return () => { active = false } }, [id])
  async function follow() {
    if (!profile) return; setBusy(true); setError('')
    try { await social.follow(profile.id, profile.following); setProfile(await social.profile(profile.id)); onChange() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <Dialog open={!!id} onOpenChange={open => !open && onClose()}><DialogContent className="social-dialog"><DialogHeader><DialogTitle>Athlete profile</DialogTitle><DialogDescription>Training is better with people in your corner.</DialogDescription></DialogHeader>{error && <p className="social-error" role="alert">{error}</p>}{profile ? <><div className="profile-hero"><Avatar name={profile.displayName} large /><h2>{profile.displayName}</h2><p>Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p><div className="profile-counts"><span><strong>{profile.followerCount}</strong> Followers</span><span><strong>{profile.followingCount}</strong> Following</span></div>{profile.id !== user?.id && <button className="social-button primary" disabled={busy} onClick={follow}>{profile.following ? 'Unfollow athlete' : 'Follow athlete'}</button>}</div><h3 className="font-bold">Shared activities</h3>{profile.activities.length ? profile.activities.map(a => <div className="profile-activity" key={a.id}><strong>{a.workout?.exerciseName ?? 'Training update'}</strong><p>{a.caption}</p><span>{new Date(a.createdAt).toLocaleDateString()}{a.workout ? ` · ${a.workout.totalReps} reps` : ''}</span></div>) : <p className="social-muted">No activities shared with you yet.</p>}</> : !error && <p>Loading athlete…</p>}</DialogContent></Dialog>
}
