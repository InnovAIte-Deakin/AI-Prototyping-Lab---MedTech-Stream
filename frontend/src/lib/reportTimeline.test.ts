import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildBiomarkerTimeline, parseReferenceRange } from './reportTimeline';

describe('reportTimeline helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses common reference range strings', () => {
    expect(parseReferenceRange('11-15')).toEqual({ low: 11, high: 15 });
    expect(parseReferenceRange('<=200')).toEqual({ low: null, high: 200 });
    expect(parseReferenceRange('>=5')).toEqual({ low: 5, high: null });
  });

  it('builds a multi-series timeline with aligned report dates', () => {
    const reports = [
      {
        id: 'r1',
        patientEmail: 'patient@example.com',
        createdAt: new Date('2025-01-15T00:00:00Z').getTime(),
        savedAt: new Date('2025-01-15T00:00:00Z').getTime(),
        reportDate: new Date('2025-01-15T00:00:00Z').getTime(),
        title: 'LFT',
        rows: [
          { test_name: 'ALT', value: 29, unit: 'U/L', reference_range: '11-15', flag: 'normal', confidence: 1 },
          { test_name: 'AST', value: 28, unit: 'U/L', reference_range: '10-40', flag: 'normal', confidence: 1 },
        ],
        unparsed: [],
      },
      {
        id: 'r2',
        patientEmail: 'patient@example.com',
        createdAt: new Date('2025-04-15T00:00:00Z').getTime(),
        savedAt: new Date('2025-04-15T00:00:00Z').getTime(),
        reportDate: new Date('2025-04-15T00:00:00Z').getTime(),
        title: 'LFT',
        rows: [
          { test_name: 'ALT', value: 58, unit: 'U/L', reference_range: '11-15', flag: 'high', confidence: 1 },
        ],
        unparsed: [],
      },
    ] as any;

    const result = buildBiomarkerTimeline(reports);

    expect(result.reportDates).toEqual([
      new Date('2025-01-15T00:00:00Z').getTime(),
      new Date('2025-04-15T00:00:00Z').getTime(),
    ]);
    expect(result.series).toHaveLength(2);
    const altSeries = result.series.find((item) => item.displayName === 'ALT');
    expect(altSeries?.points).toHaveLength(2);
    expect(altSeries?.points[1].y).toBe(58);
    expect(result.reports[0].displayTitle).toContain('LFT');
    expect(result.reports[0].displayTitle).toContain('2025');
  });

  it('falls back to savedAt and warns when reportDate is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const savedAt = new Date('2024-06-01T00:00:00Z').getTime();
    const reports = [
      {
        id: 'r1',
        patientEmail: 'patient@example.com',
        createdAt: savedAt,
        savedAt,
        title: 'CBC',
        rows: [{ test_name: 'Hgb', value: 12, unit: 'g/dL', reference_range: '11-15', flag: 'normal', confidence: 1 }],
        unparsed: [],
      },
      {
        id: 'r2',
        patientEmail: 'patient@example.com',
        createdAt: new Date('2024-07-01T00:00:00Z').getTime(),
        savedAt: new Date('2024-07-01T00:00:00Z').getTime(),
        reportDate: new Date('2024-07-01T00:00:00Z').getTime(),
        title: 'CBC',
        rows: [{ test_name: 'Hgb', value: 13, unit: 'g/dL', reference_range: '11-15', flag: 'normal', confidence: 1 }],
        unparsed: [],
      },
    ] as any;

    const result = buildBiomarkerTimeline(reports);

    expect(result.reportDates[0]).toBe(savedAt);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing reportDate'));
  });

  it('excludes date-like rows even when they are numeric', () => {
    const reports = [
      {
        id: 'r1',
        patientEmail: 'patient@example.com',
        createdAt: new Date('2025-01-15T00:00:00Z').getTime(),
        reportDate: new Date('2025-01-15T00:00:00Z').getTime(),
        title: 'Panel A',
        rows: [
          { test_name: 'Report Date', value: 20250115, unit: null, reference_range: null, flag: 'normal', confidence: 1 },
          { test_name: 'ALT', value: 32, unit: 'U/L', reference_range: '10-40', flag: 'normal', confidence: 1 },
        ],
        unparsed: [],
      },
      {
        id: 'r2',
        patientEmail: 'patient@example.com',
        createdAt: new Date('2025-02-15T00:00:00Z').getTime(),
        reportDate: new Date('2025-02-15T00:00:00Z').getTime(),
        title: 'Panel B',
        rows: [
          { test_name: 'Report Date', value: 20250215, unit: null, reference_range: null, flag: 'normal', confidence: 1 },
          { test_name: 'ALT', value: 34, unit: 'U/L', reference_range: '10-40', flag: 'normal', confidence: 1 },
        ],
        unparsed: [],
      },
    ] as any;

    const result = buildBiomarkerTimeline(reports);

    expect(result.series.map((item) => item.displayName)).toEqual(['ALT']);
  });
});
