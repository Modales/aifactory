import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  ArrowRight,
  ChevronRight,
  Dumbbell,
  Flame,
  Heart,
  Loader2,
  Lock,
  MessageCircle,
  Trophy,
  Users,
} from 'lucide-react'
import WorkspaceHeader from '@/components/WorkspaceHeader'
import WorkoutVolumeTrend from '@/components/WorkoutVolumeTrend'
import MuscleHeatmap from '@/components/MuscleHeatmap'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { HistoryItem, HistoryStats, SocialActivity, SocialChallenge, SocialClub } from '@/lib/api'
import { useAuth } from '@/lib/authContext'

function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return 'JUST NOW'
  if (minutes < 60) return `${minutes}M AGO`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}H AGO`
  return `${Math.floor(minutes / 1440)}D AGO`
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}M ${Math.round(seconds % 60)}S`
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-2 border-foreground bg-card p-4">
      <p className="mono-data text-[9px] tracking-[0.22em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-black tabular-nums ${accent ? 'text-primary' : ''}`}>{value}</p>
    </div>
  )
}

function FeedCard({ item, onReact }: { item: SocialActivity; onReact: (id: string) => void }) {
  return (
    <article className="border-2 border-foreground bg-card">
      <div className="flex items-start justify-between border-b border-foreground/20 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center bg-foreground text-sm font-black text-background">
            {item.author.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="font-bold">{item.author.displayName}</p>
            <p className="mono-data mt-0.5 text-[9px] tracking-[0.16em] text-muted-foreground">{relativeTime(item.createdAt)} · {item.visibility.toUpperCase()}</p>
          </div>
        </div>
        <Dumbbell className="h-4 w-4 text-primary" />
      </div>
      <div className="p-4">
        {item.caption && <p className="text-sm leading-relaxed">{item.caption}</p>}
        {item.workout && (
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-3 border-2 border-foreground bg-background p-3">
            <div>
              <p className="mono-data text-[9px] tracking-[0.18em] text-primary">WORKOUT COMPLETE</p>
              <p className="mt-1 font-bold uppercase">{item.workout.exerciseName}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-black">{item.workout.totalReps} <span className="mono-data text-[9px]">REPS</span></p>
              <p className="mono-data text-[9px] text-muted-foreground">FORM {Math.round(item.workout.avgFormScore)} · {formatDuration(item.workout.durationSeconds)}</p>
            </div>
            {item.workout.muscleLoad.entries.length > 0 && (
              <div className="col-span-2">
                <MuscleHeatmap summary={item.workout.muscleLoad} compact />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex border-t-2 border-foreground">
        <button type="button" onClick={() => onReact(item.id)} className={`flex flex-1 items-center justify-center gap-2 border-r-2 border-foreground py-3 text-xs font-bold transition-colors ${item.reactedByMe ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
          <Heart className={`h-4 w-4 ${item.reactedByMe ? 'fill-current' : ''}`} /> {item.reactionCount} KUDOS
        </button>
        <button type="button" className="flex flex-1 items-center justify-center gap-2 py-3 text-xs font-bold hover:bg-muted">
          <MessageCircle className="h-4 w-4" /> {item.commentCount} COMMENTS
        </button>
      </div>
    </article>
  )
}

export default function Terminal() {
  const { user, status } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<HistoryStats | null>(null)
  const [workouts, setWorkouts] = useState<HistoryItem[]>([])
  const [feed, setFeed] = useState<SocialActivity[]>([])
  const [clubs, setClubs] = useState<SocialClub[]>([])
  const [challenges, setChallenges] = useState<SocialChallenge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'anonymous') navigate('/login', { replace: true, state: { from: '/dashboard' } })
  }, [status, navigate])

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    Promise.all([api.stats(), api.history({ limit: 100 }), api.socialFeed(), api.clubs(), api.challenges()])
      .then(([nextStats, history, nextFeed, nextClubs, nextChallenges]) => {
        if (cancelled) return
        setStats(nextStats)
        setWorkouts(history.items)
        setFeed(nextFeed.items)
        setClubs(nextClubs)
        setChallenges(nextChallenges)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [status])

  const joinedClubs = useMemo(() => clubs.filter((club) => club.joined), [clubs])
  const activeChallenges = useMemo(() => challenges.filter((challenge) => challenge.joined), [challenges])

  const react = async (activityId: string) => {
    const updated = await api.reactToActivity(activityId)
    setFeed((current) => current.map((item) => item.id === activityId ? updated : item))
  }

  if (status !== 'authenticated') return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      <div className="noise" />
      <WorkspaceHeader
        status={<span className="mono-data truncate text-[9px] tracking-[0.15em] text-primary">{user?.displayName.toUpperCase()} · CONNECTED</span>}
        actions={<Link to="/session"><Button size="sm" className="border-2 border-foreground font-bold">START SET <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>}
      />

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <main className="min-w-0">
          <div className="flex items-end justify-between gap-4"><div><p className="mono-data text-[10px] tracking-[0.24em] text-primary">COMMAND CENTER / 01</p><h1 className="mt-2 text-4xl font-black uppercase leading-none">Your <span className="font-serifit normal-case italic text-primary">dashboard.</span></h1></div><p className="hidden max-w-40 text-right text-xs text-muted-foreground sm:block">Your training, your crew, your next target.</p></div>
          <section className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4"><Stat label="TOTAL SESSIONS" value={String(stats?.totalSessions ?? 0)} /><Stat label="TOTAL REPS" value={String(stats?.totalReps ?? 0)} accent /><Stat label="AVG FORM" value={stats ? `${Math.round(stats.avgFormScore)}` : '—'} /><Stat label="CREW" value={String(joinedClubs.length)} /></section>
          <WorkoutVolumeTrend workouts={workouts} />

          <div id="social" className="mt-8 flex scroll-mt-20 items-center justify-between border-b-2 border-foreground pb-3"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h2 className="text-lg font-black uppercase">Social / crew feed</h2></div><span className="mono-data text-[9px] tracking-[0.16em] text-muted-foreground">FOLLOWED ATHLETES + PUBLIC</span></div>
          <div className="mt-4 space-y-4">
            {loading ? <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin" /></div> : feed.length > 0 ? feed.map((item) => <FeedCard key={item.id} item={item} onReact={react} />) : <div className="border-2 border-dashed border-foreground p-8 text-center"><Users className="mx-auto h-6 w-6 text-primary" /><p className="mt-3 font-bold uppercase">Your crew feed is ready</p><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Follow athletes or share your finished sets to start the conversation.</p><Link to="/session" className="mt-5 inline-block"><Button variant="outline" className="border-2 border-foreground font-bold">LOG A SET</Button></Link></div>}
          </div>
        </main>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <section><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /><h2 className="font-black uppercase">Active targets</h2></div><ChevronRight className="h-4 w-4" /></div><div className="mt-4 space-y-3">{activeChallenges.length ? activeChallenges.map((challenge) => <div key={challenge.id} className="border-2 border-foreground bg-card p-3"><p className="mono-data text-[9px] tracking-[0.16em] text-primary">{challenge.metric.toUpperCase()} CHALLENGE</p><p className="mt-1 font-bold">{challenge.name}</p><p className="mt-2 text-xs text-muted-foreground">{challenge.participantCount} athletes committed</p></div>) : <div className="border-2 border-dashed border-foreground p-4 text-sm text-muted-foreground">No active targets yet. Join a challenge when your crew creates one.</div>}</div></section>
          <section className="mt-8 border-t-2 border-foreground pt-5"><div className="flex items-center gap-2"><Flame className="h-4 w-4 text-primary" /><h2 className="font-black uppercase">Your clubs</h2></div><div className="mt-4 space-y-2">{joinedClubs.length ? joinedClubs.map((club) => <div key={club.id} className="flex items-center justify-between border-2 border-foreground bg-card px-3 py-3"><div><p className="font-bold">{club.name}</p><p className="mono-data mt-1 text-[9px] tracking-[0.12em] text-muted-foreground">{club.memberCount} MEMBERS</p></div>{club.isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Users className="h-4 w-4 text-primary" />}</div>) : <p className="text-sm text-muted-foreground">Create or join a club to train with a focused crew.</p>}</div></section>
          <Link to="/history" className="mt-8 flex items-center justify-between border-2 border-foreground bg-foreground p-4 text-background transition-transform hover:-translate-y-0.5"><div><p className="mono-data text-[9px] tracking-[0.18em] text-primary">PERSONAL RECORD</p><p className="mt-1 text-sm font-bold">Review your training log</p></div><ArrowRight className="h-4 w-4" /></Link>
        </aside>
      </div>
    </div>
  )
}
