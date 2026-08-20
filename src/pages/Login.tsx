import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ArrowRight, Loader2 } from 'lucide-react'
import AuthShell from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/authContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="SIGN IN"
      title="Welcome"
      accent="back."
      blurb="Sign in to reach your past sets, rep telemetry and coach summaries."
    >
      <form onSubmit={onSubmit} className="space-y-5">
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
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
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> SIGNING IN
            </>
          ) : (
            <>
              SIGN IN <ArrowRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>

        <p className="mono-data text-center text-xs tracking-wide text-muted-foreground">
          NO ACCOUNT?{' '}
          <Link to="/signup" className="underline-sweep font-bold text-foreground hover:text-primary">
            CREATE ONE
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
