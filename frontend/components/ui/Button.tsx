import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'warning' | 'ghost';
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = 'secondary', fullWidth, className = '', style, ...props }, ref) => {
    const variantClass = variant === 'primary' ? 'btn-primary' : variant === 'warning' ? 'btn-warning' : variant === 'ghost' ? 'btn-ghost' : variant === 'secondary' ? 'btn-secondary' : '';
    return (
      <button
        ref={ref}
        type={props.type ?? 'button'}
        className={`btn ${variantClass} ${className}`}
        style={{ width: fullWidth ? '100%' : undefined, ...style }}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
