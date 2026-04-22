"use client";
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type Variant = 'primary' | 'outline' | 'accent' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export function Button(
  {
    children,
    className = '',
    variant = 'primary',
    size = 'md',
    ...props
  }: PropsWithChildren<
    ButtonHTMLAttributes<HTMLButtonElement>
  > & { className?: string; variant?: Variant; size?: Size }
) {
  const vClass = variant ? `btn-${variant}` : '';
  const sClass = size !== 'md' ? `btn-${size}` : '';
  return (
    <button className={`btn ${vClass} ${sClass} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
