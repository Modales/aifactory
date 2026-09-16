import { request, type SocialActivity, type SocialAuthor, type SocialClub, type SocialChallenge, type SocialFeed } from './api'

export interface Athlete extends SocialAuthor { following: boolean; followerCount: number; followingCount: number; createdAt: string }
export interface AthleteDetail extends Athlete { activities: SocialActivity[] }
export interface Comment { id: string; author: SocialAuthor; body: string; createdAt: string }
export interface Leaderboard { challenge: SocialChallenge; entries: { rank: number; athlete: SocialAuthor; value: number }[] }
export const social = {
  feed: (scope: string, offset = 0) => request<SocialFeed>(`/api/social/feed?scope=${scope}&limit=20&offset=${offset}`),
  post: (caption: string, visibility: 'public' | 'followers', sessionId?: string) => request<SocialActivity>('/api/social/activities', { method: 'POST', body: { caption, visibility, sessionId } }),
  kudos: (id: string, remove: boolean) => request<SocialActivity>(`/api/social/activities/${id}/reaction`, { method: remove ? 'DELETE' : 'PUT' }),
  comments: (id: string) => request<Comment[]>(`/api/social/activities/${id}/comments`),
  comment: (id: string, body: string) => request<Comment>(`/api/social/activities/${id}/comments?body=${encodeURIComponent(body)}`, { method: 'POST' }),
  athletes: (q = '') => request<Athlete[]>(`/api/social/athletes?q=${encodeURIComponent(q)}`),
  profile: (id: string) => request<AthleteDetail>(`/api/social/athletes/${id}`),
  follow: (id: string, remove: boolean) => request(`/api/social/follows/${id}`, { method: remove ? 'DELETE' : 'PUT' }),
  createClub: (name: string, description: string) => request<SocialClub>('/api/social/clubs', { method: 'POST', body: { name, description } }),
  createChallenge: (name: string, metric: string, endsAt: string) => request<SocialChallenge>('/api/social/challenges', { method: 'POST', body: { name, metric, startsAt: new Date().toISOString(), endsAt: new Date(endsAt).toISOString() } }),
  leaderboard: (id: string) => request<Leaderboard>(`/api/social/challenges/${id}/leaderboard`),
}
