import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-ink-900 ' +
  'placeholder:text-ink-400 transition-colors ' +
  'hover:border-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 ' +
  'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500 ' +
  'aria-[invalid=true]:border-danger-500 aria-[invalid=true]:ring-danger-500/25';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(CONTROL, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(CONTROL, 'resize-y', className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(CONTROL, 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700', className)}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-2 focus:ring-brand-500/25"
        {...rest}
      />
      {label}
    </label>
  );
}
