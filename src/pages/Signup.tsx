import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, Loader2 } from 'lucide-react'
import AuthShell from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/authContext'

const MIN_PASSWORD_LENGTH = 8

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    setError(null)
    setBusy(true)
    try {
      await signup(email.trim(), password, displayName.trim())
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="CREATE ACCOUNT"
      title="Start your"
      accent="record."
      blurb="One account keeps every set, every rep score and every coach summary."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="displayName" className="mono-data text-xs tracking-[0.2em]">
            NAME
          </Label>
          <Input
            id="displayName"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Aditya"
            className="border-2 border-foreground bg-background"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="mono-data text-xs tracking-[0.2em]">
            EMAIL
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="border-2 border-foreground bg-background"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="mono-data text-xs tracking-[0.2em]">
            PASSWORD
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="border-2 border-foreground bg-background"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="mono-data border-2 border-destructive bg-destructive/10 px-3 py-2 text-xs tracking-wide text-destructive"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={busy}
          className="hard-shadow-sm w-full border-2 border-foreground font-bold transition-transform hover:-translate-y-0.5"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> CREATING
            </>
          ) : (
            <>
              CREATE ACCOUNT <ArrowRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>

        <p className="mono-data text-center text-xs tracking-wide text-muted-foreground">
          ALREADY HAVE ONE?{' '}
          <Link to="/login" className="underline-sweep font-bold text-foreground hover:text-primary">
            SIGN IN
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
