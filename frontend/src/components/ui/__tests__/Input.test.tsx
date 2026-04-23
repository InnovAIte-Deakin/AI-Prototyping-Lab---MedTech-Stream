import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Input } from '../Input';

describe('Input', () => {
  it('renders with input class', () => {
    render(<Input aria-label="Name" />);
    expect(screen.getByRole('textbox')).toHaveClass('input');
  });

  it('shows placeholder', () => {
    render(<Input placeholder="Enter email" />);
    expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
  });

  it('handles user input', async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Email" onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'hello');
    expect(onChange).toHaveBeenCalled();
  });

  it('merges custom className', () => {
    render(<Input aria-label="Test" className="custom" />);
    expect(screen.getByRole('textbox')).toHaveClass('input', 'custom');
  });

  it('supports disabled state', () => {
    render(<Input aria-label="Disabled" disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
