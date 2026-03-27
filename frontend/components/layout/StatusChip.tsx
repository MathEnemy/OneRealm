import React from 'react';

export type ShellState = 'no-session' | 'loading' | 'judge' | 'authenticated' | 'expired';

interface StatusChipProps {
  state: ShellState;
  className?: string;
}

const STATE_CONFIG: Record<ShellState, { label: string; icon: string; color: string; bg: string; border: string }> = {
  'no-session':    { label: 'Not connected',   icon: '○',  color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)' },
  'loading':       { label: 'Connecting…',     icon: '◌',  color: '#93c5fd', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.25)' },
  'judge':         { label: 'Judge mode',      icon: '⚖',  color: '#fde68a', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)'  },
  'authenticated': { label: 'zkLogin active',  icon: '●',  color: '#6ee7b7', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)'  },
  'expired':       { label: 'Session expired', icon: '!',  color: '#fca5a5', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)'   },
};

export function StatusChip({ state, className = '' }: StatusChipProps) {
  const cfg = STATE_CONFIG[state];
  return (
    <span
      className={className}
      title={cfg.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.03em',
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 9 }}>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}
