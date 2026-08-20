import { Link, useNavigate } from 'react-router'
import { HeartPulse, History, LayoutDashboard, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/authContext'

export default function AuthNav() {
  const { user, status, logout } = useAuth()
  const navigate = useNavigate()

  if (status === 'loading') return <div className="h-9 w-24" />

  if (user === null) {
    return (
      <Link
        to="/login"
        className="mono-data hidden text-xs tracking-[0.2em] hover:text-primary sm:block"
      >
        SIGN IN
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        to="/terminal"
        className="mono-data hidden items-center gap-2 text-xs tracking-[0.2em] hover:text-primary lg:flex"
      >
        <LayoutDashboard className="h-4 w-4" /> TERMINAL
      </Link>
      <Link
        to="/wearables"
        className="mono-data hidden items-center gap-2 text-xs tracking-[0.2em] hover:text-primary xl:flex"
      >
        <HeartPulse className="h-4 w-4" /> WEARABLES
      </Link>
      <Link
        to="/history"
        className="mono-data hidden items-center gap-2 text-xs tracking-[0.2em] hover:text-primary sm:flex"
      >
        <History className="h-4 w-4" /> HISTORY
      </Link>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          logout()
          navigate('/')
        }}
        className="mono-data text-xs tracking-[0.2em]"
      >
        <LogOut className="mr-1 h-4 w-4" />
        {user.displayName.split(' ')[0].toUpperCase()}
      </Button>
    </div>
  )
}
