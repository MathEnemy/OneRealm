import React from 'react';

interface StatBlockProps {
  label: string;
  value: React.ReactNode;
  icon?: string;
  className?: string;
}

export function StatBlock({ label, value, icon, className = '' }: StatBlockProps) {
  return (
    <div className={`stat-block ${className}`}>
      <div className="stat-label">
        {icon && <span style={{ marginRight: 6 }}>{icon}</span>}
        {label}
      </div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

interface EmptyStateProps {
  message: string;
  icon?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ message, icon = '🧊', action, className = '' }: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
      <div style={{ marginBottom: action ? 16 : 0 }}>{message}</div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function SectionHeading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`section-heading ${className}`}>{children}</h2>;
}
