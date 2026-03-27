import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ShellState, StatusChip } from './StatusChip';
import { UserBadge } from './UserBadge';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/hero',      label: 'Hero',      icon: '⚔️' },
  { href: '/quest',     label: 'Quests',    icon: '🗺️' },
  { href: '/inventory', label: 'Inventory', icon: '🎒' },
  { href: '/about',     label: 'About',     icon: '📜' },
];

interface TopNavProps {
  address: string | null;
  shellState: ShellState;
}

export function TopNav({ address, shellState }: TopNavProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => router.pathname.startsWith(href);

  return (
    <header className="navbar" role="banner">
      <div className="nav-container">
        {/* Brand */}
        <Link href={address ? '/hero' : '/'} className="nav-brand" aria-label="OneRealm home">
          <span role="img" aria-hidden>⚔️</span> OneRealm
        </Link>

        {/* Desktop nav */}
        <nav className="nav-links" aria-label="Primary navigation" role="navigation"
          style={{ display: 'flex' }}>
          {(address ? NAV_ITEMS : [NAV_ITEMS[3]]).map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={`nav-link${isActive(href) ? ' active' : ''}`}
            >
              <span aria-hidden style={{ fontSize: 13 }}>{icon}</span>{' '}
              {label}
            </Link>
          ))}
        </nav>

        {/* Right meta */}
        <div className="nav-meta">
          <StatusChip state={shellState} />
          {address && <UserBadge address={address} />}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen(o => !o)}
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: 22,
            cursor: 'pointer',
            padding: '4px 8px',
          }}
          className="mobile-menu-btn"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '12px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {(address ? NAV_ITEMS : [NAV_ITEMS[3]]).map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              aria-current={isActive(href) ? 'page' : undefined}
              className={`nav-link${isActive(href) ? ' active' : ''}`}
              style={{ padding: '10px 14px' }}
            >
              <span aria-hidden>{icon}</span> {label}
            </Link>
          ))}
          {address && (
            <div style={{ marginTop: 8 }}>
              <UserBadge address={address} />
            </div>
          )}
        </nav>
      )}
    </header>
  );
}
