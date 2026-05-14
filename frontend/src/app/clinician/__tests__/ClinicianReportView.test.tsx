import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ClinicianReportViewPage from '../shared-reports/[reportId]/page';
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

function mockReportResponse(reportId: string, body: object | null, status = 200) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(`/api/v1/clinician/shared-reports/${reportId}`)) {
      if (status !== 200) {
        return new Response(JSON.stringify({ detail: 'No active share found for this report and clinician' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 });
  });
}

const REPORT_ID = 'report-abc';

function renderView(reportId = REPORT_ID) {
  return render(
    <AuthProvider>
      <ClinicianReportViewPage params={{ reportId }} />
    </AuthProvider>,
  );
}

describe('Clinician scoped report view', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('reportx_session', JSON.stringify(clinicianSession()));
  });

  it('summary_only view renders AI summary and no findings table in the DOM', async () => {
    mockReportResponse(REPORT_ID, {
      report_id: REPORT_ID,
      view_scope: 'summary_only',
      include_doctor_summary: false,
      patient: { id: 'p1', display_name: 'Alice Patient' },
      report_date: new Date().toISOString(),
      panel_type: 'CBC Panel',
      ai_summary: { summary: 'Everything looks normal.' },
      findings: null,
      trends: null,
      threads: null,
      doctor_summary: null,
    });

    renderView();

    await waitFor(() => {
      expect(screen.getByText(/everything looks normal/i)).toBeDefined();
    });

    // findings table must be ABSENT, not hidden
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('full_report view renders findings table and trend chart', async () => {
    mockReportResponse(REPORT_ID, {
      report_id: REPORT_ID,
      view_scope: 'full_report',
      include_doctor_summary: false,
      patient: { id: 'p1', display_name: 'Alice Patient' },
      report_date: new Date().toISOString(),
      panel_type: 'CBC Panel',
      ai_summary: { summary: 'Some values are elevated.' },
      findings: [
        {
          id: 'f1',
          biomarker_key: 'hgb',
          display_name: 'Hemoglobin',
          value_numeric: 9.5,
          value_text: null,
          unit: 'g/dL',
          flag: 'low',
          reference_range_text: '11-15',
        },
      ],
      trends: [
        {
          biomarker_key: 'hgb',
          display_name: 'Hemoglobin',
          unit: 'g/dL',
          direction: 'declining',
          trend_note: 'Declining trend over last 3 reports.',
          sparkline: [
            { report_id: 'r0', observed_at: new Date().toISOString(), value: 11.0, unit: 'g/dL', flag: 'normal' },
            { report_id: REPORT_ID, observed_at: new Date().toISOString(), value: 9.5, unit: 'g/dL', flag: 'low' },
          ],
        },
      ],
      threads: null,
      doctor_summary: null,
    });

    renderView();

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeDefined();
    });

    expect(screen.getAllByText('Hemoglobin').length).toBeGreaterThan(0);
    expect(screen.getByText(/trend analysis/i)).toBeDefined();
    expect(screen.queryByRole('heading', { name: /thread/i })).toBeNull();
  });

  it('full_report_with_threads view renders thread panel', async () => {
    mockReportResponse(REPORT_ID, {
      report_id: REPORT_ID,
      view_scope: 'full_report_with_threads',
      include_doctor_summary: false,
      patient: { id: 'p1', display_name: 'Alice Patient' },
      report_date: new Date().toISOString(),
      panel_type: 'CBC Panel',
      ai_summary: { summary: 'Some values flagged.' },
      findings: [
        {
          id: 'f1',
          biomarker_key: 'hgb',
          display_name: 'Hemoglobin',
          value_numeric: 9.5,
          value_text: null,
          unit: 'g/dL',
          flag: 'low',
          reference_range_text: '11-15',
        },
      ],
      trends: [],
      threads: [
        {
          id: 't1',
          title: 'Discuss Hgb',
          status: 'open',
          messages: [
            { id: 'm1', author_user_id: 'p1', body: 'Why is this low?', created_at: new Date().toISOString() },
          ],
        },
      ],
      doctor_summary: null,
    });

    renderView();

    await waitFor(() => {
      expect(screen.getByText(/discuss hgb/i)).toBeDefined();
    });

    expect(screen.getByRole('table')).toBeDefined();
  });

  it('submits structured clinician response templates from a shared report thread', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes(`/api/v1/clinician/shared-reports/${REPORT_ID}`)) {
        return new Response(JSON.stringify({
          report_id: REPORT_ID,
          view_scope: 'full_report_with_threads',
          include_doctor_summary: true,
          patient: { id: 'p1', display_name: 'Alice Patient', email: 'alice@example.com', date_of_birth: null },
          report_date: new Date().toISOString(),
          panel_type: 'CBC Panel',
          ai_summary: { summary: 'Some values flagged.' },
          findings: [],
          trends: [],
          threads: [
            {
              id: 't1',
              title: 'Discuss glucose',
              status: 'open',
              messages: [
                { id: 'm1', author_user_id: 'p1', kind: 'text', body: 'What should I do?', created_at: new Date().toISOString() },
              ],
            },
          ],
          doctor_summary: { summary: 'Doctor remarks here.' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/v1/threads/t1/messages') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          id: 'm2',
          author_user_id: 'c1',
          kind: 'template',
          body: JSON.stringify({ meaning: 'This can follow recent meals.', urgency: 'soon', action: 'Repeat fasting labs.' }),
          created_at: new Date().toISOString(),
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 });
    });
    global.fetch = fetchMock;

    renderView();

    await waitFor(() => {
      expect(screen.getByText(/clinician response template/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/what the result means/i), { target: { value: 'This can follow recent meals.' } });
    fireEvent.change(screen.getByLabelText(/urgency/i), { target: { value: 'soon' } });
    fireEvent.change(screen.getByLabelText(/recommended action/i), { target: { value: 'Repeat fasting labs.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit clinical response/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([url, init]) => String(url).includes('/api/v1/threads/t1/messages') && init?.method === 'POST');
      expect(postCall).toBeTruthy();
      expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
        template_payload: {
          meaning: 'This can follow recent meals.',
          urgency: 'soon',
          action: 'Repeat fasting labs.',
        },
      });
      expect(screen.getByText(/clinician response/i)).toBeDefined();
    });
  });

  it('access-denied state renders when backend returns 403', async () => {
    mockReportResponse(REPORT_ID, null, 403);

    renderView();

    await waitFor(() => {
      expect(screen.getByText(/access denied/i)).toBeDefined();
    });

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).toBeDefined();
    expect(dashboardLink.getAttribute('href')).toContain('clinician');
  });

  it('renders patient profile in the report header', async () => {
    mockReportResponse(REPORT_ID, {
      report_id: REPORT_ID,
      view_scope: 'summary_only',
      include_doctor_summary: false,
      patient: { id: 'p1', display_name: 'Bob Patient' },
      report_date: new Date().toISOString(),
      panel_type: 'KFT',
      ai_summary: null,
      findings: null,
      trends: null,
      threads: null,
      doctor_summary: null,
    });

    renderView();

    await waitFor(() => {
      expect(screen.getByText('Bob Patient')).toBeDefined();
    });
  });

  it('does not render share, export, revoke, or audit controls', async () => {
    mockReportResponse(REPORT_ID, {
      report_id: REPORT_ID,
      view_scope: 'full_report',
      include_doctor_summary: false,
      patient: { id: 'p1', display_name: 'Alice Patient' },
      report_date: new Date().toISOString(),
      panel_type: 'CBC Panel',
      ai_summary: null,
      findings: [],
      trends: [],
      threads: null,
      doctor_summary: null,
    });

    renderView();

    await waitFor(() => screen.getByText('Alice Patient'));

    expect(screen.queryByText(/export pdf/i)).toBeNull();
    expect(screen.queryByText(/revoke/i)).toBeNull();
    expect(screen.queryByText(/audit/i)).toBeNull();
    expect(screen.queryByText(/share with/i)).toBeNull();
  });

  it('shows doctor summary section when include_doctor_summary is true', async () => {
    mockReportResponse(REPORT_ID, {
      report_id: REPORT_ID,
      view_scope: 'full_report',
      include_doctor_summary: true,
      patient: { id: 'p1', display_name: 'Alice Patient' },
      report_date: new Date().toISOString(),
      panel_type: 'CBC Panel',
      ai_summary: null,
      findings: [],
      trends: [],
      threads: null,
      doctor_summary: { summary: 'Doctor remarks here.' },
    });

    renderView();

    await waitFor(() => {
      expect(screen.getByText(/doctor remarks here/i)).toBeDefined();
    });
  });

  it('hides doctor summary section when include_doctor_summary is false', async () => {
    mockReportResponse(REPORT_ID, {
      report_id: REPORT_ID,
      view_scope: 'full_report',
      include_doctor_summary: false,
      patient: { id: 'p1', display_name: 'Alice Patient' },
      report_date: new Date().toISOString(),
      panel_type: 'CBC Panel',
      ai_summary: null,
      findings: [],
      trends: [],
      threads: null,
      doctor_summary: null,
    });

    renderView();

    await waitFor(() => screen.getByText('Alice Patient'));

    expect(screen.queryByText(/doctor summary/i)).toBeNull();
  });
});
