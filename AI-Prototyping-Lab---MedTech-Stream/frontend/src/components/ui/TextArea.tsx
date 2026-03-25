"use client";
import type { TextareaHTMLAttributes } from 'react';

export function TextArea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string }) {
  return (
    <textarea className={`textarea ${className}`.trim()} {...props} />
  );
}
