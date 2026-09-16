import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { Activity, ArrowUpRight, History, Plus, Users, Watch } from 'lucide-react'
import { useAuth } from '@/lib/authContext'
import './social.css'

export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return <span className={`athlete-avatar ${large ? 'large' : ''}`}>{name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}</span>
}

export default function SocialShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  return <div className="social-app">
    <header className="social-header"><div className="social-header-inner">
      <Link to="/dashboard" className="social-brand">formfit<span> / </span></Link>
      <nav aria-label="Main navigation"><NavLink to="/dashboard"><Activity size={16} /> Feed</NavLink><NavLink to="/history"><History size={16} /> Training</NavLink><NavLink to="/wearables"><Watch size={16} /> Devices</NavLink></nav>
      <div className="social-header-actions"><Link className="social-button primary" to="/session"><Plus size={17} /><span>Start workout</span></Link>{user ? <button title="Sign out" aria-label="Sign out" onClick={logout}><Avatar name={user.displayName} /></button> : <Link to="/login">Sign in <ArrowUpRight size={14} /></Link>}</div>
    </div></header>
    {children}
    <nav className="social-mobile-nav" aria-label="Mobile navigation"><Link to="/dashboard"><Users size={19} />Feed</Link><Link to="/session"><Plus size={21} />Record</Link><Link to="/history"><History size={19} />Training</Link></nav>
  </div>
}
