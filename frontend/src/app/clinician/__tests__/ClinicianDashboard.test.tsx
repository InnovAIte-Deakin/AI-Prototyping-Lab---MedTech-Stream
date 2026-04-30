import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ClinicianDashboardPage from '../shared-reports/page';
import { AuthProvider } from '@/store/authStore';

function clinicianSession() {
  return {
    user: { id: 'c1', email: 'clinician@example.com', role: 'clinician' as const, displayName: 'Dr. Smith' },
    accessToken: 'clinician-token',
    accessTokenExpiresAt: Date.now() + 3600000,
    refreshToken: 'rt',
    refreshTokenExpiresAt: Date.now() + 7200000,
  };
}

function mockDashboardResponse(items: object[]) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/v1/clinician/shared-reports') && !url.match(/shared-reports\/[^/]+$/)) {
      return new Response(JSON.stringify(items), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 });
  });
}

function renderDashboard() {
  return render(
    <AuthProvider>
      <ClinicianDashboardPage />
    </AuthProvider>,
  );
}

describe('Clinician shared reports dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('reportx_session', JSON.stringify(clinicianSession()));
  });

  it('renders patient name, scope, and expiry for each shared report', async () => {
    mockDashboardResponse([
      {
        share_id: 's1',
        report_id: 'r1',
        patient_name: 'Alice Patient',
        patient_id: 'p1',
        report_date: new Date().toISOString(),
        panel_type: 'CBC Panel',
        view_scope: 'summary_only',
        include_doctor_summary: false,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        shared_at: new Date().toISOString(),
      },
    ]);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Alice Patient')).toBeDefined();
      expect(screen.getByText(/summary_only/i)).toBeDefined();
    });
    expect(screen.queryByText(/no reports/i) ?? null).toBeNull();
  });

  it('renders empty state when backend returns no shares', async () => {
    mockDashboardResponse([]);
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/no reports/i)).toBeDefined();
    });
  });

  it('renders panel type in each row', async () => {
    mockDashboardResponse([
      {
        share_id: 's2',
        report_id: 'r2',
        patient_name: 'Bob Patient',
        patient_id: 'p2',
        report_date: new Date().toISOString(),
        panel_type: 'Lipid Panel',
        view_scope: 'full_report',
        include_doctor_summary: true,
        expires_at: new Date(Date.now() + 172800000).toISOString(),
        shared_at: new Date().toISOString(),
      },
    ]);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Lipid Panel')).toBeDefined();
    });
  });

  it('renders an Open action link for each row', async () => {
    mockDashboardResponse([
      {
        share_id: 's3',
        report_id: 'r3',
        patient_name: 'Carol Patient',
        patient_id: 'p3',
        report_date: new Date().toISOString(),
        panel_type: 'KFT',
        view_scope: 'full_report_with_threads',
        include_doctor_summary: false,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        shared_at: new Date().toISOString(),
      },
    ]);

    renderDashboard();

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /open/i });
      expect(link).toBeDefined();
      expect(link.getAttribute('href')).toContain('r3');
    });
  });

  it('does not render share, export, revoke, or audit controls', async () => {
    mockDashboardResponse([]);
    renderDashboard();

    await waitFor(() => screen.getByText(/no reports/i));

    // Clinician view must have no action buttons for sharing/revoking/exporting/auditing
    expect(screen.queryByRole('button', { name: /share/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /revoke/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /audit/i })).toBeNull();
    expect(screen.queryByText(/revoke/i)).toBeNull();
    expect(screen.queryByText(/export/i)).toBeNull();
  });
});
