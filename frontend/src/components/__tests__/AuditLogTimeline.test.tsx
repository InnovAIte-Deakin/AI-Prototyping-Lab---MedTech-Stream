import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditLogTimeline } from '../AuditLogTimeline';

const SAMPLE_EVENTS = [
  {
    event_id: 'b',
    action: 'revoked',
    occurred_at: '2026-04-18T12:05:00Z',
    context: { grantee_email: 'doc@example.com', scope: 'report', access_level: 'read' },
  },
  {
    event_id: 'a',
    action: 'created',
    occurred_at: '2026-04-18T12:00:00Z',
    context: { grantee_email: 'doc@example.com', scope: 'report', access_level: 'read' },
  },
];

function storeSession() {
  window.localStorage.setItem(
    'reportx_session',
    JSON.stringify({ accessToken: 'test-token' }),
  );
}

describe('AuditLogTimeline', () => {
  beforeEach(() => {
    storeSession();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => SAMPLE_EVENTS,
        text: async () => JSON.stringify(SAMPLE_EVENTS),
      })),
    );
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders events in chronological order (oldest first)', async () => {
    render(<AuditLogTimeline reportId="report-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('audit-log-timeline')).toBeInTheDocument();
      expect(screen.getByText(/Share created/i)).toBeInTheDocument();
    });

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/Share created/i);
    expect(items[1]).toHaveTextContent(/Share revoked/i);
  });

  it('renders distinct styling for revoked events', async () => {
    render(<AuditLogTimeline reportId="report-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('audit-event-revoked')).toBeInTheDocument();
    });
    expect(screen.getByTestId('audit-event-created')).toBeInTheDocument();
  });

  it('surfaces an error message when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'boom',
      })),
    );

    render(<AuditLogTimeline reportId="report-1" />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/audit log request failed/i);
    });
  });

  it('shows an empty-state message when there are no events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => '[]',
      })),
    );

    render(<AuditLogTimeline reportId="report-1" />);
    await waitFor(() => {
      expect(screen.getByText(/no sharing activity/i)).toBeInTheDocument();
    });
  });
});
