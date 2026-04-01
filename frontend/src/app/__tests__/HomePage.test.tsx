import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import HomePage from '../page';

describe('Home page', () => {
  it('shows account support text and includes auth links', () => {
    render(<HomePage />);

    expect(screen.getByText(/create an account to save and revisit reports/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my reports/i })).toBeInTheDocument();
  });
});