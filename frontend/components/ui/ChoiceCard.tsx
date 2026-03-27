import React from 'react';
interface ChoiceCardProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  tone?: 'default' | 'primary' | 'warning';
  children: React.ReactNode;
}

function getChoiceTone(tone: 'default' | 'primary' | 'warning', selected: boolean): React.CSSProperties {
  if (tone === 'warning') {
    return selected
      ? { borderColor: 'rgba(245,158,11,0.72)', background: 'rgba(245,158,11,0.14)' }
      : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(15,23,42,0.6)' };
  }

  if (tone === 'primary') {
    return selected
      ? { borderColor: 'rgba(96,165,250,0.72)', background: 'rgba(37,99,235,0.16)' }
      : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(15,23,42,0.6)' };
  }

  return selected
    ? { borderColor: 'rgba(96,165,250,0.72)', background: 'rgba(59,130,246,0.16)' }
    : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(15,23,42,0.6)' };
}

export function ChoiceCard({
  selected = false,
  tone = 'default',
  children,
  className = '',
  style,
  ...props
}: ChoiceCardProps) {
  return (
    <button
      className={`choice-card ${selected ? 'is-selected' : ''} ${className}`.trim()}
      style={{
        width: '100%',
        textAlign: 'left',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        padding: 16,
        ...getChoiceTone(tone, selected),
        ...style,
      }}
      data-selected={selected ? 'true' : 'false'}
      aria-pressed={selected}
      {...props}
    >
      {children}
    </button>
  );
}
