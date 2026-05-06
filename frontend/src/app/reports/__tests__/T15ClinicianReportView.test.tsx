import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/reports/shared/r1',
}));

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

import ClinicianReportViewPage from '../shared/[reportId]/page';
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

function makeSharedReportResponse(scope: string, options?: { include_doctor_summary?: boolean }) {
  return {
    share: {
      share_id: 's1',
      scope,
      access_level: 'read',
      expires_at: '2025-12-31T23:59:59Z',
      include_doctor_summary: options?.include_doctor_summary ?? false,
    },
    patient: { id: 'p1', email: 'patient@example.com', display_name: 'Jonathan Miller', date_of_birth: '1985-03-15' },
    report: {
      id: 'r1',
      title: 'Comprehensive Metabolic Panel',
      created_at: '2024-10-14T10:45:00Z',
      observed_at: '2024-10-14T10:45:00Z',
      interpretation: { summary: 'Your metabolic profile is stable and shows healthy kidney function.' },
      findings: [
        { id: 'f1', biomarker_key: 'glucose', display_name: 'Glucose, Serum', value_numeric: 104, value_text: null, unit: 'mg/dL', flag: 'high', reference_range_text: '65 - 99 mg/dL' },
        { id: 'f2', biomarker_key: 'creatinine', display_name: 'Creatinine, Serum', value_numeric: 0.92, value_text: null, unit: 'mg/dL', flag: 'normal', reference_range_text: '0.76 - 1.27 mg/dL' },
      ],
    },
  };
}

function mockSharedReportApi(scope: string, options?: { include_doctor_summary?: boolean }) {
  const data = makeSharedReportResponse(scope, options);
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/v1/reports/shared-reports/')) {
      return new Response(JSON.stringify(data), {
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
    if (url.includes('/trends')) {
      return new Response(JSON.stringify({ trends: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/threads')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(null, { status: 404 });
  });
}

describe('T15 — Clinician Scoped Report View', () => {
  beforeEach(() => {
    localStorage.clear();
    setupClinicianAuth();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders patient profile header with name', async () => {
    mockSharedReportApi('full_report');

    render(<AuthProvider><ClinicianReportViewPage params={{ reportId: 'r1' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText('Jonathan Miller')).toBeInTheDocument();
    });
  });

  it('renders report title as heading', async () => {
    mockSharedReportApi('full_report');

    render(<AuthProvider><ClinicianReportViewPage params={{ reportId: 'r1' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Comprehensive Metabolic Panel' })).toBeInTheDocument();
    });
  });

  it('summary_only scope shows AI summary but hides findings table', async () => {
    mockSharedReportApi('summary_only');

    render(<AuthProvider><ClinicianReportViewPage params={{ reportId: 'r1' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText(/metabolic profile is stable/i)).toBeInTheDocument();
    });

    // Findings table should NOT be rendered
    expect(screen.queryByText('Glucose, Serum')).not.toBeInTheDocument();
    expect(screen.queryByText('Lab Results')).not.toBeInTheDocument();
  });

  it('full_report scope shows summary AND findings table', async () => {
    mockSharedReportApi('full_report');

    render(<AuthProvider><ClinicianReportViewPage params={{ reportId: 'r1' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText(/metabolic profile is stable/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Glucose, Serum')).toBeInTheDocument();
  });

  it('full_report scope hides thread panel', async () => {
    mockSharedReportApi('full_report');

    render(<AuthProvider><ClinicianReportViewPage params={{ reportId: 'r1' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Comprehensive Metabolic Panel' })).toBeInTheDocument();
    });

    expect(screen.queryByText(/conversation threads/i)).not.toBeInTheDocument();
  });

  it('full_report_with_threads scope shows thread panel', async () => {
    mockSharedReportApi('full_report_with_threads');

    render(<AuthProvider><ClinicianReportViewPage params={{ reportId: 'r1' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Comprehensive Metabolic Panel' })).toBeInTheDocument();
    });

    expect(screen.getByText(/conversation threads/i)).toBeInTheDocument();
  });

  it('shows doctor summary section when include_doctor_summary is true', async () => {
    mockSharedReportApi('full_report', { include_doctor_summary: true });

    render(<AuthProvider><ClinicianReportViewPage params={{ reportId: 'r1' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText(/doctor summary/i)).toBeInTheDocument();
    });
  });

  it('hides doctor summary section when include_doctor_summary is false', async () => {
    mockSharedReportApi('full_report', { include_doctor_summary: false });

    render(<AuthProvider><ClinicianReportViewPage params={{ reportId: 'r1' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Comprehensive Metabolic Panel' })).toBeInTheDocument();
    });

    expect(screen.queryByText(/doctor summary/i)).not.toBeInTheDocument();
  });
});
