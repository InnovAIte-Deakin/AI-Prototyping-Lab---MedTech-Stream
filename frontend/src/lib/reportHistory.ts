import { ParsedRow } from '@/types/ui';

export type SharingPreferences = {
  clinicianEmail: string;
  scope: 'summary' | 'full';
  expiresAt: number;
  active: boolean;
};

export type Interpretation = {
  summary: string;
  per_test: { test_name: string; explanation: string }[];
  flags: { test_name: string; severity: string; note: string }[];
  next_steps: string[];
  disclaimer: string;
  translations?: Record<string, string>;
};

export type ReportHistoryEntry = {
  id: string;
  patientEmail: string;
  createdAt: number;
  title: string;
  rows: ParsedRow[];
  unparsed: string[];
  extractedText?: string;
  interpretation?: Interpretation;
  sharingPreferences?: SharingPreferences;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function safeLocalStorageGet(key: string): string | null {
  if (!isBrowser) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getStoredSession(): { accessToken?: string; user?: { email?: string } } | null {
  const raw = safeLocalStorageGet('reportx_session');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getAuthToken(): string | null {
  return getStoredSession()?.accessToken ?? null;
}

function getSessionUserEmail(): string {
  return getStoredSession()?.user?.email || '';
}

export async function fetchReportHistory(): Promise<ReportHistoryEntry[]> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('User is not authenticated.');
  }
  const userEmail = getSessionUserEmail();
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/reports`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Unexpected response when fetching report history: ${response.status} ${errorText}`);
    }
    const data = await response.json();
    return data.map((report: any) => ({
      id: report.id,
      patientEmail: userEmail,
      title: report.title || 'Untitled Report',
      createdAt: new Date(report.observed_at).getTime(),
      rows: report.findings.map((f: any) => ({
        test_name: f.display_name,
        value: f.value_numeric ?? f.value_text ?? '',
        unit: f.unit,
        reference_range: f.reference_range_text,
        flag: (f.flag as any) ?? 'normal',
        confidence: 1,
      })),
      unparsed: [],
    }));
  } catch (err: any) {
    console.error('fetchReportHistory failed', err);
    throw new Error(err?.message || 'Failed to fetch report history');
  }
}

export async function createReportEntry(input: {
  title?: string | null;
  source_kind?: string;
  findings: Array<{ test_name: string; value_numeric?: number | null; value_text?: string | null; unit?: string | null; reference_range?: string | null; flag?: string | null }>; 
}): Promise<ReportHistoryEntry | null> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('User is not authenticated.');
  }
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: input.title,
        source_kind: input.source_kind || 'manual',
        findings: input.findings.map((f) => ({
          test_name: f.test_name,
          value_numeric: f.value_numeric,
          value_text: f.value_text,
          unit: f.unit,
          reference_range: f.reference_range,
          flag: f.flag,
        })),
      }),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Unexpected response when creating report entry: ${response.status} ${errorText}`);
    }
    const report = await response.json();
    const userEmail = getSessionUserEmail();

    return {
      id: report.id,
      patientEmail: userEmail,
      title: report.title || 'Untitled Report',
      createdAt: new Date(report.observed_at).getTime(),
      rows: input.findings.map((f) => ({
        test_name: f.test_name,
        value: f.value_numeric ?? f.value_text ?? '',
        unit: f.unit,
        reference_range: f.reference_range,
        flag: (f.flag as any) ?? 'normal',
        confidence: 1,
      })),
      unparsed: [],
    };
  } catch (err: any) {
    console.error('createReportEntry failed', err);
    throw new Error(err?.message || 'Failed to create report entry');
  }
}

export async function fetchReportById(reportId: string): Promise<ReportHistoryEntry | undefined> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('User is not authenticated.');
  }
  const userEmail = getSessionUserEmail();

  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/reports/${reportId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Unexpected response when fetching report by id: ${response.status} ${errorText}`);
    }
    const result = await response.json();
    const report = result.report;
    return {
      id: report.id,
      patientEmail: userEmail,
      title: report.title || 'Untitled Report',
      createdAt: new Date(report.observed_at).getTime(),
      rows: report.findings.map((f: any) => ({
        test_name: f.display_name,
        value: f.value_numeric ?? f.value_text ?? '',
        unit: f.unit,
        reference_range: f.reference_range_text,
        flag: (f.flag as any) ?? 'normal',
        confidence: 1,
      })),
      unparsed: [],
    };
  } catch (err: any) {
    console.error('fetchReportById failed', err);
    throw new Error(err?.message || 'Failed to fetch report detail');
  }
}

/**
 * Security note: medical report data is PHI and must not be persisted to durable storage.
 * Use in-memory caching only, forcibly clear on browser refresh/close.
 */
let inMemoryReportHistory: ReportHistoryEntry[] = [];

function loadAll(): ReportHistoryEntry[] {
  return inMemoryReportHistory;
}

function saveAll(items: ReportHistoryEntry[]) {
  inMemoryReportHistory = items;
}

export function clearReportHistory() {
  inMemoryReportHistory = [];
}

export function getReportHistoryForUser(patientEmail: string): ReportHistoryEntry[] {
  return loadAll().filter((item) => item.patientEmail === patientEmail).sort((a, b) => b.createdAt - a.createdAt);
}

export function isParsedRow(row: any): row is ParsedRow {
  return (
    row &&
    typeof row.test_name === 'string' &&
    (typeof row.value === 'string' || typeof row.value === 'number') &&
    (typeof row.unit === 'string' || row.unit === null || row.unit === undefined) &&
    (typeof row.reference_range === 'string' || row.reference_range === null || row.reference_range === undefined) &&
    (row.flag === 'low' || row.flag === 'high' || row.flag === 'normal' || row.flag === 'abnormal' || row.flag === null || row.flag === undefined) &&
    typeof row.confidence === 'number'
  );
}

export function ensureParsedRowArray(rows: any): ParsedRow[] {
  if (!Array.isArray(rows)) {
    throw new Error('rows must be an array');
  }
  const validated: ParsedRow[] = rows.filter(isParsedRow);
  if (validated.length !== rows.length) {
    throw new Error('rows contained invalid items');
  }
  return validated;
}

export function addReportToHistory(payload: Omit<ReportHistoryEntry, 'id' | 'createdAt'>): ReportHistoryEntry {
  const existing = loadAll();
  const now = Date.now();

  if (!payload.patientEmail || !payload.title || !Array.isArray(payload.rows)) {
    throw new Error('Invalid report payload, missing required fields');
  }

  const rows = payload.rows && payload.rows.length > 0 ? ensureParsedRowArray(payload.rows) : [];

  const entry: ReportHistoryEntry = {
    ...payload,
    rows,
    unparsed: Array.isArray(payload.unparsed) ? payload.unparsed : [],
    id: `${payload.patientEmail}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
  };
  saveAll([entry, ...existing]);
  return entry;
}

export function updateReportInHistory(reportId: string, patch: Partial<ReportHistoryEntry>): boolean {
  const existing = loadAll();
  const idx = existing.findIndex((entry) => entry.id === reportId);
  if (idx === -1) return false;
  existing[idx] = { ...existing[idx], ...patch };
  saveAll(existing);
  return true;
}

export function getReportById(reportId: string): ReportHistoryEntry | undefined {
  return loadAll().find((item) => item.id === reportId);
}
