import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import ReportsPage from '../page';
import ReportDetailPage from '../[reportId]/page';
import { AuthProvider } from '@/store/authStore';
import { addReportToHistory, clearReportHistory } from '@/lib/reportHistory';

describe('Report history and sharing preference flow', () => {
  beforeEach(() => {
    clearReportHistory();
    localStorage.clear();
    localStorage.setItem('reportx_session', JSON.stringify({
      user: { id: '1', email: 'patient@example.com', role: 'patient', displayName: 'Patient' },
      accessToken: 'access-token',
      accessTokenExpiresAt: Date.now() + 100000,
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: Date.now() + 1000000,
    }));
  });

  it('shows only patient reports in history and provides action buttons', async () => {
    addReportToHistory({ patientEmail: 'patient@example.com', title: 'Report A', rows: [], unparsed: [] });
    addReportToHistory({ patientEmail: 'other@example.com', title: 'Report B', rows: [], unparsed: [] });

    render(
      <AuthProvider>
        <ReportsPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Report A')).toBeInTheDocument();
    });

    expect(screen.queryByText('Report B')).toBeNull();
    expect(screen.getByRole('button', { name: /open report/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manage sharing preferences/i })).toBeInTheDocument();
  });

  it('navigates into report detail and allows sharing preference update', async () => {
    const report = addReportToHistory({
      patientEmail: 'patient@example.com',
      title: 'Report A',
      rows: [
        {
          test_name: 'Hgb',
          value: 13.5,
          unit: 'g/dL',
          reference_range: '11-15',
          flag: 'normal',
          confidence: 1,
        },
      ],
      unparsed: [],
    });

    render(
      <AuthProvider>
        <ReportDetailPage params={{ reportId: report.id }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Report A')).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText(/clinician email/i);
    fireEvent.change(emailInput, { target: { value: 'doc@clinic.org' } });
    fireEvent.change(screen.getByLabelText(/scope/i), { target: { value: 'full' } });

    fireEvent.click(screen.getByRole('button', { name: /start sharing/i }));

    await waitFor(() => {
      expect(screen.getByText(/sharing preferences updated/i)).toBeInTheDocument();
    });
  });

  it('loads existing sharing preferences and preserves full scope value', async () => {
    const existingPrefs = {
      clinicianEmail: 'saved-doc@clinic.org',
      scope: 'full' as const,
      expiresAt: Date.now() + 86400000,
      active: true,
    };
    const report = addReportToHistory({
      patientEmail: 'patient@example.com',
      title: 'Report B',
      rows: [],
      unparsed: [],
      sharingPreferences: existingPrefs,
    });

    render(
      <AuthProvider>
        <ReportDetailPage params={{ reportId: report.id }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Report B')).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/clinician email/i)).toHaveValue('saved-doc@clinic.org');
    expect(screen.getByLabelText(/scope/i)).toHaveValue('full');
    expect(screen.getByRole('button', { name: /update share/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /update share/i }));

    await waitFor(() => {
      expect(screen.getByText(/sharing preferences updated/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /update share/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /revoke/i })).toBeInTheDocument();
    });
  });

  it('refreshes report state after start sharing so button states are updated', async () => {
    const report = addReportToHistory({
      patientEmail: 'patient@example.com',
      title: 'Report C',
      rows: [],
      unparsed: [],
    });

    render(
      <AuthProvider>
        <ReportDetailPage params={{ reportId: report.id }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Report C')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/clinician email/i), { target: { value: 'doc2@clinic.org' } });
    fireEvent.change(screen.getByLabelText(/scope/i), { target: { value: 'full' } });

    fireEvent.click(screen.getByRole('button', { name: /start sharing/i }));

    await waitFor(() => {
      expect(screen.getByText(/sharing preferences updated/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /update share/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /revoke/i })).toBeInTheDocument();
    });
  });
});