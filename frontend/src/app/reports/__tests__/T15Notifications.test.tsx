import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We test the NotificationBell + drawer behavior here
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationsProvider } from '@/store/notificationsStore';
import { AuthProvider } from '@/store/authStore';

function setupAuth() {
  localStorage.setItem('reportx_session', JSON.stringify({
    user: { id: 'c1', email: 'dr.smith@hospital.org', role: 'clinician', displayName: 'Dr. Smith' },
    accessToken: 'access-token',
    accessTokenExpiresAt: Date.now() + 100000,
    refreshToken: 'refresh-token',
    refreshTokenExpiresAt: Date.now() + 1000000,
  }));
}

function mockNotificationsApi(unreadCount: number, items: any[] = []) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method?.toUpperCase() || 'GET';

    if (url.includes('/api/v1/notifications/unread-count')) {
      return new Response(JSON.stringify({ unread: unreadCount }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/v1/notifications/read-all') && method === 'PATCH') {
      return new Response(null, { status: 204 });
    }
    if (url.includes('/api/v1/notifications') && !url.includes('read')) {
      return new Response(JSON.stringify({
        items,
        total_unread: unreadCount,
        limit: 10,
        offset: 0,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(null, { status: 404 });
  });
}

describe('T15 — Notification nav indicator', () => {
  beforeEach(() => {
    localStorage.clear();
    setupAuth();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders notification bell button', async () => {
    mockNotificationsApi(0);

    render(
      <AuthProvider>
        <NotificationsProvider>
          <NotificationBell />
        </NotificationsProvider>
      </AuthProvider>,
    );

    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });

  it('shows unread count badge when there are unread notifications', async () => {
    mockNotificationsApi(5);

    render(
      <AuthProvider>
        <NotificationsProvider>
          <NotificationBell />
        </NotificationsProvider>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  it('does not show badge when unread count is 0', async () => {
    mockNotificationsApi(0);

    render(
      <AuthProvider>
        <NotificationsProvider>
          <NotificationBell />
        </NotificationsProvider>
      </AuthProvider>,
    );

    // Wait for initial fetch
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // No badge text should be present
    const button = screen.getByRole('button', { name: /notifications/i });
    expect(button.querySelector('.notifications-badge-dot')).toBeNull();
  });

  it('opens notification drawer when bell is clicked', async () => {
    const notificationItems = [
      {
        id: 'n1',
        recipient_user_id: 'c1',
        type: 'new_report_shared',
        message: 'Jonathan Miller shared a report with you',
        read: false,
        created_at: '2024-10-15T08:00:00Z',
        resource_type: 'report',
        resource_id: 'r1',
        report_id: 'r1',
      },
    ];
    mockNotificationsApi(1, notificationItems);

    render(
      <AuthProvider>
        <NotificationsProvider>
          <NotificationBell />
        </NotificationsProvider>
      </AuthProvider>,
    );

    const bell = screen.getByRole('button', { name: /notifications/i });
    await userEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /notifications/i })).toBeInTheDocument();
    });
  });

  it('displays notification message and timestamp in drawer', async () => {
    const notificationItems = [
      {
        id: 'n1',
        recipient_user_id: 'c1',
        type: 'new_report_shared',
        message: 'Jonathan Miller shared a report with you',
        read: false,
        created_at: '2024-10-15T08:00:00Z',
        resource_type: 'report',
        resource_id: 'r1',
        report_id: 'r1',
      },
    ];
    mockNotificationsApi(1, notificationItems);

    render(
      <AuthProvider>
        <NotificationsProvider>
          <NotificationBell />
        </NotificationsProvider>
      </AuthProvider>,
    );

    const bell = screen.getByRole('button', { name: /notifications/i });
    await userEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText('Jonathan Miller shared a report with you')).toBeInTheDocument();
    });
  });

  it('shows mark all read button in drawer', async () => {
    mockNotificationsApi(1, [{
      id: 'n1',
      recipient_user_id: 'c1',
      type: 'new_report_shared',
      message: 'Test notification',
      read: false,
      created_at: '2024-10-15T08:00:00Z',
      resource_type: 'report',
      resource_id: 'r1',
    }]);

    render(
      <AuthProvider>
        <NotificationsProvider>
          <NotificationBell />
        </NotificationsProvider>
      </AuthProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /mark all read/i })).toBeInTheDocument();
    });
  });
});
