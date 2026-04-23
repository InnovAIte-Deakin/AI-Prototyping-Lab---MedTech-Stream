"use client";
import type { HTMLAttributes, PropsWithChildren } from 'react';

type BadgeVariant = 'normal' | 'optimal' | 'high' | 'low' | 'attention' | 'info';

export function Badge({
  children,
  className = '',
  variant = 'normal',
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLSpanElement>> & {
  className?: string;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`badge badge-${variant} ${className}`.replace(/\s+/g, ' ').trim()}
      {...props}
    >
      {children}
    </span>
  );
}
