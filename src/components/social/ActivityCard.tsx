import { useState } from 'react'
import { Dumbbell, Globe, Heart, LockKeyhole, MessageCircle, Send } from 'lucide-react'
import { social, type Comment } from '@/lib/socialApi'
import type { SocialActivity } from '@/lib/api'
import { Avatar } from './SocialShell'

export default function ActivityCard({ item, onUpdate, onProfile }: { item: SocialActivity; onUpdate: (item: SocialActivity) => void; onProfile: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function toggleComments() {
    if (expanded) { setExpanded(false); return }
    setBusy(true); setError('')
    try { setComments(await social.comments(item.id)); setExpanded(true) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function kudos() {
    setBusy(true); setError('')
    try { onUpdate(await social.kudos(item.id, item.reactedByMe)) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault(); if (!body.trim()) return
    setBusy(true); setError('')
    try { const comment = await social.comment(item.id, body.trim()); setComments(c => [...c, comment]); setBody(''); onUpdate({ ...item, commentCount: item.commentCount + 1 }) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <article className="social-card activity-card" data-activity-id={item.id}>
    <div className="activity-author"><button onClick={() => onProfile(item.author.id)}><Avatar name={item.author.displayName} /></button><div><button className="athlete-name" onClick={() => onProfile(item.author.id)}>{item.author.displayName}</button><p>{new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}<span> · </span>{item.visibility === 'public' ? <Globe size={11} /> : <LockKeyhole size={11} />}{item.visibility === 'public' ? 'Everyone' : 'Followers'}</p></div><Dumbbell className="activity-type" size={19} /></div>
    <div className="activity-body">{item.workout && <h2>{item.workout.exerciseName} session</h2>}{item.caption && <p className="activity-caption">{item.caption}</p>}
      {item.workout && <><div className="activity-stats"><div><span>Repetitions</span><strong>{item.workout.totalReps}<small> reps</small></strong></div><div><span>Moving time</span><strong>{Math.floor(item.workout.durationSeconds/60)}<small>m </small>{Math.round(item.workout.durationSeconds%60)}<small>s</small></strong></div><div><span>Recorded form</span><strong>{Math.round(item.workout.avgFormScore)}<small> / 100</small></strong></div></div>
      <div className="workout-art"><div className="workout-art-icon"><Dumbbell size={50} strokeWidth={1.2} /></div><div><span>THE WORK ADDS UP.</span><strong>One session stronger.</strong><p>{item.workout.exerciseName} · {item.workout.totalReps} reps logged</p></div></div></>}
    </div>
    <div className="activity-totals">{item.reactionCount > 0 ? `${item.reactionCount} kudos` : 'Be the first to give kudos'}<span>{item.commentCount} comments</span></div>
    <div className="activity-actions"><button disabled={busy} aria-pressed={item.reactedByMe} onClick={kudos}><Heart size={18} fill={item.reactedByMe ? 'currentColor' : 'none'} />{item.reactedByMe ? 'Kudos given' : 'Give kudos'}</button><button disabled={busy} aria-expanded={expanded} onClick={toggleComments}><MessageCircle size={18} />{expanded ? 'Hide comments' : 'Comment'}</button></div>
    {expanded && <div className="activity-comments">{comments.length ? comments.map(c => <div className="comment-row" key={c.id}><Avatar name={c.author.displayName} /><div><button className="athlete-name" onClick={() => onProfile(c.author.id)}>{c.author.displayName}</button><p>{c.body}</p></div></div>) : <p className="social-muted">Start the conversation.</p>}<form onSubmit={send} className="comment-form"><input aria-label="Write a comment" placeholder="Keep the encouragement going…" value={body} onChange={e => setBody(e.target.value)} maxLength={1000} required /><button aria-label="Send comment" className="social-button primary" disabled={busy || !body.trim()}><Send size={16} /></button></form></div>}
    {error && <p className="social-error" role="alert">{error}</p>}
  </article>
}
