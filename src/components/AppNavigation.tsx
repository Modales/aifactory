import { Activity, HeartPulse, History, LayoutDashboard, Users } from 'lucide-react'
import { Link, useLocation } from 'react-router'

const items = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, match: 'dashboard' },
  { label: 'Social', to: '/dashboard#social', icon: Users, match: 'social' },
  { label: 'History', to: '/history', icon: History, match: 'history' },
  { label: 'Wearables', to: '/wearables', icon: HeartPulse, match: 'wearables' },
  { label: 'Live set', to: '/session', icon: Activity, match: 'session' },
] as const

export default function AppNavigation() {
  const location = useLocation()
  const active = location.pathname === '/dashboard' && location.hash === '#social'
    ? 'social'
    : location.pathname.slice(1) || 'dashboard'

  const scrollToSocial = () => {
    window.setTimeout(() => document.getElementById('social')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <nav
      aria-label="Athlete workspace"
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t-2 border-foreground bg-background lg:static lg:flex lg:border-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map(({ label, to, icon: Icon, match }) => {
        const selected = active === match
        return (
          <Link
            key={label}
            to={to}
            aria-current={selected ? 'page' : undefined}
            onClick={match === 'social' ? scrollToSocial : undefined}
            className={`flex min-w-0 flex-col items-center gap-1 px-2 py-2 text-[9px] font-bold uppercase tracking-wide lg:flex-row lg:gap-2 lg:px-3 lg:text-xs ${
              selected ? 'bg-primary text-primary-foreground lg:bg-primary/10 lg:text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
