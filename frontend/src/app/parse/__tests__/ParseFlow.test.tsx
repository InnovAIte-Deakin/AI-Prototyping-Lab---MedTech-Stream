import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ParsePage from '../page';

const sampleRows = [
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
    // Mock fetch for /parse, /interpret, and /translate
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
        const bodyRaw = (init && (init as any).body) as string;
        let payload: any = {};
        try { payload = JSON.parse(bodyRaw || '{}'); } catch {}
        if (payload.target_language !== 'es') {
          return new Response(
            JSON.stringify({ detail: 'Bad target language' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ translation: 'Resumen en español.', language: 'es', meta: { ok: true } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Unexpected URL: ' + url);
    }) as any;
  });

  afterEach(() => {
    global.fetch = origFetch as any;
  });

  it('parses text, shows interpretation and supports translation', async () => {
    render(<ParsePage />);

    // Enter some text and submit form
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hemoglobin 13.5 g/dL (11-15)' } });
    const parseBtn = screen.getByRole('button', { name: /parse/i });
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
});
