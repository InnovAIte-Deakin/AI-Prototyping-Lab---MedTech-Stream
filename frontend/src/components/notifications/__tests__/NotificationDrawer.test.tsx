import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { NotificationDrawer } from '../NotificationDrawer';

const mockItems = [
  {
    id: 'n1',
    recipient_user_id: 'u1',
    type: 'clinician_replied_in_thread',
    message: 'Clinician replied in your thread.',
    read: false,
    created_at: '2026-04-28T10:00:00Z',
    resource_type: 'thread',
    resource_id: 't1',
    thread_id: 't1',
    report_id: 'r1',
  },
];

describe('NotificationDrawer', () => {
  it('closes on outside click and escape', async () => {
    const onClose = vi.fn();
    render(<NotificationDrawer open onClose={onClose} items={mockItems} />);

    await userEvent.click(screen.getByTestId('notifications-overlay'));
    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
