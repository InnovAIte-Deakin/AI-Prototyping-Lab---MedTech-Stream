import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationBell } from '../NotificationBell';

const toggleDrawer = vi.fn();

vi.mock('@/store/notificationsStore', () => ({
  useNotifications: () => ({
    unreadCount: 3,
    drawerOpen: false,
    drawerItems: [],
    drawerLoading: false,
    drawerError: null,
    openDrawer: vi.fn(),
    closeDrawer: vi.fn(),
    toggleDrawer,
    refreshUnreadCount: vi.fn(),
    refreshDrawerItems: vi.fn(),
    handleMarkAllRead: vi.fn(),
    handleMarkRead: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('NotificationBell', () => {
  it('shows the unread badge and toggles the drawer', async () => {
    render(<NotificationBell />);

    expect(screen.getByLabelText(/notifications/i)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeVisible();

    await userEvent.click(screen.getByLabelText(/notifications/i));
    expect(toggleDrawer).toHaveBeenCalled();
  });
});
