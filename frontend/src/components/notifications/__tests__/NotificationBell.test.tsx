import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { NotificationBell } from '../NotificationBell';

describe('NotificationBell', () => {
  it('shows the unread badge and opens the drawer', async () => {
    render(<NotificationBell />);

    expect(screen.getByLabelText(/notifications/i)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeVisible();

    await userEvent.click(screen.getByLabelText(/notifications/i));
    expect(screen.getByRole('dialog', { name: /notifications/i })).toBeInTheDocument();
  });
});
