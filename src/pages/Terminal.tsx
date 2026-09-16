import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, ChevronRight, Dumbbell, Flame, Mountain, Trophy, Users } from 'lucide-react'
import SocialShell, { Avatar } from '@/components/social/SocialShell'
import ActivityCard from '@/components/social/ActivityCard'
import PostComposer from '@/components/social/PostComposer'
import CommunityPanels from '@/components/social/CommunityPanels'
import AthleteProfile from '@/components/social/AthleteProfile'
import { api, type HistoryStats, type SocialActivity, type SocialClub, type SocialChallenge } from '@/lib/api'
import { social, type Athlete } from '@/lib/socialApi'
import { useAuth } from '@/lib/authContext'

type Tab = 'feed' | 'athletes' | 'clubs' | 'challenges'
export default function Terminal() {
  const { user, status } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('feed')
  const [scope, setScope] = useState('everyone')
  const [feed, setFeed] = useState<SocialActivity[]>([])
  const [stats, setStats] = useState<HistoryStats | null>(null)
  const [clubs, setClubs] = useState<SocialClub[]>([])
  const [challenges, setChallenges] = useState<SocialChallenge[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [profile, setProfile] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const refreshCommunity = useCallback(() => {
    if (status !== 'authenticated') return
    void Promise.all([api.stats(), api.clubs(), api.challenges(), social.athletes()]).then(([s,c,h,a]) => { setStats(s); setClubs(c); setChallenges(h); setAthletes(a) }).catch(e => setError(e.message))
  }, [status])
  useEffect(() => { if (status === 'anonymous') navigate('/login', { replace: true, state: { from: '/dashboard' } }) }, [status, navigate])
  useEffect(refreshCommunity, [refreshCommunity])
  useEffect(() => {
    if (status !== 'authenticated') return
    let active = true; setLoading(true); setError('')
    social.feed(scope).then(f => { if (active) { setFeed(f.items); setMore(f.items.length === 20); setOffset(f.items.length) } }).catch(e => active && setError(e.message)).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [status, scope])
  const update = (item: SocialActivity) => setFeed(items => items.map(a => a.id === item.id ? item : a))
  async function loadMore() {
    setLoadingMore(true)
    try { const f = await social.feed(scope, offset); setFeed(items => [...items, ...f.items.filter(a => !items.some(b => b.id === a.id))]); setOffset(offset + f.items.length); setMore(f.items.length === 20) } catch (e) { setError((e as Error).message) } finally { setLoadingMore(false) }
  }
  if (status !== 'authenticated') return <SocialShell><p className="social-empty">Opening your training community…</p></SocialShell>
  return <SocialShell><div className="social-layout">
    <aside className="social-left"><section className="social-card athlete-summary"><div className="athlete-cover"><span /><span /><span /></div><button className="athlete-summary-avatar" onClick={() => setProfile(user!.id)}><Avatar name={user!.displayName} large /></button><h2>{user?.displayName}</h2><p>Make your next rep count.</p><div className="athlete-mini-stats"><div><span>Sets</span><strong>{stats?.totalSessions ?? '—'}</strong></div><div><span>Reps</span><strong>{stats?.totalReps.toLocaleString() ?? '—'}</strong></div><div><span>Hours</span><strong>{stats ? (stats.totalDurationSeconds/3600).toFixed(1) : '—'}</strong></div></div><button className="text-link" onClick={() => setProfile(user!.id)}>View your profile <ChevronRight size={14} /></button></section>
      <section className="social-card training-summary"><div className="section-heading"><h3>Your training</h3><Flame size={17} /></div><p className="social-muted">All-time consistency</p><strong className="training-number">{stats?.totalReps.toLocaleString() ?? '—'}<span> reps logged</span></strong><div className="training-rule" /><p className="social-muted">{stats?.lastSessionAt ? `Last session ${new Date(stats.lastSessionAt).toLocaleDateString()}` : 'Your first session is your starting line.'}</p><Link to="/history" className="text-link">View training log <ArrowRight size={14} /></Link></section>
      <div className="left-caption">YOUR EFFORT. YOUR PEOPLE.<br /><strong>Your kind of progress.</strong></div>
    </aside>
    <main className="social-main"><div className="feed-heading"><div><span className="eyebrow">THE EVERYDAY ATHLETE</span><h1>Good work.<br /><span>Better together.</span></h1></div><span className="feed-heading-icon"><Dumbbell size={31} strokeWidth={1.5} /></span></div>
      <div className="social-tabs" role="tablist" aria-label="Community sections">{(['feed','athletes','clubs','challenges'] as const).map(t => <button key={t} role="tab" aria-selected={tab===t} onClick={() => setTab(t)}>{t === 'feed' ? 'Activity feed' : t.charAt(0).toUpperCase()+t.slice(1)}</button>)}</div>
      {error && <div className="social-error" role="alert">{error}<button className="text-link" onClick={() => { setError(''); refreshCommunity() }}>Retry community</button></div>}
      {tab === 'feed' ? <><PostComposer name={user!.displayName} onPost={item => setFeed(items => [item,...items])} /><div className="feed-filter"><h2>Your daily motivation</h2><select aria-label="Feed audience" value={scope} onChange={e => setScope(e.target.value)}><option value="everyone">Everyone</option><option value="following">Following</option></select></div><div className="feed-items">{loading ? <section className="social-card social-empty">Loading activities…</section> : feed.length ? feed.map(item => <ActivityCard key={item.id} item={item} onUpdate={update} onProfile={setProfile} />) : <section className="social-card feed-empty"><div className="empty-illustration"><Mountain size={82} strokeWidth={1} /><span className="empty-sun" /></div><span className="eyebrow">EVERY STORY STARTS SOMEWHERE</span><h2>Your next chapter starts here.</h2><p>Log a workout. Share the small wins.<br />Find the people who keep you showing up.</p><div><Link className="social-button primary" to="/session">Start workout <ArrowRight size={16} /></Link><button className="social-button" onClick={() => setTab('athletes')}>Find athletes</button></div></section>}</div>{more && <button className="social-button load-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load more activities'}</button>}</> : <CommunityPanels key={tab} tab={tab} onProfile={setProfile} onChange={refreshCommunity} />}
    </main>
    <aside className="social-right"><section className="challenge-feature"><span className="eyebrow">SHOW UP FOR YOURSELF</span><Trophy size={43} strokeWidth={1.25} /><h2>A little challenge.<br />A lot of progress.</h2><p>Turn one more rep into a shared goal.</p><button onClick={() => setTab('challenges')}>Explore challenges <ArrowRight size={16} /></button></section>
      <section className="social-card rail-card"><div className="section-heading"><h3>Find your crew</h3><Users size={17} /></div>{clubs.slice(0,3).map(c => <button key={c.id} className="rail-row" onClick={() => setTab('clubs')}><span className="rail-icon"><Users size={16} /></span><span><strong>{c.name}</strong><small>{c.memberCount} members</small></span><ChevronRight size={14} /></button>)}{!clubs.length && <p className="social-muted">From your local gym to your lifting partners. There’s a crew waiting to happen.</p>}<button className="text-link" onClick={() => setTab('clubs')}>Discover clubs <ArrowRight size={14} /></button></section>
      <section className="social-card rail-card"><div className="section-heading"><h3>Athletes to know</h3></div>{athletes.slice(0,3).map(a => <button key={a.id} className="rail-row" onClick={() => setProfile(a.id)}><Avatar name={a.displayName} /><span><strong>{a.displayName}</strong><small>{a.followerCount} followers</small></span><ChevronRight size={14} /></button>)}{!athletes.length && <p className="social-muted">Bring your training partners along. Progress is better shared.</p>}<button className="text-link" onClick={() => setTab('athletes')}>Find athletes <ArrowRight size={14} /></button></section>
      {challenges.filter(c => c.joined).length > 0 && <button className="joined-challenge-note" onClick={() => setTab('challenges')}><Trophy size={17} />{challenges.filter(c=>c.joined).length} challenges joined<ChevronRight size={14} /></button>}
      <footer className="social-footer">FORMFIT / BUILT FOR THE LONG RUN.<p>Train with intention. Connect through effort.</p></footer>
    </aside>
  </div><AthleteProfile id={profile} onClose={() => setProfile(null)} onChange={refreshCommunity} /></SocialShell>
}
