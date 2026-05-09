import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SharedReportsPage from '../page';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams('reportId=r1'),
  usePathname: () => '/reports/shared',
}));

vi.mock('@/components/ProtectedView', () => ({
  ProtectedView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/store/notificationsStore', () => ({
  useNotifications: () => ({
    unreadCount: 0,
    drawerOpen: false,
    drawerItems: [],
    drawerLoading: false,
    drawerError: null,
    openDrawer: vi.fn(),
    closeDrawer: vi.fn(),
    toggleDrawer: vi.fn(),
    refreshUnreadCount: vi.fn(),
    refreshDrawerItems: vi.fn(),
    handleMarkAllRead: vi.fn(),
    handleMarkRead: vi.fn(),
  }),
}));

describe('Shared reports page', () => {
  it('renders shared reports and focuses the requested report', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify([
      {
        share_id: 's1',
        report_id: 'r1',
        report: { id: 'r1', title: 'CMP', created_at: '2026-04-28T10:00:00Z', observed_at: '2026-04-28T10:00:00Z', findings: [] },
        patient: { id: 'p1', email: 'patient@example.com', display_name: 'Patient One' },
        scope: 'report',
        access_level: 'comment',
        shared_at: '2026-04-28T10:00:00Z',
        expires_at: '2026-05-05T10:00:00Z',
      },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    render(<SharedReportsPage />);

    expect(screen.getByRole('heading', { name: /shared reports/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/patient one/i)).toBeInTheDocument();
      expect(screen.getByText(/viewing shared report/i)).toBeInTheDocument();
    });
  });
});
