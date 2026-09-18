import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'bg-white text-ink-800 border border-ink-300 hover:bg-ink-50 disabled:text-ink-400',
  ghost: 'bg-transparent text-ink-700 hover:bg-ink-100 disabled:text-ink-400',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 disabled:bg-danger-600/50',
  link: 'bg-transparent text-brand-600 hover:underline p-0 h-auto',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

const BASE =
  'inline-flex items-center justify-center rounded-md font-medium transition-colors ' +
  'disabled:cursor-not-allowed select-none whitespace-nowrap';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables the button — the guard against double submits. */
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth, leftIcon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        BASE,
        VARIANTS[variant],
        variant === 'link' ? '' : SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : leftIcon}
      {children}
    </button>
  );
});

export interface LinkButtonProps {
  to: string;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
  state?: unknown;
}

/** A router link styled as a button — keeps navigation semantics correct. */
export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  state,
}: LinkButtonProps) {
  return (
    <Link
      to={to}
      state={state}
      className={cn(BASE, VARIANTS[variant], variant === 'link' ? '' : SIZES[size], fullWidth && 'w-full', className)}
    >
      {children}
    </Link>
  );
}
