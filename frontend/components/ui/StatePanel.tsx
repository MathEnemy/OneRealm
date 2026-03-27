import React from 'react';
import { Card } from './Card';
import { Banner, Spinner } from './Feedback';

type StateTone = 'default' | 'info' | 'success' | 'warning' | 'error';

interface StatePanelProps {
  title: string;
  description?: React.ReactNode;
  eyebrow?: string;
  icon?: React.ReactNode;
  tone?: StateTone;
  loading?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function getToneStyle(tone: StateTone): React.CSSProperties {
  if (tone === 'success') {
    return {
      background: 'linear-gradient(180deg, rgba(16,185,129,0.12), rgba(2,6,23,0.78))',
      border: '1px solid rgba(16,185,129,0.22)',
    };
  }

  if (tone === 'warning') {
    return {
      background: 'linear-gradient(180deg, rgba(245,158,11,0.12), rgba(2,6,23,0.78))',
      border: '1px solid rgba(245,158,11,0.22)',
    };
  }

  if (tone === 'error') {
    return {
      background: 'linear-gradient(180deg, rgba(239,68,68,0.12), rgba(2,6,23,0.78))',
      border: '1px solid rgba(239,68,68,0.22)',
    };
  }

  if (tone === 'info') {
    return {
      background: 'linear-gradient(180deg, rgba(96,165,250,0.12), rgba(2,6,23,0.78))',
      border: '1px solid rgba(96,165,250,0.22)',
    };
  }

  return {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(2,6,23,0.72))',
    border: '1px solid rgba(255,255,255,0.08)',
  };
}

export function StatePanel({
  title,
  description,
  eyebrow,
  icon,
  tone = 'default',
  loading = false,
  actions,
  children,
  className = '',
  style,
}: StatePanelProps) {
  return (
    <Card className={className} style={{ ...getToneStyle(tone), ...style }}>
      <div className="state-panel">
        {(loading || icon) && (
          <div className="state-panel__media" aria-hidden={loading ? undefined : 'true'}>
            {loading ? <Spinner size={44} /> : icon}
          </div>
        )}

        {eyebrow && <div className="state-eyebrow">{eyebrow}</div>}
        <h2 className="state-title">{title}</h2>
        {description && <div className="state-copy">{description}</div>}
        {children}
        {actions && <div className="state-actions">{actions}</div>}
      </div>
    </Card>
  );
}

export function ErrorState({
  title,
  message,
  actions,
  style,
}: {
  title: string;
  message: React.ReactNode;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <StatePanel
      tone="error"
      icon={<span style={{ fontSize: 40 }}>⚠️</span>}
      eyebrow="Error"
      title={title}
      description={<Banner type="error" style={{ marginTop: 12 }}>{message}</Banner>}
      actions={actions}
      style={style}
    />
  );
}
