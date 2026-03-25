"use client";
import type { InputHTMLAttributes } from 'react';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input className={`input ${className}`.trim()} {...props} />
  );
}
