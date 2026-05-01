import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NotificationsPage from '../page';

const refreshUnreadCount = vi.fn();

vi.mock('@/store/authStore', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'clinician@example.com', role: 'clinician', displayName: 'Dr Clinician' },
    status: 'authenticated',
  }),
}));

vi.mock('@/store/notificationsStore', () => ({
  useNotifications: () => ({
    refreshUnreadCount,
  }),
}));

vi.mock('@/lib/notificationsApi', () => ({
  fetchNotifications: vi.fn().mockResolvedValue({
    items: [
      {
        id: 'n1',
        recipient_user_id: 'u1',
        type: 'new_report_shared',
        message: 'A report was shared with you.',
        read: false,
        created_at: '2026-04-28T10:00:00Z',
        resource_type: 'report',
        resource_id: 'r1',
        report_id: 'r1',
      },
    ],
    total_unread: 1,
    limit: 20,
    offset: 0,
  }),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  resolveNotificationHref: vi.fn(() => '/reports/shared'),
}));

vi.mock('@/components/ProtectedView', () => ({
  ProtectedView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('Notifications page', () => {
  it('renders the notification controls and loaded item', async () => {
    render(<NotificationsPage />);

    expect(screen.getByRole('heading', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unread/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark all read/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/a report was shared with you/i)).toBeInTheDocument();
    });
  });
});
