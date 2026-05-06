import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/reports/shared',
}));

// Mock NotificationsProvider
vi.mock('@/store/notificationsStore', () => ({
  NotificationsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

import SharedReportsPage from '../shared/page';
import { AuthProvider } from '@/store/authStore';

function setupClinicianAuth() {
  localStorage.setItem('reportx_session', JSON.stringify({
    user: { id: 'c1', email: 'dr.smith@hospital.org', role: 'clinician', displayName: 'Dr. Smith' },
    accessToken: 'access-token',
    accessTokenExpiresAt: Date.now() + 100000,
    refreshToken: 'refresh-token',
    refreshTokenExpiresAt: Date.now() + 1000000,
  }));
}

const SHARED_REPORTS_RESPONSE = [
  {
    share_id: 's1',
    report_id: 'r1',
    report: {
      id: 'r1',
      title: 'Comprehensive Metabolic Panel',
      created_at: '2024-10-14T10:45:00Z',
      observed_at: '2024-10-14T10:45:00Z',
      findings: [
        { id: 'f1', display_name: 'Glucose', value_numeric: 104, unit: 'mg/dL', flag: 'high' },
      ],
    },
    patient: { id: 'p1', email: 'patient@example.com', display_name: 'Jonathan Miller' },
    scope: 'full_report',
    access_level: 'read',
    shared_at: '2024-10-15T08:00:00Z',
    expires_at: '2025-12-31T23:59:59Z',
  },
  {
    share_id: 's2',
    report_id: 'r2',
    report: {
      id: 'r2',
      title: 'Lipid Profile',
      created_at: '2024-05-05T09:15:00Z',
      observed_at: '2024-05-05T09:15:00Z',
      findings: [],
    },
    patient: { id: 'p2', email: 'jane@example.com', display_name: 'Jane Doe' },
    scope: 'summary_only',
    access_level: 'read',
    shared_at: '2024-05-06T10:00:00Z',
    expires_at: '2025-06-30T23:59:59Z',
  },
];

function mockSharedReportsApi(items: any[] = SHARED_REPORTS_RESPONSE) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/v1/reports/shared-reports')) {
      return new Response(JSON.stringify(items), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/v1/notifications/unread-count')) {
      return new Response(JSON.stringify({ unread: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(null, { status: 404 });
  });
}

describe('T15 — Clinician Shared Reports Dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    setupClinicianAuth();
    mockSharedReportsApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders dashboard heading "Shared Reports"', async () => {
    render(<AuthProvider><SharedReportsPage /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /shared reports/i })).toBeInTheDocument();
    });
  });

  it('displays patient name in each shared report row', async () => {
    render(<AuthProvider><SharedReportsPage /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText('Jonathan Miller')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
  });

  it('displays share scope badge for each report', async () => {
    render(<AuthProvider><SharedReportsPage /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText(/full report/i)).toBeInTheDocument();
      expect(screen.getByText(/summary only/i)).toBeInTheDocument();
    });
  });

  it('renders an Open action button for each report row', async () => {
    render(<AuthProvider><SharedReportsPage /></AuthProvider>);

    await waitFor(() => {
      const openButtons = screen.getAllByRole('button', { name: /open/i });
      expect(openButtons.length).toBe(2);
    });
  });

  it('renders empty state message when no shared reports exist', async () => {
    mockSharedReportsApi([]);

    render(<AuthProvider><SharedReportsPage /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText(/no reports have been shared with you/i)).toBeInTheDocument();
    });
  });

  it('displays report panel type / title in each row', async () => {
    render(<AuthProvider><SharedReportsPage /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText('Comprehensive Metabolic Panel')).toBeInTheDocument();
      expect(screen.getByText('Lipid Profile')).toBeInTheDocument();
    });
  });

  it('displays expiry date for each shared report', async () => {
    render(<AuthProvider><SharedReportsPage /></AuthProvider>);

    await waitFor(() => {
      // At least one expiry date text should be present
      const cells = screen.getAllByText(/2025/);
      expect(cells.length).toBeGreaterThanOrEqual(2);
    });
  });
});
