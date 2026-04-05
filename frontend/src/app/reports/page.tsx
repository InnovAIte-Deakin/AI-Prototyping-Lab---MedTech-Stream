'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedView } from '@/components/ProtectedView';
import { useAuth } from '@/store/authStore';
import { fetchReportHistory } from '@/lib/reportHistory';
import type { ReportHistoryEntry, SharingPreferences } from '@/lib/reportHistory';
import { BiomarkerTimelineChart } from '@/components/BiomarkerTimelineChart';
import { buildBiomarkerTimeline } from '@/lib/reportTimeline';
import { resolveReportDate } from '@/lib/reportHistory';

type SortDirection = 'desc' | 'asc';

function formatReportDate(ts: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts));
}

function resolvePanelShortName(entry: ReportHistoryEntry): string | null {
  const explicit = entry.panelName?.trim();
  if (explicit) return explicit;

  const fromTitle = entry.title?.match(/\b(LFT|KFT|FBC|CBC|BMP|CMP|LIPID|TFT)\b/i)?.[1];
  if (fromTitle) return fromTitle.toUpperCase();

  return null;
}

function hasActualReportDate(entry: ReportHistoryEntry): boolean {
  return typeof entry.reportDate === 'number' && Number.isFinite(entry.reportDate);
}

function uploadDate(entry: ReportHistoryEntry): number {
  if (typeof entry.savedAt === 'number' && Number.isFinite(entry.savedAt)) return entry.savedAt;
  return entry.createdAt;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [reportHistory, setReportHistory] = useState<ReportHistoryEntry[]>([]);
  const [editingSharingId, setEditingSharingId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SharingPreferences>({ clinicianEmail: '', scope: 'summary', expiresAt: Date.now() + 86400000, active: false });
  const [statusMessage, setStatusMessage] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  const fetchReports = useCallback(async () => {
    if (!user) return;

    try {
      const data = await fetchReportHistory();
      setReportHistory([...data].sort((a, b) => resolveReportDate(b) - resolveReportDate(a)));

      setLoadError(null);
      setStatusMessage('');
    } catch (err: any) {
      console.error('fetchReports failed', err);
      setReportHistory([]);
      setLoadError(err?.message || 'Failed to load report history.');
      setStatusMessage('');
    }
  }, [user]);

  const timeline = useMemo(() => buildBiomarkerTimeline(reportHistory), [reportHistory]);
  const reportCards = useMemo(() => [...timeline.reports].sort((a, b) => b.reportDate - a.reportDate), [timeline.reports]);
  const reportCardById = useMemo(() => new Map(reportCards.map((item) => [item.id, item])), [reportCards]);
  const reportById = useMemo(() => new Map(reportHistory.map((entry) => [entry.id, entry])), [reportHistory]);

  const rows = useMemo(() => {
    const items = reportHistory
      .map((entry) => {
        const card = reportCardById.get(entry.id);
        if (!card) return null;

        const actualDateAvailable = hasActualReportDate(entry);
        const dateValue = actualDateAvailable ? (entry.reportDate as number) : uploadDate(entry);
        return {
          entry,
          card,
          panelName: resolvePanelShortName(entry),
          actualDateAvailable,
          displayDate: formatReportDate(dateValue),
          sortDate: dateValue,
        };
      })
      .filter(Boolean) as Array<{
      entry: ReportHistoryEntry;
      card: (typeof reportCards)[number];
      panelName: string | null;
      actualDateAvailable: boolean;
      displayDate: string;
      sortDate: number;
    }>;

    items.sort((a, b) => (sortDirection === 'desc' ? b.sortDate - a.sortDate : a.sortDate - b.sortDate));
    return items;
  }, [reportHistory, reportCardById, sortDirection]);

  const reportCountLabel = `${rows.length} report${rows.length === 1 ? '' : 's'} on file`;

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  function beginSharing(entry: ReportHistoryEntry) {
    setEditingSharingId(entry.id);
    setSheet({
      clinicianEmail: entry.sharingPreferences?.clinicianEmail || '',
      scope: entry.sharingPreferences?.scope || 'summary',
      expiresAt: entry.sharingPreferences?.expiresAt || Date.now() + 86400000,
      active: entry.sharingPreferences?.active ?? false,
    });
    setStatusMessage('');
  }

  async function saveSharing() {
    if (!editingSharingId || !user) return;

    const tokenText = localStorage.getItem('reportx_session');
    const token = tokenText ? JSON.parse(tokenText)?.accessToken : null;
    if (!token) {
      setStatusMessage('Unable to set sharing: not authenticated.');
      return;
    }

    try {
      const res = await fetch(`${backend}/api/v1/reports/${editingSharingId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clinician_email: sheet.clinicianEmail,
          scope: sheet.scope === 'full' ? 'report' : 'patient',
          access_level: sheet.scope === 'full' ? 'comment' : 'read',
          expires_at: new Date(sheet.expiresAt).toISOString(),
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        setStatusMessage(error?.detail || 'Failed to save sharing preferences.');
        return;
      }

      // Refresh list from backend
      await fetchReports();
      setStatusMessage('Sharing preferences saved for this report.');
    } catch {
      setStatusMessage('Failed to save sharing preferences.');
    }
  }

  async function revokeSharing(id: string) {
    const tokenText = localStorage.getItem('reportx_session');
      const token = tokenText ? JSON.parse(tokenText)?.accessToken : null;
      if (!token) {
        setStatusMessage('Unable to revoke sharing: not authenticated.');
        return;
      }

      // Determine clinician email for the specified report id. Prefer the report's stored prefs.
      const targetEntry = reportHistory.find((r) => r.id === id);
      const clinicianEmail = targetEntry?.sharingPreferences?.clinicianEmail || sheet.clinicianEmail;
      if (!clinicianEmail) {
        setStatusMessage('Clinician email not found for this report. Open Manage Sharing to set it first.');
        return;
      }

      try {
        const res = await fetch(`${backend}/api/v1/reports/${id}/share/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ clinician_email: clinicianEmail }),
        });
        if (!res.ok) {
          const error = await res.json().catch(() => null);
          setStatusMessage(error?.detail || 'Failed to revoke sharing.');
          return;
        }
        await fetchReports();
        setStatusMessage('Sharing revoked.');
      } catch {
        setStatusMessage('Failed to revoke sharing.');
      }
  }

  if (!user) {
    return (
      <ProtectedView>
        <div>Loading...</div>
      </ProtectedView>
    );
  }

  return (
    <ProtectedView>
      <section className="stack">
        <h1>My Report History</h1>
        <p className="history-summary">{reportCountLabel}</p>
        {loadError && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            {loadError}
          </div>
        )}

        <BiomarkerTimelineChart reports={reportHistory} />

        <div className="report-history-table-card" role="region" aria-label="Report history table">
          <table className="report-history-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="report-history-sort"
                    onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                    aria-label={`Sort by report date ${sortDirection === 'desc' ? 'oldest first' : 'newest first'}`}
                  >
                    <span>Report date</span>
                    <span aria-hidden="true">{sortDirection === 'desc' ? '▾' : '▴'}</span>
                  </button>
                </th>
                <th>Panel / type</th>
                <th>Test results</th>
                <th>Interpretation</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={5}>No reports uploaded yet.</td>
                </tr>
              ) : (
                rows.map(({ entry, card, panelName, actualDateAvailable, displayDate }) => (
                  <tr key={entry.id}>
                    <td className="date-col" style={{ boxShadow: `inset 4px 0 0 ${card.accentColor}` }}>
                      {actualDateAvailable ? (
                        <span className="report-date-text">{displayDate}</span>
                      ) : (
                        <span className="report-date-fallback" title="Actual report date unavailable">
                          {displayDate} <span className="help-icon" aria-hidden="true">?</span>
                        </span>
                      )}
                    </td>
                    <td>
                      {panelName ? <span>{panelName}</span> : <span className="muted-cell">Unknown panel</span>}
                    </td>
                    <td className="results-col">{card.testCount} results</td>
                    <td>
                      <span className={`interp-pill ${card.hasInterpretation ? 'yes' : 'no'}`}>
                        {card.hasInterpretation ? 'Interpreted' : 'Not interpreted'}
                      </span>
                    </td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <button className="table-btn table-btn-primary" onClick={() => (window.location.href = `/reports/${entry.id}`)}>Open</button>
                        <button className="table-btn table-btn-ghost" onClick={() => beginSharing(entry)}>Sharing</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="report-history-mobile-list" aria-label="Report history mobile list">
            {rows.length === 0 ? (
              <div className="mobile-empty">No reports uploaded yet.</div>
            ) : (
              rows.map(({ entry, card, panelName, actualDateAvailable, displayDate }) => (
                <article key={entry.id} className="mobile-report-row" style={{ boxShadow: `inset 0 4px 0 ${card.accentColor}` }}>
                  <div className="mobile-line-1">
                    <div className="mobile-date-panel">
                      {actualDateAvailable ? (
                        <span className="mobile-date">{displayDate}</span>
                      ) : (
                        <span className="mobile-date muted" title="Actual report date unavailable">
                          {displayDate} <span className="help-icon" aria-hidden="true">?</span>
                        </span>
                      )}
                      <span className={`mobile-panel ${panelName ? '' : 'muted-cell'}`}>{panelName || 'Unknown panel'}</span>
                    </div>
                    <span className={`interp-pill ${card.hasInterpretation ? 'yes' : 'no'}`}>
                      {card.hasInterpretation ? 'Interpreted' : 'Not interpreted'}
                    </span>
                  </div>
                  <div className="mobile-line-2">
                    <span className="results-col">{card.testCount} results</span>
                    <div className="table-actions">
                      <button className="table-btn table-btn-primary" onClick={() => (window.location.href = `/reports/${entry.id}`)}>Open</button>
                      <button className="table-btn table-btn-ghost" onClick={() => beginSharing(entry)}>Sharing</button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        {editingSharingId && (
          <div className="card" style={{ marginTop: '1.25rem' }}>
            <h2>Sharing Preferences</h2>
            <p>Report ID: {editingSharingId}</p>
            <div className="field">
              <label htmlFor="report-clinician-email">Clinician email</label>
              <input
                id="report-clinician-email"
                value={sheet.clinicianEmail}
                onChange={(e) => setSheet({ ...sheet, clinicianEmail: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="report-share-scope">Access scope</label>
              <select
                id="report-share-scope"
                value={sheet.scope}
                onChange={(e) => setSheet({ ...sheet, scope: e.target.value as 'summary' | 'full' })}
              >
                <option value="summary">Summary only</option>
                <option value="full">Full report</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="report-share-expiry">Expiry date</label>
              <input
                id="report-share-expiry"
                type="datetime-local"
                value={new Date(sheet.expiresAt).toISOString().slice(0, 16)}
                onChange={(e) => setSheet({ ...sheet, expiresAt: new Date(e.target.value).getTime() })}
              />
            </div>
            <button className="nav-btn nav-btn-primary" onClick={saveSharing}>Save Sharing Preferences</button>
            {statusMessage ? <p style={{ marginTop: '0.5rem' }}>{statusMessage}</p> : null}
          </div>
        )}
      </section>
    </ProtectedView>
  );
}
