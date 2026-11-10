import { NavLink, Outlet } from 'react-router-dom';
import { useIdentity } from '../data/identity';
import { IconHome, IconPeople, IconTrophy, IconVersus } from './Icons';

export function Header({ title }: { title?: string }) {
  const { me, setSwitching } = useIdentity();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 pt-safe backdrop-blur">
      <div className="mx-auto flex h-14 max-w-app items-center justify-between px-safe">
        <NavLink to="/" className="flex items-center gap-2 text-2xl font-extrabold tracking-tightest">
          <span className="ball-dot" style={{ width: 16, height: 16 }} />
          {title ?? 'Rally'}
        </NavLink>
        {me && (
          <button
            onClick={() => setSwitching(true)}
            className="flex items-center gap-2 rounded-full border-2 border-ink bg-surface py-1 pl-3 pr-1 text-sm font-bold"
            aria-label={`You are ${me.name}. Switch player`}
          >
            <span className="max-w-[9rem] truncate">{me.name}</span>
            <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-court">Switch</span>
          </button>
        )}
      </div>
    </header>
  );
}

const tabs = [
  { to: '/', label: 'Home', icon: IconHome, end: true },
  { to: '/leaderboard', label: 'Leaderboard', icon: IconTrophy },
  { to: '/h2h', label: 'H2H', icon: IconVersus },
  { to: '/players', label: 'Players', icon: IconPeople },
];

export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-surface pb-safe" aria-label="Main">
      <div className="mx-auto grid max-w-app grid-cols-4">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-xs font-bold ${
                isActive ? 'text-ink' : 'text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full ${isActive ? 'bg-ball' : ''}`}>
                  <Icon width={20} height={20} />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function TabLayout() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-app px-safe pb-36 pt-4">
        <Outlet />
      </main>
      <TabBar />
    </>
  );
}
