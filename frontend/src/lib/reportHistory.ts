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
  savedAt?: number;
  reportDate?: number;
  panelName?: string;
  title: string;
  rows: ParsedRow[];
  unparsed: string[];
  extractedText?: string;
  interpretation?: Interpretation;
  sharingPreferences?: SharingPreferences;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const warnedMissingReportDate = new Set<string>();

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

function fingerprintReport(entry: Pick<ReportHistoryEntry, 'title' | 'rows'> & Partial<Pick<ReportHistoryEntry, 'reportDate'>>): string {
  return JSON.stringify({
    title: (entry.title || '').trim().toLowerCase(),
    reportDate: toTimestamp(entry.reportDate) ?? null,
    rows: (entry.rows || []).map((row) => ({
      test_name: row.test_name,
      value: row.value,
      unit: row.unit ?? null,
      reference_range: row.reference_range ?? null,
      flag: row.flag ?? null,
    })),
  });
}

function mergeUniqueReports(primary: ReportHistoryEntry[], extras: ReportHistoryEntry[]): ReportHistoryEntry[] {
  const seen = new Set(primary.map(fingerprintReport));
  const merged = [...primary];
  for (const item of extras) {
    const key = fingerprintReport(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function overlayLocalFields(
  backendEntry: ReportHistoryEntry,
  localEntry?: ReportHistoryEntry,
): ReportHistoryEntry {
  if (!localEntry) return backendEntry;
  return {
    ...backendEntry,
    interpretation: localEntry.interpretation ?? backendEntry.interpretation,
    sharingPreferences: localEntry.sharingPreferences ?? backendEntry.sharingPreferences,
    extractedText: localEntry.extractedText ?? backendEntry.extractedText,
    unparsed: (localEntry.unparsed && localEntry.unparsed.length > 0) ? localEntry.unparsed : backendEntry.unparsed,
    savedAt: localEntry.savedAt ?? backendEntry.savedAt,
  };
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function isGenericReportTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const normalized = title.trim();
  if (!normalized) return true;
  return /^report\s+\d/i.test(normalized) || /\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(normalized);
}

function resolvePanelName(title: string | null | undefined, panelName?: string | null): string | null {
  const explicit = panelName?.trim();
  if (explicit) return explicit;
  const candidate = title?.trim();
  if (candidate && !isGenericReportTitle(candidate)) return candidate;
  return null;
}

export function resolveReportDate(entry: Pick<ReportHistoryEntry, 'id' | 'createdAt'> & Partial<Pick<ReportHistoryEntry, 'savedAt' | 'reportDate'>>): number {
  const explicit = toTimestamp(entry.reportDate);
  if (explicit !== null) return explicit;

  const fallback = toTimestamp(entry.savedAt) ?? toTimestamp(entry.createdAt) ?? Date.now();
  if (entry.id && !warnedMissingReportDate.has(entry.id)) {
    warnedMissingReportDate.add(entry.id);
    console.warn(`Report ${entry.id} is missing reportDate; falling back to savedAt/createdAt.`);
  }
  return fallback;
}

export function resolveReportPanelName(entry: Pick<ReportHistoryEntry, 'title'> & Partial<Pick<ReportHistoryEntry, 'panelName'>>): string | null {
  return resolvePanelName(entry.title, entry.panelName);
}

export async function fetchReportHistory(): Promise<ReportHistoryEntry[]> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('User is not authenticated.');
  }
  const userEmail = getSessionUserEmail();
  const localHistory = userEmail ? getReportHistoryForUser(userEmail) : [];
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/reports`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Unexpected response when fetching report history: ${response.status} ${errorText}`);
    }
    const data = await response.json();
    const backendHistory: ReportHistoryEntry[] = (data as any[]).map((report: any): ReportHistoryEntry => ({
      id: report.id,
      patientEmail: userEmail,
      title: report.title || 'Untitled Report',
      createdAt: new Date(report.created_at).getTime(),
      savedAt: new Date(report.created_at).getTime(),
      reportDate: new Date(report.observed_at).getTime(),
      panelName: resolvePanelName(report.title, report.panel_name) ?? undefined,
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
    const localById = new Map(localHistory.map((entry) => [entry.id, entry]));
    const hydratedBackendHistory = backendHistory.map((entry) => overlayLocalFields(entry, localById.get(entry.id)));
    const backendIds = new Set(hydratedBackendHistory.map((entry) => entry.id));
    const localOnlyHistory = localHistory.filter((entry) => !backendIds.has(entry.id));

    return mergeUniqueReports(hydratedBackendHistory, localOnlyHistory);
  } catch (err: any) {
    console.error('fetchReportHistory failed', err);
    if (localHistory.length > 0) {
      return localHistory;
    }
    throw new Error(err?.message || 'Failed to fetch report history');
  }
}

export async function createReportEntry(input: {
  title?: string | null;
  source_kind?: string;
  observed_at?: string;
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
        observed_at: input.observed_at,
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
    const createdAt = toTimestamp(report.created_at) ?? Date.now();
    const observedAt = toTimestamp(report.observed_at) ?? createdAt;

    return {
      id: report.id,
      patientEmail: userEmail,
      title: report.title || 'Untitled Report',
      createdAt,
      savedAt: createdAt,
      reportDate: observedAt,
      panelName: resolvePanelName(report.title, report.panel_name) ?? undefined,
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
    const createdAt = toTimestamp(report.created_at) ?? Date.now();
    const observedAt = toTimestamp(report.observed_at) ?? createdAt;
    const backendEntry: ReportHistoryEntry = {
      id: report.id,
      patientEmail: userEmail,
      title: report.title || 'Untitled Report',
      createdAt,
      savedAt: createdAt,
      reportDate: observedAt,
      panelName: resolvePanelName(report.title, report.panel_name) ?? undefined,
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
    return overlayLocalFields(backendEntry, getReportById(reportId));
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
    (row.flag === 'low' || row.flag === 'high' || row.flag === 'normal' || row.flag === 'abnormal' || row.flag === 'unknown' || row.flag === null || row.flag === undefined) &&
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
    savedAt: payload.savedAt ?? now,
    reportDate: payload.reportDate ?? now,
    panelName: payload.panelName ?? undefined,
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
