import { describe, it, expect, beforeEach } from 'vitest';
import { addReportToHistory, getReportHistoryForUser, updateReportInHistory, clearReportHistory } from './reportHistory';

describe('reportHistory utility', () => {
  beforeEach(() => {
    clearReportHistory();
    localStorage.clear();
  });

  it('returns empty array for new user', () => {
    expect(getReportHistoryForUser('alice@example.com')).toEqual([]);
  });

  it('stores and loads reports by patient email only', () => {
    const reportA = addReportToHistory({
      patientEmail: 'alice@example.com',
      title: 'CBC 2026-03-29',
      rows: [],
      unparsed: [],
    });
    addReportToHistory({
      patientEmail: 'bob@example.com',
      title: 'Blood Sugar 2026-03-29',
      rows: [],
      unparsed: [],
    });

    const aliceReports = getReportHistoryForUser('alice@example.com');
    expect(aliceReports).toHaveLength(1);
    expect(aliceReports[0].id).toBe(reportA.id);
    expect(aliceReports[0].patientEmail).toBe('alice@example.com');

    const bobReports = getReportHistoryForUser('bob@example.com');
    expect(bobReports).toHaveLength(1);
    expect(bobReports[0].patientEmail).toBe('bob@example.com');
  });

  it('updates a report by id', () => {
    const report = addReportToHistory({
      patientEmail: 'alice@example.com',
      title: 'Cholesterol',
      rows: [],
      unparsed: [],
    });

    const updated = updateReportInHistory(report.id, {
      sharingPreferences: {
        clinicianEmail: 'clinician@health.org',
        scope: 'summary',
        expiresAt: Date.now() + 86400000,
        active: true,
      },
    });

    expect(updated).toBe(true);
    const aliceReports = getReportHistoryForUser('alice@example.com');
    expect(aliceReports[0].sharingPreferences?.clinicianEmail).toBe('clinician@health.org');
  });
});