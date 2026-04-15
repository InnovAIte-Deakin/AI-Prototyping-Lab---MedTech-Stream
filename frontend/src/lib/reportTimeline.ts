import type { ParsedRow } from '@/types/ui';
import type { ReportHistoryEntry } from './reportHistory';
import { resolveReportDate, resolveReportPanelName } from './reportHistory';

const PALETTE = ['#0d9488', '#f59e0b', '#6366f1', '#ec4899', '#10b981', '#f97316', '#8b5cf6', '#ef4444'];

export type TimelinePoint = {
  x: number;
  y: number | null;
  reportId: string;
  reportDate: number;
  unit: string | null;
  flag: ParsedRow['flag'];
  referenceRangeText: string | null;
  reportLabel: string;
};

export type TimelineSeries = {
  biomarkerKey: string;
  displayName: string;
  unit: string | null;
  color: string;
  points: TimelinePoint[];
  referenceRangeText: string | null;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
};

export type TimelineReportCard = {
  id: string;
  title: string;
  displayTitle: string;
  reportDate: number;
  reportDateLabel: string;
  accentColor: string;
  testCount: number;
  hasInterpretation: boolean;
};

function formatReportDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

const NON_QUANT_MARKER_NAME = /\b(date|dob|time|collected|collection|reported|specimen|sample\s*date|accession|patient\s*id|mrn)\b/i;

function isNumericBiomarkerRow(row: ParsedRow): boolean {
  if (typeof row.value !== 'number' || !Number.isFinite(row.value)) return false;
  if (NON_QUANT_MARKER_NAME.test(row.test_name || '')) return false;
  return true;
}

export function parseReferenceRange(referenceRange?: string | null): { low: number | null; high: number | null } {
  if (!referenceRange) return { low: null, high: null };

  const text = referenceRange.trim();
  if (!text) return { low: null, high: null };

  const rangeMatch = text.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    return { low: Number(rangeMatch[1]), high: Number(rangeMatch[2]) };
  }

  const lessThanMatch = text.match(/<=?\s*(-?\d+(?:\.\d+)?)/);
  if (lessThanMatch) {
    return { low: null, high: Number(lessThanMatch[1]) };
  }

  const greaterThanMatch = text.match(/>=?\s*(-?\d+(?:\.\d+)?)/);
  if (greaterThanMatch) {
    return { low: Number(greaterThanMatch[1]), high: null };
  }

  return { low: null, high: null };
}

export function buildBiomarkerTimeline(reports: ReportHistoryEntry[]): {
  reports: TimelineReportCard[];
  series: TimelineSeries[];
  reportDates: number[];
} {
  const sortedReports = [...reports].sort((a, b) => resolveReportDate(a) - resolveReportDate(b));
  const reportDates = sortedReports.map((report) => resolveReportDate(report));

  const biomarkerMap = new Map<string, {
    biomarkerKey: string;
    displayName: string;
    unit: string | null;
    pointsByReportId: Map<string, TimelinePoint>;
    referenceRangeText: string | null;
    referenceRangeLow: number | null;
    referenceRangeHigh: number | null;
  }>();

  sortedReports.forEach((report, reportIndex) => {
    const reportDate = resolveReportDate(report);
    const reportDisplayLabel = formatReportDate(reportDate);

    const numericRows = report.rows.filter(isNumericBiomarkerRow);
    numericRows.forEach((row) => {
      const biomarkerKey = normalizeKey(row.test_name);
      const existing = biomarkerMap.get(biomarkerKey);
      const referenceRangeText = row.reference_range ?? null;
      const parsedRange = parseReferenceRange(referenceRangeText);
      const point: TimelinePoint = {
        x: reportDate,
        y: typeof row.value === 'number' ? row.value : null,
        reportId: report.id,
        reportDate,
        unit: row.unit ?? null,
        flag: row.flag ?? null,
        referenceRangeText,
        reportLabel: report.title || reportDisplayLabel,
      };

      if (existing) {
        existing.pointsByReportId.set(report.id, point);
        if (!existing.referenceRangeText && referenceRangeText) {
          existing.referenceRangeText = referenceRangeText;
          existing.referenceRangeLow = parsedRange.low;
          existing.referenceRangeHigh = parsedRange.high;
        }
        if (!existing.unit && point.unit) {
          existing.unit = point.unit;
        }
        return;
      }

      biomarkerMap.set(biomarkerKey, {
        biomarkerKey,
        displayName: row.test_name,
        unit: row.unit ?? null,
        pointsByReportId: new Map([[report.id, point]]),
        referenceRangeText,
        referenceRangeLow: parsedRange.low,
        referenceRangeHigh: parsedRange.high,
      });
    });

  });

  const series = Array.from(biomarkerMap.values())
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((item, index) => ({
      biomarkerKey: item.biomarkerKey,
      displayName: item.displayName,
      unit: item.unit,
      color: PALETTE[index % PALETTE.length],
      points: sortedReports.map((report) => {
        const reportDate = resolveReportDate(report);
        const point = item.pointsByReportId.get(report.id);
        if (point) {
          return point;
        }
        return {
          x: reportDate,
          y: null,
          reportId: report.id,
          reportDate,
          unit: item.unit,
          flag: null,
          referenceRangeText: null,
          reportLabel: report.title || formatReportDate(reportDate),
        };
      }),
      referenceRangeText: item.referenceRangeText,
      referenceRangeLow: item.referenceRangeLow,
      referenceRangeHigh: item.referenceRangeHigh,
    }));

  const reportCards: TimelineReportCard[] = sortedReports.map((report, index) => {
    const reportDate = resolveReportDate(report);
    const reportDisplayDate = formatReportDate(reportDate);
    const panelName = resolveReportPanelName(report);
    const title = panelName ? `${panelName} — ${reportDisplayDate}` : reportDisplayDate;
    const firstNumericRow = report.rows.find(isNumericBiomarkerRow);
    const seriesIndex = firstNumericRow ? series.findIndex((item) => normalizeKey(item.displayName) === normalizeKey(firstNumericRow.test_name)) : -1;
    const accentColor = seriesIndex >= 0 ? series[seriesIndex].color : PALETTE[index % PALETTE.length];

    return {
      id: report.id,
      title: report.title,
      displayTitle: title,
      reportDate,
      reportDateLabel: reportDisplayDate,
      accentColor,
      testCount: report.rows.length,
      hasInterpretation: Boolean(report.interpretation),
    };
  });

  return {
    reports: reportCards,
    series,
    reportDates,
  };
}
