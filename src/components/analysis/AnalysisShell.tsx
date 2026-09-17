import type { ReactNode } from 'react'
import { Link } from 'react-router'
import WorkspaceHeader from '@/components/WorkspaceHeader'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/authContext'
import './studio.css'

export default function AnalysisShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  return (
    <div className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader
        status={<span className="mono-data truncate text-[9px] tracking-[0.15em] text-primary">{user?.displayName.toUpperCase()} · FORM ANALYSIS</span>}
        actions={user ? <Button variant="outline" size="sm" onClick={logout}>Sign out</Button> : <Link to="/login"><Button size="sm">Sign in</Button></Link>}
      />
      <div className="social-app">{children}</div>
    </div>
  )
}
