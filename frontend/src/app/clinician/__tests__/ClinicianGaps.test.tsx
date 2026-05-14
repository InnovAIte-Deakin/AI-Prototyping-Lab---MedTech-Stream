/**
 * TDD gap-fill tests for T17:
 *   Gap 1 — DOB displayed in clinician report header
 *   Gap 2 — Thread reply composer visible only for full_report_with_threads
 *   Gap 3 — SharingPreferencesPanel exposes three view_scope options
 *            and include_doctor_summary checkbox
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ClinicianReportViewPage from '../shared-reports/[reportId]/page';
import { SharingPreferencesPanel } from '@/components/SharingPreferencesPanel';
import { AuthProvider } from '@/store/authStore';

const REPORT_ID = 'report-gaps';

function clinicianSession() {
  return {
    user: {
      id: 'c1',
      email: 'clinician@example.com',
      role: 'clinician' as const,
      displayName: 'Dr. Smith',
    },
    accessToken: 'clinician-token',
    accessTokenExpiresAt: Date.now() + 3600000,
    refreshToken: 'rt',
    refreshTokenExpiresAt: Date.now() + 7200000,
  };
}

function mockReport(overrides: object) {
  const base = {
    report_id: REPORT_ID,
    view_scope: 'summary_only',
    include_doctor_summary: false,
    patient: { id: 'p1', display_name: 'Alice Patient', date_of_birth: '1990-05-20' },
    report_date: new Date().toISOString(),
    panel_type: 'CBC Panel',
    ai_summary: { summary: 'Results look normal.' },
    findings: null,
    trends: null,
    threads: null,
    doctor_summary: null,
  };
  return { ...base, ...overrides };
}

function setupFetch(report: object) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(`/api/v1/clinician/shared-reports/${REPORT_ID}`)) {
      return new Response(JSON.stringify(report), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/v1/threads/')) {
      return new Response(JSON.stringify({ id: 'm1', author_user_id: 'c1', body: 'Reply', created_at: new Date().toISOString() }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 });
  });
}

function renderView() {
  return render(
    <AuthProvider>
      <ClinicianReportViewPage params={{ reportId: REPORT_ID }} />
    </AuthProvider>,
  );
}

// ── Gap 1: DOB in patient profile header ─────────────────────────────────────

describe('Gap 1 — DOB in patient profile header', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('reportx_session', JSON.stringify(clinicianSession()));
  });

  it('displays formatted date of birth when present', async () => {
    setupFetch(mockReport({ patient: { id: 'p1', display_name: 'Alice Patient', date_of_birth: '1990-05-20' } }));
    renderView();
    await waitFor(() => {
      // Should render the DOB in some readable form — ISO date or formatted
      expect(screen.getByText(/1990/)).toBeDefined();
    });
  });

  it('omits DOB row when date_of_birth is null', async () => {
    setupFetch(mockReport({ patient: { id: 'p1', display_name: 'Alice Patient', date_of_birth: null } }));
    renderView();
    await waitFor(() => screen.getByText('Alice Patient'));
    // No year from a DOB should appear (beyond report date)
    expect(screen.queryByText(/Date of Birth/i)).toBeNull();
  });
});

// ── Gap 2: Thread reply composer ──────────────────────────────────────────────

describe('Gap 2 — Thread reply composer', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('reportx_session', JSON.stringify(clinicianSession()));
  });

  it('shows reply composer for full_report_with_threads scope', async () => {
    setupFetch(mockReport({
      view_scope: 'full_report_with_threads',
      findings: [],
      trends: [],
      threads: [
        {
          id: 't1',
          title: 'Discuss results',
          status: 'open',
          messages: [{ id: 'm1', author_user_id: 'p1', body: 'Question here', created_at: new Date().toISOString() }],
        },
      ],
    }));

    renderView();

    // Wait for the thread panel to load, then check for the reply textarea
    await waitFor(() => screen.getByText(/Discuss results/));
    expect(screen.getByRole('textbox', { name: /reply to discuss results/i })).toBeDefined();
  });

  it('does NOT show reply composer for full_report scope', async () => {
    setupFetch(mockReport({
      view_scope: 'full_report',
      findings: [],
      trends: [],
      threads: null,
    }));

    renderView();

    await waitFor(() => screen.getByText('Alice Patient'));
    expect(screen.queryByRole('textbox', { name: /reply/i })).toBeNull();
  });

  it('does NOT show reply composer for summary_only scope', async () => {
    setupFetch(mockReport({ view_scope: 'summary_only' }));
    renderView();
    await waitFor(() => screen.getByText(/results look normal/i));
    expect(screen.queryByRole('textbox', { name: /reply/i })).toBeNull();
  });

  it('reply button calls POST /threads/{id}/messages', async () => {
    setupFetch(mockReport({
      view_scope: 'full_report_with_threads',
      findings: [],
      trends: [],
      threads: [
        {
          id: 'thread-abc',
          title: 'Discussion',
          status: 'open',
          messages: [],
        },
      ],
    }));

    renderView();

    await waitFor(() => screen.getByText(/Discussion/));
    const textarea = screen.getByRole('textbox', { name: /reply to discussion/i }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'My reply to the patient.' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const threadCall = calls.find((c: unknown[]) => String(c[0]).includes('/threads/thread-abc/messages'));
      expect(threadCall).toBeDefined();
    });
  });
});

// ── Gap 3: SharingPreferencesPanel view_scope + include_doctor_summary ───────

describe('Gap 3 — SharingPreferencesPanel', () => {
  function renderPanel(props: Partial<Parameters<typeof SharingPreferencesPanel>[0]> = {}) {
    const defaults = {
      open: true,
      onClose: vi.fn(),
      onShare: vi.fn(),
      clinicianEmail: '',
      onClinicianEmailChange: vi.fn(),
      viewScope: 'summary_only' as const,
      onViewScopeChange: vi.fn(),
      includeDoctorSummary: false,
      onIncludeDoctorSummaryChange: vi.fn(),
      expiresAt: Date.now() + 86400000,
      onExpiresAtChange: vi.fn(),
    };
    return render(<SharingPreferencesPanel {...defaults} {...props} />);
  }

  it('renders three view_scope options', () => {
    renderPanel();
    expect(screen.getByRole('option', { name: 'Summary only' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Full report' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Full report + threads' })).toBeDefined();
  });

  it('renders include_doctor_summary checkbox', () => {
    renderPanel();
    expect(screen.getByRole('checkbox', { name: /doctor summary/i })).toBeDefined();
  });

  it('fires onViewScopeChange when scope is changed', () => {
    const handler = vi.fn();
    renderPanel({ onViewScopeChange: handler });
    const select = screen.getByLabelText(/access scope/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'full_report_with_threads' } });
    expect(handler).toHaveBeenCalled();
  });

  it('fires onIncludeDoctorSummaryChange when checkbox is toggled', () => {
    const handler = vi.fn();
    renderPanel({ onIncludeDoctorSummaryChange: handler });
    const checkbox = screen.getByRole('checkbox', { name: /doctor summary/i });
    fireEvent.click(checkbox);
    expect(handler).toHaveBeenCalled();
  });
});
