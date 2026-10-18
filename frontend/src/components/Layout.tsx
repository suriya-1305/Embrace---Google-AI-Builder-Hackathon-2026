import { NavLink, Link, useLocation, useNavigate, type To } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { usePrefs } from '../state/prefs';
import { useSession } from '../state/session';
import { QuickDock } from './QuickDock';
import { config } from '../config';
import { mockDemoAccounts } from '../auth/mockDemoAccounts';

function DemoFamilySwitcher() {
  const { session, switchDemoAccount } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="sample-banner">
    <label className="demo-switch"><span>Test family</span><select className="select" aria-label="Switch test family" disabled={busy} value={mockDemoAccounts.find((account) => account.uid === session?.uid)?.email ?? ''} onChange={async (event) => {
      setBusy(true); setError('');
      try { await switchDemoAccount(event.target.value); navigate('/baby', { replace: true }); }
      catch (failure) { setError((failure as Error).message); }
      finally { setBusy(false); }
    }}>{mockDemoAccounts.map((account) => <option key={account.uid} value={account.email}>{account.label}</option>)}</select></label>
    {error && <span role="alert">{error}</span>}
    {config.hostedDemo && <a href="./">Leave sample</a>}
  </div>;
}

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="blob blob--1" /><div className="blob blob--2" /><div className="blob blob--3" /><div className="blob blob--4" />
      <div className="stars" />
    </div>
  );
}

export function TopBar() {
  const loc = useLocation();
  const { session } = useSession();
  const section = loc.pathname.startsWith('/me') ? 'My space'
    : loc.pathname.startsWith('/setup/baby') ? 'Baby setup'
      : loc.pathname.startsWith('/setup/mother') || loc.pathname.startsWith('/welcome/mother') ? 'My space setup'
    : loc.pathname.startsWith('/baby/timeline') ? 'Timeline'
      : loc.pathname.startsWith('/baby/patterns') ? 'Insights'
        : loc.pathname.startsWith('/baby') ? 'Baby care'
          : loc.pathname.startsWith('/modules') ? 'Home features'
            : loc.pathname.startsWith('/profile') || loc.pathname.startsWith('/settings') ? 'Profile'
              : loc.pathname.startsWith('/insights') ? 'Insights'
                : loc.pathname.startsWith('/community') ? 'Community'
              : 'Get help';
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date());
  return (
    <header className="topbar">
      <Link to="/baby" className="brand" aria-label="Embrace home">
        <img className="brand-mark" src="/embrace-mark.svg" alt="" width="38" height="38" />Embrace
      </Link>
      <div className="topbar__section">{section}</div>
      <span className="topbar__spacer" />
      <span className="date-chip"><Icon name="sun" />{today}</span>
      <Link to="/profile" className="profile-button" aria-label="Open profile" title="Profile"><Icon name="person" /><span>{session?.displayName || 'Profile'}</span></Link>
    </header>
  );
}

const TABS: { to: string; label: string; icon: IconName; cls?: string }[] = [
  { to: '/baby', label: 'Baby', icon: 'baby' },
  { to: '/insights', label: 'Insights', icon: 'chart' },
  { to: '/me', label: 'My space', icon: 'heart' },
  { to: '/community', label: 'Community', icon: 'person' },
];
export function TabBar() {
  const { session } = useSession();
  const tabs = TABS.filter((tab) => tab.to !== '/me' || session?.role === 'mother' || session?.motherId);
  return (
    <nav className="tabbar" aria-label="Main" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/baby'} className="tab"><Icon name={t.icon} />{t.label}</NavLink>
      ))}
    </nav>
  );
}

const SIDE_LINKS: { to: string; label: string; icon: IconName; matches: (path: string) => boolean }[] = [
  { to: '/baby', label: 'Baby care', icon: 'baby', matches: (path) => path.startsWith('/baby') && !path.startsWith('/baby/timeline') && !path.startsWith('/baby/patterns') },
  { to: '/insights', label: 'Insights', icon: 'chart', matches: (path) => path.startsWith('/insights') || path.startsWith('/baby/timeline') || path.startsWith('/baby/patterns') },
  { to: '/me', label: 'My space', icon: 'heart', matches: (path) => path.startsWith('/me') },
  { to: '/community', label: 'Community groups', icon: 'person', matches: (path) => path.startsWith('/community') },
];

export function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const { prefs } = usePrefs();
  const { session, signOut } = useSession();
  const module = loc.pathname.startsWith('/me') ? 'mom' : 'baby';
  const isOnboarding = ['/setup/baby', '/welcome/mother', '/setup/mother', '/welcome/permissions'].includes(loc.pathname);
  const familyInitial = session?.displayName?.trim().charAt(0).toUpperCase() || 'C';
  return (
    <div className="shell" data-module={module} data-one-hand={prefs.oneHanded} data-onboarding={isOnboarding}>
      <aside className="sidebar">
        <Link to="/baby" className="sidebar-brand" aria-label="Embrace home">
          <img className="brand-mark" src="/embrace-mark.svg" alt="" width="44" height="44" />
          <span><strong>Embrace</strong><small>Care for baby. Space for you.</small></span>
        </Link>
        <Link to="/profile" className="family-card" aria-label="Open profile">
          <span className="family-card__avatar">{familyInitial}</span>
          <span className="family-card__copy"><strong>{session?.displayName || 'Your family'}</strong><small>View profile</small></span>
          <Icon name="back" />
        </Link>
        <span className="nav-label">YOUR SPACE</span>
        <nav className="side-nav" aria-label="Main">
          {SIDE_LINKS.filter((item) => item.to !== '/me' || session?.role === 'mother' || session?.motherId).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/baby'} className={item.matches(loc.pathname) ? 'side-nav__link active' : 'side-nav__link'}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/profile" className={({ isActive }) => `side-nav__link ${isActive ? 'active' : ''}`}><Icon name="person" /><span>Profile</span></NavLink>
          <button className="side-nav__link" onClick={async () => { await signOut(); }}><Icon name="back" /><span>Log out</span></button>
          <div className="privacy-mini"><Icon name="shield" /><span>Your family’s space is private</span></div>
        </div>
      </aside>
      <div className="workspace">
        <TopBar />
        {config.apiMode === 'mock' && <DemoFamilySwitcher />}
        <main className="screen" id="main" tabIndex={-1}>{children}</main>
        {prefs.oneHanded && module === 'baby' && !isOnboarding && <QuickDock />}
        <TabBar />
      </div>
    </div>
  );
}

export function BackLink({ to, label }: { to: To; label: string }) {
  return <Link to={to} className="link-btn row" style={{ gap: 4 }}><span style={{ width: 18, height: 18 }}><Icon name="back" /></span>{label}</Link>;
}

export function Glass({ children, variant = '', as: As = 'section', ...rest }: { children: ReactNode; variant?: string; as?: 'section' | 'div' | 'article' } & Record<string, unknown>) {
  return <As className={`glass ${variant}`} {...rest}>{children}</As>;
}
