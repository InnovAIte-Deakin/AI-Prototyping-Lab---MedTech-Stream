"use client";
import type { HTMLAttributes, PropsWithChildren, ElementType } from 'react';

type CardAccent = 'blue' | 'purple' | 'orange';

export function Card({
  children,
  className = '',
  accent,
  as: Tag = 'div',
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLElement>> & {
  className?: string;
  accent?: CardAccent;
  as?: ElementType;
}) {
  const accentClass = accent ? `rx-card--accent-${accent}` : '';
  return (
    <Tag
      className={`rx-card ${accentClass} ${className}`.replace(/\s+/g, ' ').trim()}
      {...props}
    >
      {children}
    </Tag>
  );
}
