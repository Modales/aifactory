import { Activity, HeartPulse, History, LayoutDashboard, Users } from 'lucide-react'
import { Link, useLocation } from 'react-router'

const items = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, match: 'dashboard' },
  { label: 'Social', to: '/dashboard#social', icon: Users, match: 'social' },
  { label: 'History', to: '/history', icon: History, match: 'history' },
  { label: 'Wearables', to: '/wearables', icon: HeartPulse, match: 'wearables' },
] as const

export default function AppNavigation() {
  const location = useLocation()
  const active = location.pathname === '/dashboard' && location.hash === '#social'
    ? 'social'
    : location.pathname.slice(1) || 'dashboard'

  return (
    <nav
      aria-label="Athlete workspace"
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t-2 border-foreground bg-background md:static md:flex md:border-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map(({ label, to, icon: Icon, match }) => {
        const selected = active === match
        return (
          <Link
            key={label}
            to={to}
            aria-current={selected ? 'page' : undefined}
            className={`flex min-w-0 flex-col items-center gap-1 px-2 py-2 text-[9px] font-bold uppercase tracking-wide md:flex-row md:gap-2 md:px-3 md:text-xs ${
              selected ? 'bg-primary text-primary-foreground md:bg-primary/10 md:text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        )
      })}
      <Link
        to="/session"
        className="hidden items-center gap-2 px-3 py-2 text-xs font-bold uppercase text-muted-foreground hover:text-foreground lg:flex"
      >
        <Activity className="h-4 w-4" /> Live set
      </Link>
    </nav>
  )
}
