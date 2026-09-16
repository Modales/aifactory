import { useEffect, useState } from 'react'
import { Search, Trophy, Users, Plus, ArrowRight } from 'lucide-react'
import { api, type SocialClub, type SocialChallenge } from '@/lib/api'
import { social, type Athlete, type Leaderboard } from '@/lib/socialApi'
import { Avatar } from './SocialShell'

export default function CommunityPanels({ tab, onProfile, onChange }: { tab: 'athletes' | 'clubs' | 'challenges'; onProfile: (id: string) => void; onChange: () => void }) {
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [clubs, setClubs] = useState<SocialClub[]>([])
  const [challenges, setChallenges] = useState<SocialChallenge[]>([])
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [metric, setMetric] = useState('reps')
  const [end, setEnd] = useState('')
  const [board, setBoard] = useState<Leaderboard | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([social.athletes(), api.clubs(), api.challenges()]).then(([a, c, h]) => { if (active) { setAthletes(a); setClubs(c); setChallenges(h) } }).catch(e => active && setError(e.message)).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); onChange() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  function create(e: React.FormEvent) {
    e.preventDefault()
    void run(async () => {
      if (tab === 'clubs') { const club = await social.createClub(name.trim(), description.trim()); setClubs(c => [club, ...c]) }
      else { const challenge = await social.createChallenge(name.trim(), metric, end); setChallenges(c => [challenge, ...c]) }
      setName(''); setDescription(''); setCreating(false)
    })
  }
  return <section className="social-card community-panel"><div className="section-heading"><div><span className="eyebrow">BETTER TOGETHER</span><h2>{tab === 'athletes' ? 'Find your people' : tab === 'clubs' ? 'Your next training crew' : 'A little friendly competition'}</h2></div>{tab !== 'athletes' && <button className="social-button" onClick={() => setCreating(!creating)}><Plus size={15} />{creating ? 'Cancel' : 'Create'}</button>}</div>
    {error && <p className="social-error" role="alert">{error}</p>}
    {creating && tab !== 'athletes' && <form className="community-create" onSubmit={create}><label>Name<input aria-label={`${tab === 'clubs' ? 'Club' : 'Challenge'} name`} value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={100} required /></label>{tab === 'clubs' ? <label>Description<textarea aria-label="Club description" value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} /></label> : <><label>Goal metric<select aria-label="Challenge metric" value={metric} onChange={e => setMetric(e.target.value)}><option value="reps">Total repetitions</option><option value="sessions">Workouts completed</option><option value="durationSeconds">Training time (seconds)</option></select></label><label>Ends at<input aria-label="Challenge end" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} required min={new Date(Date.now()+60_000).toLocaleString('sv-SE').slice(0,16).replace(' ', 'T')} /></label></>}<p className="social-muted">{tab === 'clubs' ? 'Public clubs are open to every athlete.' : 'Joining makes your challenge total visible to other participants.'}</p><button className="social-button primary" disabled={busy || name.trim().length < 2}>Create {tab === 'clubs' ? 'club' : 'challenge'}</button></form>}
    {tab === 'athletes' && <form className="athlete-search" onSubmit={e => { e.preventDefault(); void run(async () => setAthletes(await social.athletes(query))) }}><Search size={17} /><input aria-label="Search athletes" placeholder="Search athletes by name" value={query} onChange={e => setQuery(e.target.value)} /><button className="social-button" disabled={busy}>Search</button></form>}
    {loading ? <p className="social-empty">Finding your community…</p> : <div className="community-list">
      {tab === 'athletes' && (athletes.length ? athletes.map(a => <div className="community-row" key={a.id}><button onClick={() => onProfile(a.id)}><Avatar name={a.displayName} /></button><div><button className="athlete-name" onClick={() => onProfile(a.id)}>{a.displayName}</button><p>{a.followerCount} followers</p></div><button disabled={busy} className={`social-button ${a.following ? '' : 'primary'}`} onClick={() => void run(async () => { await social.follow(a.id, a.following); setAthletes(items => items.map(item => item.id === a.id ? { ...item, following: !a.following, followerCount: item.followerCount + (a.following ? -1 : 1) } : item)) })}>{a.following ? 'Unfollow' : 'Follow'}</button></div>) : <div className="social-empty"><Users /><h3>No athletes found yet</h3><p>Try another name, or invite a training friend to join FormFit.</p></div>)}
      {tab === 'clubs' && (clubs.length ? clubs.map(c => <div className="community-row" key={c.id}><span className="community-icon"><Users size={23} /></span><div><h3>{c.name}</h3><p>{c.description}</p><span className="social-muted">{c.memberCount} members · {c.isPrivate ? 'Private' : 'Public'}</span></div><button className="social-button" disabled={busy || c.joined || c.isPrivate} onClick={() => void run(async () => { const updated = await api.joinClub(c.id); setClubs(items => items.map(item => item.id === c.id ? updated : item)) })}>{c.joined ? 'Joined' : c.isPrivate ? 'Private' : 'Join club'}</button></div>) : <div className="social-empty"><Users /><h3>Every crew starts with someone</h3><p>Create the first club and give your training partners a place to belong.</p></div>)}
      {tab === 'challenges' && (challenges.length ? challenges.map(c => <div className="community-row" key={c.id}><span className="community-icon trophy"><Trophy size={23} /></span><div><h3>{c.name}</h3><p>{c.participantCount} athletes · Ends {new Date(c.endsAt).toLocaleDateString()}</p><span className="social-muted">{c.metric === 'durationSeconds' ? 'Training seconds' : c.metric === 'sessions' ? 'Workouts completed' : 'Total repetitions'}</span></div><button className="social-button" disabled={busy} onClick={() => void run(async () => { if (!c.joined) { const updated = await api.joinChallenge(c.id); setChallenges(items => items.map(item => item.id === c.id ? updated : item)) } else setBoard(await social.leaderboard(c.id)) })}>{c.joined ? 'Leaderboard' : 'Join challenge'}<ArrowRight size={14} /></button></div>) : <div className="social-empty"><Trophy /><h3>Set the next challenge</h3><p>Pick a goal, bring your crew, and make consistency count.</p></div>)}
    </div>}
    {board && <section className="leaderboard"><div className="section-heading"><h3>{board.challenge.name}</h3><button onClick={() => setBoard(null)} className="social-button">Close leaderboard</button></div><p className="social-muted">Ranked by {board.challenge.metric === 'durationSeconds' ? 'training seconds' : board.challenge.metric === 'sessions' ? 'workouts completed' : 'repetitions'}</p>{board.entries.map(e => <div className="leaderboard-row" key={e.athlete.id}><span>#{e.rank}</span><button onClick={() => onProfile(e.athlete.id)}>{e.athlete.displayName}</button><strong>{e.value.toLocaleString()}</strong></div>)}</section>}
  </section>
}
