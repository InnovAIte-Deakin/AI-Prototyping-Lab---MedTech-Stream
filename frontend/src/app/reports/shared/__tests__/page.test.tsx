import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SharedReportsPage from '../page';

describe('Shared reports page', () => {
  it('renders shared reports heading', () => {
    render(<SharedReportsPage />);
    expect(screen.getByRole('heading', { name: /shared reports/i })).toBeInTheDocument();
  });
});
