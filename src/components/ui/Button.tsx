import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

// No glow, no shadow. Primary is the one crimson action per screen; the rest
// are quiet (hairline or text).
const VARIANTS: Record<Variant, string> = {
  // text-accent-on, not text-white: the accent is the gym's brand colour, so the
  // readable ink on top of it is computed rather than assumed.
  primary: 'bg-accent text-accent-on hover:brightness-110',
  secondary: 'border border-border-strong text-text hover:bg-surface-2',
  ghost: 'text-muted hover:text-text',
  danger: 'border border-border-strong text-accent hover:bg-surface-2',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

export function Button({ variant = 'primary', loading, disabled, className = '', children, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      // min-h-[44px]: reception works on a tablet and a phone, where a 34px-tall
      // button is a miss waiting to happen. Callers that need bigger (the join
      // CTA) still win, because their class comes last.
      className={`focus-ring inline-flex min-h-[44px] items-center justify-center gap-2 rounded px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current/40 border-t-current" />}
      {children}
    </button>
  );
}
