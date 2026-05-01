import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationDrawer } from '../NotificationDrawer';

const handleMarkAllRead = vi.fn();
const handleMarkRead = vi.fn();
const refreshDrawerItems = vi.fn();

vi.mock('@/store/notificationsStore', () => ({
  useNotifications: () => ({
    unreadCount: 1,
    drawerOpen: true,
    drawerItems: [
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
    ],
    drawerLoading: false,
    drawerError: null,
    openDrawer: vi.fn(),
    closeDrawer: vi.fn(),
    toggleDrawer: vi.fn(),
    refreshUnreadCount: vi.fn(),
    refreshDrawerItems,
    handleMarkAllRead,
    handleMarkRead,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('NotificationDrawer', () => {
  it('shows notifications and closes on overlay click', async () => {
    const onClose = vi.fn();
    render(<NotificationDrawer open onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByText(/clinician replied in your thread/i)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('notifications-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('supports mark all read', async () => {
    const onClose = vi.fn();
    render(<NotificationDrawer open onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    expect(handleMarkAllRead).toHaveBeenCalled();
  });
});
