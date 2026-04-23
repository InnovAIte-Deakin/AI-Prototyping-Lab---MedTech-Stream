import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ParsePage from '../page';
import { AuthProvider } from '@/store/authStore';
import * as reportHistory from '@/lib/reportHistory';

import type { ParsedRow } from '@/types/ui';

const sampleRows: ParsedRow[] = [
  {
    test_name: 'Hemoglobin',
    value: 13.5,
    unit: 'g/dL',
    reference_range: '11.0-15.0',
    flag: 'normal',
    confidence: 1.0,
  },
];

describe('Parse + Interpret flow', () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    // Mock fetch for /parse and /interpret
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/parse')) {
        return new Response(
          JSON.stringify({ rows: sampleRows, unparsed_lines: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/v1/interpret')) {
        return new Response(
          JSON.stringify({
            interpretation: {
              summary: 'Parsed 1 tests.',
              per_test: [],
              flags: [],
              next_steps: ['See your doctor.'],
              disclaimer: 'Educational only.',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/v1/translate')) {
        return new Response(
          JSON.stringify({
            language: 'es',
            translation: 'Resumen en español.',
            translations: {
              es: 'Resumen en español.',
              ar: 'ملخص باللغة العربية.',
              zh: '中文总结。',
              hi: 'हिंदी सारांश।',
              fr: 'Résumé en français.',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Unexpected URL: ' + url);
    }) as any;
  });

  afterEach(() => {
    global.fetch = origFetch as any;
    localStorage.removeItem('reportx_session');
  });

  it('works for anonymous users and does not require login', async () => {
    // No session set, page should still render with the parsing form.
    render(
      <AuthProvider>
        <ParsePage />
      </AuthProvider>
    );

    expect(screen.getByText('Understand Your Lab Report')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review report/i })).toBeInTheDocument();
  });

  it('parses text, shows interpretation and supports translation', async () => {
    localStorage.setItem('reportx_session', JSON.stringify({
      user: { id: '1', email: 'a@b.com', role: 'patient', displayName: 'A' },
      accessToken: 'access-token',
      accessTokenExpiresAt: Date.now() + 100000,
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: Date.now() + 1000000,
    }));
    render(
      <AuthProvider>
        <ParsePage />
      </AuthProvider>
    );

    // Enter some text and submit form
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hemoglobin 13.5 g/dL (11-15)' } });
    const parseBtn = screen.getByRole('button', { name: /review/i });
    // Submit via form to trigger onSubmit reliably
    fireEvent.submit(parseBtn.closest('form') as HTMLFormElement);

    // A table cell with Hemoglobin should appear
    await screen.findByText('Hemoglobin');

    // Click Explain and then expect summary to render
    fireEvent.click(screen.getByRole('button', { name: /explain/i }));
    await waitFor(() => {
      expect(screen.getByText(/Parsed 1 tests\./i)).toBeInTheDocument();
    });

    // Change the translate dropdown to Español and wait for translation
    const select = screen.getByLabelText(/translate summary/i);
    fireEvent.change(select, { target: { value: 'es' } });
    await waitFor(() => {
      expect(screen.getByText(/Resumen en español\./i)).toBeInTheDocument();
    });
  });

  it('invokes updateReportInHistory after explain', async () => {
    const createReportSpy = vi
      .spyOn(reportHistory, 'createReportEntry')
      .mockResolvedValue({
        id: 'r1',
        patientEmail: 'a@b.com',
        title: 'Report 1',
        createdAt: Date.now(),
        rows: sampleRows,
        unparsed: [],
        interpretation: undefined,
      });
    const updateReportSpy = vi
      .spyOn(reportHistory, 'updateReportInHistory')
      .mockReturnValue(true);

    localStorage.setItem('reportx_session', JSON.stringify({
      user: { id: '1', email: 'a@b.com', role: 'patient', displayName: 'A' },
      accessToken: 'access-token',
      accessTokenExpiresAt: Date.now() + 100000,
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: Date.now() + 1000000,
    }));

    render(
      <AuthProvider>
        <ParsePage />
      </AuthProvider>
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hemoglobin 13.5 g/dL (11-15)' } });

    const parseBtn = screen.getByRole('button', { name: /review/i });
    fireEvent.submit(parseBtn.closest('form') as HTMLFormElement);

    // Wait for parse result rendering
    await screen.findByText('Hemoglobin');

    fireEvent.click(screen.getByRole('button', { name: /explain/i }));
    await waitFor(() => expect(screen.getByText(/Parsed 1 tests\./i)).toBeInTheDocument());

    expect(createReportSpy).toHaveBeenCalled();
    expect(updateReportSpy).toHaveBeenCalledWith('r1', { interpretation: expect.any(Object) });

    createReportSpy.mockRestore();
    updateReportSpy.mockRestore();
  });

  it('keeps the parsed result visible when report persistence fails', async () => {
    const createReportSpy = vi
      .spyOn(reportHistory, 'createReportEntry')
      .mockRejectedValue(new Error('Failed to fetch'));

    localStorage.setItem('reportx_session', JSON.stringify({
      user: { id: '1', email: 'a@b.com', role: 'patient', displayName: 'A' },
      accessToken: 'access-token',
      accessTokenExpiresAt: Date.now() + 100000,
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: Date.now() + 1000000,
    }));

    render(
      <AuthProvider>
        <ParsePage />
      </AuthProvider>
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hemoglobin 13.5 g/dL (11-15)' } });

    const parseBtn = screen.getByRole('button', { name: /review/i });
    fireEvent.submit(parseBtn.closest('form') as HTMLFormElement);

    await screen.findByText('Hemoglobin');

    await waitFor(() => {
      expect(screen.queryByText(/We ran into a hiccup/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Saved locally only\./i)).toBeInTheDocument();
    expect(screen.getByText(/could not save it to My Reports/i)).toBeInTheDocument();

    expect(createReportSpy).toHaveBeenCalled();
    createReportSpy.mockRestore();
  });
});
