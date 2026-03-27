import React from 'react';
import Link from 'next/link';
import { Button } from '../ui/Button';

interface PageHeaderCTA {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: string;
  breadcrumb?: { label: string; href?: string }[];
  primaryCTA?: PageHeaderCTA;
  secondaryCTA?: PageHeaderCTA;
  className?: string;
  children?: React.ReactNode;
}

function CTAButton({ cta }: { cta: PageHeaderCTA }) {
  if (cta.href) {
    return (
      <Link
        href={cta.href}
        className={`btn btn-${cta.variant ?? 'primary'}`}
        aria-disabled={cta.disabled}
        onClick={cta.disabled ? (event) => event.preventDefault() : undefined}
      >
        {cta.label}
      </Link>
    );
  }
  return <Button variant={cta.variant ?? 'primary'} onClick={cta.onClick} disabled={cta.disabled}>{cta.label}</Button>;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  breadcrumb,
  primaryCTA,
  secondaryCTA,
  className = '',
  children,
}: PageHeaderProps) {
  return (
    <div className={`page-header ${className}`}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" style={{ marginBottom: 10 }}>
          <ol style={{ display: 'flex', gap: 6, listStyle: 'none', padding: 0, margin: 0, alignItems: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            {breadcrumb.map((crumb, i) => (
              <React.Fragment key={crumb.label}>
                <li>
                  {crumb.href
                    ? <Link href={crumb.href} style={{ color: 'var(--text-muted)' }}>{crumb.label}</Link>
                    : <span aria-current="page" style={{ color: 'var(--text-secondary)' }}>{crumb.label}</span>}
                </li>
                {i < breadcrumb.length - 1 && <li aria-hidden style={{ opacity: 0.4 }}>›</li>}
              </React.Fragment>
            ))}
          </ol>
        </nav>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10, lineHeight: 1.1 }}>
            {icon && <span aria-hidden style={{ fontSize: '0.9em' }}>{icon}</span>}
            {title}
          </h1>
          {subtitle && (
            <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.5, maxWidth: 640 }}>
              {subtitle}
            </p>
          )}
        </div>

        {(primaryCTA || secondaryCTA) && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
            {secondaryCTA && <CTAButton cta={secondaryCTA} />}
            {primaryCTA   && <CTAButton cta={primaryCTA} />}
          </div>
        )}
      </div>

      {children && <div style={{ marginTop: 20 }}>{children}</div>}
    </div>
  );
}
