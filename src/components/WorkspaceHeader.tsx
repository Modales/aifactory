import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Sparkles } from 'lucide-react'
import AppNavigation from '@/components/AppNavigation'
import { getSurface } from '@/lib/platform'

interface WorkspaceHeaderProps {
  status?: ReactNode
  actions?: ReactNode
}

export default function WorkspaceHeader({ status, actions }: WorkspaceHeaderProps) {
  const surface = getSurface()
  // The marketing site is only reachable from a desktop browser; the installed app never shows it.
  const showStory = surface.device === 'desktop' && !surface.standalone

  return (
    <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background/90 backdrop-blur">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/dashboard" className="shrink-0 text-xl font-bold tracking-tight">
            FORMFIT<span className="text-primary">*</span>
          </Link>
          {showStory && (
            <Link
              to="/"
              className="inline-flex shrink-0 items-center gap-1.5 border-2 border-foreground px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] hover:bg-primary hover:text-primary-foreground"
            >
              <Sparkles className="h-3 w-3" /> The story
            </Link>
          )}
          {status && <div className="hidden min-w-0 items-center gap-2 lg:flex">{status}</div>}
        </div>
        <AppNavigation />
        <div className="flex items-center justify-end gap-3">{actions}</div>
      </div>
    </header>
  )
}
