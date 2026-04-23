'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedView } from '@/components/ProtectedView';
import { useAuth } from '@/store/authStore';
import { fetchReportHistory } from '@/lib/reportHistory';
import type { ReportHistoryEntry, SharingPreferences } from '@/lib/reportHistory';
import { BiomarkerTimelineChart } from '@/components/BiomarkerTimelineChart';
import { buildBiomarkerTimeline } from '@/lib/reportTimeline';
import { resolveReportDate } from '@/lib/reportHistory';
import { SharingPreferencesPanel } from '@/components/SharingPreferencesPanel';
import { Badge } from '@/components/ui/Badge';

type SortDirection = 'desc' | 'asc';

function formatReportDate(ts: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts));
}

function formatReportTime(ts: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function resolvePanelShortName(entry: ReportHistoryEntry): string {
  const explicit = entry.panelName?.trim();
  if (explicit) return explicit;

  const fromTitle = entry.title?.match(/\b(LFT|KFT|FBC|CBC|BMP|CMP|LIPID|TFT)\b/i)?.[1];
  if (fromTitle) return fromTitle.toUpperCase();

  return 'General Panel';
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
  const [searchText, setSearchText] = useState('');
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
          displayTime: formatReportTime(dateValue),
          sortDate: dateValue,
        };
      })
      .filter(Boolean) as Array<{
      entry: ReportHistoryEntry;
      card: (typeof reportCards)[number];
      panelName: string;
      actualDateAvailable: boolean;
      displayDate: string;
      displayTime: string;
      sortDate: number;
    }>;

    // Search filter
    const normalizedSearch = searchText.trim().toLowerCase();
    const filtered = normalizedSearch
      ? items.filter((item) => {
          const haystack = `${item.panelName} ${item.entry.title} ${item.displayDate}`.toLowerCase();
          return haystack.includes(normalizedSearch);
        })
      : items;

    filtered.sort((a, b) => (sortDirection === 'desc' ? b.sortDate - a.sortDate : a.sortDate - b.sortDate));
    return filtered;
  }, [reportHistory, reportCardById, sortDirection, searchText]);

  const reportCountLabel = `You have ${rows.length} clinical report${rows.length === 1 ? '' : 's'} available for review.`;

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clinician_email: sheet.clinicianEmail,
          scope: sheet.scope === 'full' ? 'patient' : 'report',
          access_level: sheet.scope === 'full' ? 'comment' : 'read',
          expires_at: new Date(sheet.expiresAt).toISOString(),
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        setStatusMessage(error?.detail || 'Failed to save sharing preferences.');
        return;
      }
      await fetchReports();
      setStatusMessage('Sharing preferences saved for this report.');
    } catch {
      setStatusMessage('Failed to save sharing preferences.');
    }
  }

  async function revokeSharing() {
    if (!editingSharingId) return;
    const tokenText = localStorage.getItem('reportx_session');
    const token = tokenText ? JSON.parse(tokenText)?.accessToken : null;
    if (!token) {
      setStatusMessage('Unable to revoke sharing: not authenticated.');
      return;
    }
    const targetEntry = reportHistory.find((r) => r.id === editingSharingId);
    const clinicianEmail = targetEntry?.sharingPreferences?.clinicianEmail || sheet.clinicianEmail;
    if (!clinicianEmail) {
      setStatusMessage('Clinician email not found for this report.');
      return;
    }
    try {
      const res = await fetch(`${backend}/api/v1/reports/${editingSharingId}/share/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clinician_email: clinicianEmail }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        setStatusMessage(error?.detail || 'Failed to revoke sharing.');
        return;
      }
      await fetchReports();
      setStatusMessage('Sharing revoked.');
      setEditingSharingId(null);
    } catch {
      setStatusMessage('Failed to revoke sharing.');
    }
  }

  // Get top result chips for a report entry (first 2 + count of remaining)
  function getResultChips(entry: ReportHistoryEntry) {
    const topRows = entry.rows.slice(0, 2);
    const remaining = entry.rows.length - topRows.length;
    return { topRows, remaining };
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <h1>My Report History</h1>
            <p className="history-summary" style={{ color: 'var(--on-surface-muted)', marginTop: 'var(--space-2)' }}>
              {reportCountLabel}
            </p>
          </div>
          <div className="biomarker-selector">
            <div className="biomarker-selector-label">Selected Biomarker</div>
            <select
              aria-label="Select biomarker"
              className="input"
              style={{ minWidth: 260 }}
              defaultValue=""
            >
              {timeline.series.length === 0 && <option value="">No biomarkers available</option>}
              {timeline.series.map((s) => (
                <option key={s.biomarkerKey} value={s.biomarkerKey}>{s.displayName}</option>
              ))}
            </select>
          </div>
        </div>

        {loadError && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{loadError}</div>
        )}

        {/* Trend analysis section */}
        <div className="trend-section">
          <div className="trend-chart-card">
            <div className="trend-chart-header">
              <h3 className="trend-chart-title">Biomarker Trend Analysis</h3>
              <div className="trend-time-pills">
                <button type="button" className="trend-time-pill active">6 Months</button>
                <button type="button" className="trend-time-pill">1 Year</button>
              </div>
            </div>
            <BiomarkerTimelineChart reports={reportHistory} />
          </div>

          <div className="clinical-insight-card">
            <div className="clinical-insight-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Clinical Insight
            </div>
            {timeline.series.length > 0 ? (
              <>
                <h3>Your biomarker trends are being tracked.</h3>
                <p>Comparing your reports over time to identify meaningful patterns in your health data.</p>
              </>
            ) : (
              <>
                <h3>Upload more reports to unlock trends.</h3>
                <p>We need at least two reports with the same biomarkers to begin trend analysis.</p>
              </>
            )}
            <button type="button" className="btn btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
              View Recommendations
            </button>
          </div>
        </div>

        {/* Comprehensive Report History */}
        <div className="report-section-header">
          <h2 className="report-section-title">Comprehensive Report History</h2>
          <div className="report-search">
            <svg className="report-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search reports..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              aria-label="Search reports"
            />
          </div>
        </div>

        <div className="report-history-table-card" role="region" aria-label="Report history table">
          <table className="rh-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="report-history-sort"
                    onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                    aria-label={`Sort by report date ${sortDirection === 'desc' ? 'oldest first' : 'newest first'}`}
                  >
                    <span>Report Date</span>
                    <span aria-hidden="true">{sortDirection === 'desc' ? '▾' : '▴'}</span>
                  </button>
                </th>
                <th>Panel / Type</th>
                <th>Test Results</th>
                <th>Interpretation</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--on-surface-muted)' }}>
                    No reports uploaded yet.
                  </td>
                </tr>
              ) : (
                rows.map(({ entry, card, panelName, displayDate, displayTime }) => {
                  const { topRows, remaining } = getResultChips(entry);
                  return (
                    <tr key={entry.id}>
                      <td>
                        <div className="rh-date">{displayDate}</div>
                        <div className="rh-date-time">{displayTime}</div>
                      </td>
                      <td>
                        <div className="rh-panel">
                          <svg className="rh-panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          {panelName}
                        </div>
                      </td>
                      <td>
                        <div className="rh-result-chips">
                          {topRows.map((row, i) => (
                            <span key={i} className="rh-result-chip">
                              {row.test_name}: {row.value} {row.unit || ''}
                            </span>
                          ))}
                          {remaining > 0 && (
                            <span className="rh-result-more">+{remaining} more</span>
                          )}
                          {entry.rows.length === 0 && (
                            <span className="rh-result-more">No results</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <Badge variant={card.hasInterpretation ? 'optimal' : 'attention'}>
                          {card.hasInterpretation ? 'Optimal' : 'Not Interpreted'}
                        </Badge>
                      </td>
                      <td>
                        <div className="rh-actions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="rh-action-btn"
                            onClick={() => (window.location.href = `/reports/${entry.id}`)}
                            aria-label={`Open report ${panelName}`}
                            title="View report"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <button
                            className="rh-action-btn"
                            onClick={() => beginSharing(entry)}
                            aria-label={`Share report ${panelName}`}
                            title="Share report"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="18" cy="5" r="3" />
                              <circle cx="6" cy="12" r="3" />
                              <circle cx="18" cy="19" r="3" />
                              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {rows.length > 0 && (
            <div className="rh-pagination">
              <span className="rh-pagination-info">
                Showing 1-{rows.length} of {rows.length} reports
              </span>
              <div className="rh-pagination-buttons">
                <button type="button" className="btn btn-outline btn-sm" disabled>Previous</button>
                <button type="button" className="btn btn-primary btn-sm" disabled>Next</button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile fallback list */}
        <div className="report-history-mobile-list" aria-label="Report history mobile list">
          {rows.length === 0 ? (
            <div className="mobile-empty">No reports uploaded yet.</div>
          ) : (
            rows.map(({ entry, card, panelName, displayDate }) => (
              <article key={entry.id} className="mobile-report-row" style={{ boxShadow: `inset 0 4px 0 ${card.accentColor}` }}>
                <div className="mobile-line-1">
                  <div className="mobile-date-panel">
                    <span className="mobile-date">{displayDate}</span>
                    <span className="mobile-panel">{panelName}</span>
                  </div>
                  <Badge variant={card.hasInterpretation ? 'optimal' : 'attention'}>
                    {card.hasInterpretation ? 'Interpreted' : 'Not interpreted'}
                  </Badge>
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

        {/* Sharing Preferences Slide-in Panel */}
        <SharingPreferencesPanel
          open={editingSharingId !== null}
          onClose={() => { setEditingSharingId(null); setStatusMessage(''); }}
          onShare={saveSharing}
          onRevoke={revokeSharing}
          clinicianEmail={sheet.clinicianEmail}
          onClinicianEmailChange={(e) => setSheet({ ...sheet, clinicianEmail: e.target.value })}
          scope={sheet.scope}
          onScopeChange={(e) => setSheet({ ...sheet, scope: e.target.value as 'summary' | 'full' })}
          expiresAt={sheet.expiresAt}
          onExpiresAtChange={(e) => setSheet({ ...sheet, expiresAt: new Date(e.target.value).getTime() })}
          shareActive={sheet.active}
          statusMessage={statusMessage}
        />
      </section>
    </ProtectedView>
  );
}
