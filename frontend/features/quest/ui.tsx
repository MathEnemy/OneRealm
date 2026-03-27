import React from 'react';

export const eyebrowStyle = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.9,
  textTransform: 'uppercase' as const,
  color: 'var(--text-muted)',
};

export const panelStyle = {
  padding: 24,
  background: 'linear-gradient(180deg, rgba(15,23,42,0.94), rgba(15,23,42,0.84))',
  border: '1px solid rgba(255,255,255,0.08)',
};

export const choiceCardStyle = {
  padding: 20,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,0.08)',
};

export const choiceRowStyle = {
  padding: 16,
  borderRadius: 18,
  textAlign: 'left' as const,
  cursor: 'pointer',
};

export const stateCardStyle = {
  margin: '32px auto 0',
  maxWidth: 860,
  padding: 32,
  background: 'linear-gradient(180deg, rgba(15,23,42,0.95), rgba(15,23,42,0.82))',
  border: '1px solid rgba(96,165,250,0.18)',
};

export const statGridStyle = {
  display: 'grid',
  gap: 10,
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
};

export const linkStyle = {
  color: 'var(--text-secondary)',
  fontSize: 13,
  textDecoration: 'underline',
};

function getToneBorder(tone: 'default' | 'info' | 'warning' | 'success') {
  if (tone === 'info') return 'rgba(96,165,250,0.24)';
  if (tone === 'warning') return 'rgba(245,158,11,0.24)';
  if (tone === 'success') return 'rgba(16,185,129,0.24)';
  return 'rgba(255,255,255,0.08)';
}

function getToneBackground(tone: 'default' | 'info' | 'warning' | 'success') {
  if (tone === 'info') return 'rgba(37,99,235,0.12)';
  if (tone === 'warning') return 'rgba(245,158,11,0.1)';
  if (tone === 'success') return 'rgba(16,185,129,0.1)';
  return 'rgba(255,255,255,0.03)';
}

export function SummaryBlock({
  title,
  value,
  note,
  tone = 'default',
}: {
  title: string;
  value: string;
  note: string;
  tone?: 'default' | 'info' | 'warning' | 'success';
}) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 16,
        border: `1px solid ${getToneBorder(tone)}`,
        background: getToneBackground(tone),
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.45, color: 'var(--text-secondary)' }}>{note}</div>
    </div>
  );
}

export function ChoiceMeta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{value}</div>
    </div>
  );
}

export function StatPill({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 14,
        background: tone === 'warning' ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.05)',
        border: tone === 'warning' ? '1px solid rgba(245,158,11,0.18)' : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 16,
        background: 'rgba(2,6,23,0.48)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 16, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

export function ResultStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'danger';
}) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 18,
        background: tone === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(248,113,113,0.12)',
        border: tone === 'success' ? '1px solid rgba(16,185,129,0.18)' : '1px solid rgba(248,113,113,0.18)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: tone === 'success' ? '#d1fae5' : '#fecaca' }}>{value}</div>
    </div>
  );
}
