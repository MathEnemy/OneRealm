import React from 'react';

export function Spinner({ size = 40 }: { size?: number }) {
  return (
    <div
      className="animate-spin"
      aria-hidden="true"
      style={{
        width: size, height: size,
        border: '3px solid rgba(255,255,255,0.2)',
        borderTop: '3px solid var(--color-accent-primary)',
        borderRadius: '50%'
      }}
    />
  );
}

export function LoadingScreen({ text }: { text: string }) {
  return (
    <main className="container flex-center" style={{ minHeight: '60vh', flexDirection: 'column' }}>
      <div className="state-card loading-state" role="status" aria-live="polite" style={{ maxWidth: 480, width: '100%' }}>
        <Spinner size={50} />
        <div className="state-title" style={{ fontSize: 22 }}>Loading…</div>
        <div className="state-copy" style={{ fontSize: 16 }}>{text}</div>
      </div>
    </main>
  );
}

export function Banner({
  type = 'info',
  children,
  className = '',
  style,
}: {
  type?: 'info' | 'success' | 'error' | 'warning';
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const typeClass = type === 'success' ? 'banner-success' : type === 'error' ? 'banner-error' : type === 'warning' ? 'banner-warning' : '';
  const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : type === 'warning' ? '⚠️' : 'ℹ️';

  return (
    <div className={`banner ${typeClass} ${className}`.trim()} role={type === 'error' ? 'alert' : 'status'} aria-live="polite" style={style}>
      <span aria-hidden="true">{icon}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
