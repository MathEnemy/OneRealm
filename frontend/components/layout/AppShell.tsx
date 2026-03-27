import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getStoredSession } from '../../auth/zklogin';
import { TopNav } from './TopNav';
import { ShellState } from './StatusChip';

// Pages that intentionally do NOT use the authenticated shell
const SHELL_EXCLUDED = ['/', '/auth/callback'];

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const [address, setAddress]       = useState<string | null>(null);
  const [shellState, setShellState] = useState<ShellState>('loading');

  const resolveState = () => {
    try {
      const session = getStoredSession();
      const isJudge = typeof window !== 'undefined' && window.localStorage.getItem('JUDGE_MODE') === '1';

      if (isJudge) {
        setShellState('judge');
        setAddress(session.address ?? null);
      } else if (session.hasApiSession && session.address) {
        setShellState('authenticated');
        setAddress(session.address);
      } else if (session.address && !session.hasApiSession) {
        // Address present but api session gone — treat as expired
        setShellState('expired');
        setAddress(null);
      } else {
        setShellState('no-session');
        setAddress(null);
      }
    } catch {
      setShellState('no-session');
      setAddress(null);
    }
  };

  useEffect(() => {
    resolveState();
    router.events.on('routeChangeComplete', resolveState);
    return () => router.events.off('routeChangeComplete', resolveState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const isExcluded = SHELL_EXCLUDED.includes(router.pathname);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {!isExcluded && (
        <TopNav address={address} shellState={shellState} />
      )}

      <main
        id="main-content"
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}

export type { ShellState };
