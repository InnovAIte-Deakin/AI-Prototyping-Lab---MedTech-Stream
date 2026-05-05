import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import ReportDetailPage from '../page';
import { AuthProvider } from '@/store/authStore';
import { clearReportHistory } from '@/lib/reportHistory';

function setupAuth() {
  localStorage.setItem('reportx_session', JSON.stringify({
    user: { id: '1', email: 'patient@example.com', role: 'patient', displayName: 'Jonathan Miller' },
    accessToken: 'access-token',
    accessTokenExpiresAt: Date.now() + 100000,
    refreshToken: 'refresh-token',
    refreshTokenExpiresAt: Date.now() + 1000000,
  }));
}

function mockDetailApi(threads: Array<{ id: string; report_id: string; title: string | null; status: string; messages: any[] }> = []) {
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
      return new Response(JSON.stringify(threads), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
          title: 'Comprehensive Metabolic Panel',
          source_kind: 'text',
          sharing_mode: 'private',
          observed_at: '2024-10-24T00:00:00Z',
          findings: [],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(null, { status: 404 });
  });
}

describe('Notification deep links', () => {
  beforeEach(() => {
    localStorage.clear();
    clearReportHistory();
    setupAuth();
    mockDetailApi();
  });

  afterEach(() => {
    global.fetch = vi.fn();
  });

  it('opens the sharing panel when panel=sharing is in the URL', async () => {
    const Component = ReportDetailPage as React.ComponentType<any>;
    render(
      <AuthProvider>
        <Component params={{ reportId: 'report-1' }} searchParams={{ panel: 'sharing' }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: /sharing preferences/i })).toBeInTheDocument();
    });
  });

  it('focuses the matching thread when threadId is in the URL', async () => {
    mockDetailApi([
      {
        id: 'thread-1',
        report_id: 'report-1',
        title: 'Question about glucose',
        status: 'open',
        messages: [],
      },
    ]);

    const Component = ReportDetailPage as React.ComponentType<any>;
    render(
      <AuthProvider>
        <Component params={{ reportId: 'report-1' }} searchParams={{ threadId: 'thread-1' }} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('thread-card-thread-1')).toHaveAttribute('data-focused', 'true');
    });
  });
});
