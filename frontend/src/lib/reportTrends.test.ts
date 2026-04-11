import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchReportTrends } from './reportTrends';

describe('reportTrends helper', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('throws when user is not authenticated', async () => {
    await expect(fetchReportTrends('report-1')).rejects.toThrow('User is not authenticated.');
  });

  it('calls trends endpoint with bearer token and returns payload', async () => {
    localStorage.setItem('reportx_session', JSON.stringify({ accessToken: 'token-123' }));
    const payload = {
      report_id: 'report-1',
      subject_user_id: 'user-1',
      trends: [
        {
          biomarker_key: 'hemoglobin',
          display_name: 'Hemoglobin',
          unit: 'g/dL',
          direction: 'improving',
          trend_note: 'Hemoglobin trend appears to be improving compared with prior reports.',
          sparkline: [
            {
              report_id: 'report-0',
              observed_at: '2026-04-01T00:00:00Z',
              value: 16.2,
              unit: 'g/dL',
              flag: 'high',
            },
          ],
        },
      ],
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await fetchReportTrends('report-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/reports/report-1/trends',
      { headers: { Authorization: 'Bearer token-123' } },
    );
    expect(result).toEqual(payload);
  });

  it('throws readable error when backend returns non-2xx', async () => {
    localStorage.setItem('reportx_session', JSON.stringify({ accessToken: 'token-123' }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Forbidden', {
        status: 403,
      }),
    );

    await expect(fetchReportTrends('report-1')).rejects.toThrow(
      'Unexpected response when fetching report trends: 403 Forbidden',
    );
  });
});
