import React from 'react';

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function Section({ title, subtitle, actions, children, className = '', style, ...props }: SectionProps) {
  return (
    <section className={`ui-section ${className}`.trim()} style={style} {...props}>
      <div className="ui-section__header">
        <div className="ui-section__copy">
          <h2 className="section-heading" style={{ margin: 0 }}>{title}</h2>
          {subtitle && <div className="ui-section__subtitle">{subtitle}</div>}
        </div>
        {actions && <div className="ui-section__actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
