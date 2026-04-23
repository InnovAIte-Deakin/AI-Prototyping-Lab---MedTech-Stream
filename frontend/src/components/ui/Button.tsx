"use client";
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type Variant = 'primary' | 'outline' | 'ghost' | 'accent' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  className?: string;
  variant?: Variant;
  size?: Size;
}) {
  const vClass = `btn-${variant}`;
  const sClass = size !== 'md' ? `btn-${size}` : '';
  return (
    <button
      className={`btn ${vClass} ${sClass} ${className}`.replace(/\s+/g, ' ').trim()}
      {...props}
    >
      {children}
    </button>
  );
}
