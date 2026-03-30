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

export function addReportToHistory(payload: Omit<ReportHistoryEntry, 'id' | 'createdAt'>): ReportHistoryEntry {
  const existing = loadAll();
  const now = Date.now();
  const entry: ReportHistoryEntry = {
    ...payload,
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
