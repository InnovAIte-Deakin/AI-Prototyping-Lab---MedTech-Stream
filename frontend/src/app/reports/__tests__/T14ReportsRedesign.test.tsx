import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ReportsPage from '../page';
import { AuthProvider } from '@/store/authStore';

function setupAuth() {
  localStorage.setItem('reportx_session', JSON.stringify({
    user: { id: '1', email: 'patient@example.com', role: 'patient', displayName: 'Patient' },
    accessToken: 'access-token',
    accessTokenExpiresAt: Date.now() + 100000,
    refreshToken: 'refresh-token',
    refreshTokenExpiresAt: Date.now() + 1000000,
  }));
}

function mockReportsApi(reports: any[]) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/v1/reports')) {
      return new Response(JSON.stringify(reports), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(null, { status: 404 });
  });
}

describe('T14 — My Reports page redesign', () => {
  beforeEach(() => {
    localStorage.clear();
    setupAuth();
  });

  afterEach(() => {
    global.fetch = vi.fn();
  });

  it('shows "General Panel" instead of "Unknown panel" when panel type is missing', async () => {
    mockReportsApi([{
      id: 'r1',
      title: 'Report 1',
      source_kind: 'text',
      sharing_mode: 'private',
      observed_at: new Date().toISOString(),
      findings: [
        { id: 'f1', biomarker_key: 'Hgb', display_name: 'Hgb', value_numeric: 13.5, value_text: null, unit: 'g/dL', flag: 'normal', reference_range_text: '11-15' },
      ],
    }]);

    render(<AuthProvider><ReportsPage /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getAllByText('General Panel').length).toBeGreaterThan(0);
    });

    expect(screen.queryByText('Unknown panel')).not.toBeInTheDocument();
  });

  it('shows actual panel name when available', async () => {
    mockReportsApi([{
      id: 'r1',
      title: 'LFT Panel',
      source_kind: 'text',
      sharing_mode: 'private',
      observed_at: new Date().toISOString(),
      panel_name: 'Liver Function Test',
      findings: [
        { id: 'f1', biomarker_key: 'ALT', display_name: 'ALT', value_numeric: 34, value_text: null, unit: 'U/L', flag: 'normal', reference_range_text: '7-56' },
      ],
    }]);

    render(<AuthProvider><ReportsPage /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getAllByText('Liver Function Test').length).toBeGreaterThan(0);
    });
  });

  it('renders interpretation status badge with correct variant', async () => {
    mockReportsApi([{
      id: 'r1',
      title: 'Report 1',
      source_kind: 'text',
      sharing_mode: 'private',
      observed_at: new Date().toISOString(),
      findings: [
        { id: 'f1', biomarker_key: 'Hgb', display_name: 'Hgb', value_numeric: 13.5, value_text: null, unit: 'g/dL', flag: 'normal', reference_range_text: '11-15' },
      ],
    }]);

    render(<AuthProvider><ReportsPage /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getAllByText(/not interpreted/i).length).toBeGreaterThan(0);
    });
  });

  it('opens sharing panel when share action is clicked', async () => {
    mockReportsApi([{
      id: 'r1',
      title: 'Report 1',
      source_kind: 'text',
      sharing_mode: 'private',
      observed_at: new Date().toISOString(),
      findings: [],
    }]);

    render(<AuthProvider><ReportsPage /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getAllByText('General Panel').length).toBeGreaterThan(0);
    });

    // Click the sharing action button (from desktop table)
    const shareButtons = screen.getAllByLabelText(/share report/i);
    await userEvent.click(shareButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Sharing Preferences')).toBeInTheDocument();
    });
  });

  it('renders report count summary text', async () => {
    mockReportsApi([{
      id: 'r1',
      title: 'Report 1',
      source_kind: 'text',
      sharing_mode: 'private',
      observed_at: new Date().toISOString(),
      findings: [],
    }]);

    render(<AuthProvider><ReportsPage /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText(/1.*clinical report/i)).toBeInTheDocument();
    });
  });

  it('renders Comprehensive Report History heading', async () => {
    mockReportsApi([]);

    render(<AuthProvider><ReportsPage /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText('Comprehensive Report History')).toBeInTheDocument();
    });
  });
});
