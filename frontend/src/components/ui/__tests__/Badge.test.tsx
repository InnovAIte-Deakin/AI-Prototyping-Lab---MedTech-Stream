import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from '../Badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>OPTIMAL</Badge>);
    expect(screen.getByText('OPTIMAL')).toBeInTheDocument();
  });

  it('applies badge base class', () => {
    render(<Badge>Test</Badge>);
    expect(screen.getByText('Test')).toHaveClass('badge');
  });

  it('applies optimal variant', () => {
    render(<Badge variant="optimal">OPTIMAL</Badge>);
    expect(screen.getByText('OPTIMAL')).toHaveClass('badge-optimal');
  });

  it('applies high variant', () => {
    render(<Badge variant="high">HIGH</Badge>);
    expect(screen.getByText('HIGH')).toHaveClass('badge-high');
  });

  it('applies low variant', () => {
    render(<Badge variant="low">LOW</Badge>);
    expect(screen.getByText('LOW')).toHaveClass('badge-low');
  });

  it('applies attention variant', () => {
    render(<Badge variant="attention">ATTENTION</Badge>);
    expect(screen.getByText('ATTENTION')).toHaveClass('badge-attention');
  });

  it('applies info variant', () => {
    render(<Badge variant="info">INFO</Badge>);
    expect(screen.getByText('INFO')).toHaveClass('badge-info');
  });

  it('defaults to normal variant', () => {
    render(<Badge>NORMAL</Badge>);
    expect(screen.getByText('NORMAL')).toHaveClass('badge-normal');
  });

  it('merges custom className', () => {
    render(<Badge className="extra">Tag</Badge>);
    expect(screen.getByText('Tag')).toHaveClass('badge', 'extra');
  });
});
