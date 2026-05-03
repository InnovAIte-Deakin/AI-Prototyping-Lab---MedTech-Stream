import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TextArea } from '../TextArea';

describe('TextArea', () => {
  it('renders with textarea class', () => {
    render(<TextArea aria-label="Notes" />);
    expect(screen.getByRole('textbox')).toHaveClass('textarea');
  });

  it('shows placeholder', () => {
    render(<TextArea placeholder="Write here" />);
    expect(screen.getByPlaceholderText('Write here')).toBeInTheDocument();
  });

  it('handles user input', async () => {
    const onChange = vi.fn();
    render(<TextArea aria-label="Notes" onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'test');
    expect(onChange).toHaveBeenCalled();
  });

  it('merges custom className', () => {
    render(<TextArea aria-label="Test" className="custom" />);
    expect(screen.getByRole('textbox')).toHaveClass('textarea', 'custom');
  });
});
