"use client";
import type { PropsWithChildren, HTMLAttributes } from 'react';

export function Table({ children, className = '', ...rest }: PropsWithChildren & HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={`table ${className}`.trim()} {...rest}>
      {children}
    </table>
  );
}

export function THead({ children, className = '', ...rest }: PropsWithChildren & HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={className} {...rest}>
      {children}
    </thead>
  );
}

export function TBody({ children, className = '', ...rest }: PropsWithChildren & HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...rest}>
      {children}
    </tbody>
  );
}

export function TR({ children, className = '', ...rest }: PropsWithChildren & HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={className} {...rest}>
      {children}
    </tr>
  );
}

export function TH({ children, className = '', ...rest }: PropsWithChildren & HTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={className} {...rest}>
      {children}
    </th>
  );
}

export function TD({ children, className = '', ...rest }: PropsWithChildren & HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={className} {...rest}>
      {children}
    </td>
  );
}
