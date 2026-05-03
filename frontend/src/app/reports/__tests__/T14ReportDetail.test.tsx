import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ReportDetailPage from '../[reportId]/page';
import { AuthProvider } from '@/store/authStore';
import { addReportToHistory, clearReportHistory } from '@/lib/reportHistory';

function setupAuth() {
  localStorage.setItem('reportx_session', JSON.stringify({
    user: { id: '1', email: 'patient@example.com', role: 'patient', displayName: 'Jonathan Miller' },
    accessToken: 'access-token',
    accessTokenExpiresAt: Date.now() + 100000,
    refreshToken: 'refresh-token',
    refreshTokenExpiresAt: Date.now() + 1000000,
  }));
}

function mockDetailApi(overrides?: { title?: string; findings?: any[] }) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/v1/reports/') && url.endsWith('/trends')) {
      return new Response(JSON.stringify({ report_id: 'r1', subject_user_id: 'p1', trends: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/v1/reports/') && url.endsWith('/audit')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/api/v1/reports/') && url.endsWith('/threads')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/api/v1/reports/') && url.endsWith('/question-prompts')) {
      return new Response(JSON.stringify({ prompts: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/api/v1/reports/') && !url.includes('/share') && !url.endsWith('/trends') && !url.endsWith('/threads') && !url.endsWith('/audit') && !url.endsWith('/question-prompts')) {
      const reportId = url.split('/api/v1/reports/')[1];
      return new Response(JSON.stringify({
        report: {
          id: reportId,
          subject_user_id: 'p1',
          created_by_user_id: 'p1',
          title: overrides?.title || 'Comprehensive Metabolic Panel',
          source_kind: 'text',
          sharing_mode: 'private',
          observed_at: '2024-10-24T00:00:00Z',
          findings: overrides?.findings || [
            { id: 'f1', biomarker_key: 'glucose', display_name: 'Glucose, Serum', value_numeric: 104, value_text: null, unit: 'mg/dL', flag: 'high', reference_range_text: '65 - 99 mg/dL' },
            { id: 'f2', biomarker_key: 'creatinine', display_name: 'Creatinine, Serum', value_numeric: 0.92, value_text: null, unit: 'mg/dL', flag: 'normal', reference_range_text: '0.76 - 1.27 mg/dL' },
            { id: 'f3', biomarker_key: 'sodium', display_name: 'Sodium, Serum', value_numeric: 139, value_text: null, unit: 'mmol/L', flag: 'normal', reference_range_text: '134 - 144 mmol/L' },
            { id: 'f4', biomarker_key: 'bun', display_name: 'BUN', value_numeric: 16, value_text: null, unit: 'mg/dL', flag: 'normal', reference_range_text: '6 - 24 mg/dL' },
          ],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(null, { status: 404 });
  });
}

describe('T14 — Single Report view redesign', () => {
  beforeEach(() => {
    localStorage.clear();
    clearReportHistory();
    setupAuth();
    mockDetailApi();
  });

  afterEach(() => {
    global.fetch = vi.fn();
  });

  it('renders flag badges with correct variants for HIGH results', async () => {
    // Mock returns Glucose as HIGH, others as normal
    mockDetailApi({
      title: 'Metabolic Panel',
      findings: [
        { id: 'f1', biomarker_key: 'glucose', display_name: 'Glucose, Serum', value_numeric: 104, value_text: null, unit: 'mg/dL', flag: 'high', reference_range_text: '65 - 99 mg/dL' },
        { id: 'f2', biomarker_key: 'creatinine', display_name: 'Creatinine, Serum', value_numeric: 0.92, value_text: null, unit: 'mg/dL', flag: 'normal', reference_range_text: '0.76 - 1.27 mg/dL' },
      ],
    });

    render(<AuthProvider><ReportDetailPage params={{ reportId: 'test-high' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Metabolic Panel' })).toBeInTheDocument();
    });

    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getAllByText(/OPTIMAL/i).length).toBeGreaterThan(0);
  });

  it('renders flag badge LOW for low-flagged results', async () => {
    mockDetailApi({
      title: 'Panel Low',
      findings: [
        { id: 'f1', biomarker_key: 'vitd', display_name: 'Vitamin D', value_numeric: 14.2, value_text: null, unit: 'ng/mL', flag: 'low', reference_range_text: '30 - 100 ng/mL' },
      ],
    });

    render(<AuthProvider><ReportDetailPage params={{ reportId: 'test-low' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Panel Low' })).toBeInTheDocument();
    });

    expect(screen.getByText('LOW')).toBeInTheDocument();
  });

  it('renders Clinical Summary heading', async () => {
    mockDetailApi({ title: 'Report X' });

    render(<AuthProvider><ReportDetailPage params={{ reportId: 'test-clinical' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText('Clinical Summary')).toBeInTheDocument();
    });
  });

  it('renders Export PDF button', async () => {
    mockDetailApi({ title: 'Export Report', findings: [] });

    render(<AuthProvider><ReportDetailPage params={{ reportId: 'test-export' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export pdf/i })).toBeInTheDocument();
    });
  });

  it('renders Share Report button', async () => {
    mockDetailApi({ title: 'Share Report Test', findings: [] });

    render(<AuthProvider><ReportDetailPage params={{ reportId: 'test-share' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /share report/i })).toBeInTheDocument();
    });
  });

  it('renders Lab Results & Biomarkers heading', async () => {
    mockDetailApi({ title: 'Lab Report' });

    render(<AuthProvider><ReportDetailPage params={{ reportId: 'test-lab' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText('Lab Results & Biomarkers')).toBeInTheDocument();
    });
  });

  it('renders breadcrumb navigation', async () => {
    mockDetailApi({ title: 'Breadcrumb Test', findings: [] });

    render(<AuthProvider><ReportDetailPage params={{ reportId: 'test-bread' }} /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByText('Reports')).toBeInTheDocument();
    });
  });
});
