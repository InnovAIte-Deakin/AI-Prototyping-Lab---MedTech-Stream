import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Card } from '../Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies card base class', () => {
    render(<Card>Content</Card>);
    expect(screen.getByText('Content').closest('.rx-card')).toBeInTheDocument();
  });

  it('applies accent variant with left bar', () => {
    const { container } = render(<Card accent="purple">Insight</Card>);
    expect(container.firstChild).toHaveClass('rx-card--accent-purple');
  });

  it('merges custom className', () => {
    const { container } = render(<Card className="custom">Content</Card>);
    expect(container.firstChild).toHaveClass('rx-card', 'custom');
  });

  it('renders as a section element when specified', () => {
    render(<Card as="section">Section card</Card>);
    const el = screen.getByText('Section card').closest('section');
    expect(el).toBeInTheDocument();
  });
});
