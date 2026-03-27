import React, { useState, useCallback } from 'react';

interface UserBadgeProps {
  address: string;
  className?: string;
}

export function UserBadge({ address, className = '' }: UserBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [address]);

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-live="polite"
      aria-label={copied ? 'Address copied to clipboard' : `Copy address ${address}`}
      title={copied ? 'Copied!' : `${address} — click to copy`}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderRadius: 999,
        border: '1px solid rgba(102,126,234,0.35)',
        background: 'rgba(102,126,234,0.1)',
        color: '#a5b4fc',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'background-color 0.15s ease-out, border-color 0.15s ease-out, transform 0.15s ease-out',
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-body)',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 10 }}>🔐</span>
      {copied ? '✓ Copied' : short}
    </button>
  );
}
