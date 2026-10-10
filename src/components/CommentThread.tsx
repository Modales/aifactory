import { useEffect, useState } from 'react'
import { Loader2, Send, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { SocialComment } from '@/lib/api'

interface Props {
  activityId: string
  activityOwnerId: string
  currentUserId: string | undefined
  onCountChange: (delta: number) => void
}

export default function CommentThread({ activityId, activityOwnerId, currentUserId, onCountChange }: Props) {
  const [comments, setComments] = useState<SocialComment[] | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.comments(activityId).then(setComments).catch((err: Error) => setError(err.message))
  }, [activityId])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)
    try {
      const created = await api.addComment(activityId, body)
      setComments((list) => [...(list ?? []), created])
      setDraft('')
      onCountChange(1)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(commentId: string) {
    setError(null)
    try {
      await api.deleteComment(activityId, commentId)
      setComments((list) => (list ?? []).filter((c) => c.id !== commentId))
      onCountChange(-1)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="border-t-2 border-foreground bg-background p-4">
      {comments === null && !error ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : (
        <ul className="space-y-3">
          {(comments ?? []).map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mono-data text-[9px] font-bold tracking-[0.16em]">{c.author.displayName.toUpperCase()}</p>
                <p className="mt-0.5 break-words text-sm">{c.body}</p>
              </div>
              {currentUserId && (currentUserId === c.author.id || currentUserId === activityOwnerId) && (
                <button type="button" aria-label="Delete comment" onClick={() => remove(c.id)} className="shrink-0 p-1 text-muted-foreground hover:text-primary">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
          {comments?.length === 0 && <li className="mono-data text-[9px] tracking-[0.16em] text-muted-foreground">NO COMMENTS YET</li>}
        </ul>
      )}
      {error && <p className="mt-3 text-xs font-bold text-destructive">{error}</p>}
      <form onSubmit={submit} className="mt-3 flex border-2 border-foreground">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} placeholder="Add a comment" aria-label="Add a comment" className="min-w-0 flex-1 bg-card px-3 py-2 text-sm outline-none" />
        <button type="submit" aria-label="Post comment" disabled={busy || !draft.trim()} className="border-l-2 border-foreground bg-foreground px-3 text-background disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-primary" />}
        </button>
      </form>
    </div>
  )
}
