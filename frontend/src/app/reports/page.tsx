'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedView } from '@/components/ProtectedView';
import { useAuth } from '@/store/authStore';
import { fetchReportHistory } from '@/lib/reportHistory';
import type { ReportHistoryEntry, SharingPreferences } from '@/lib/reportHistory';
import { BiomarkerTimelineChart } from '@/components/BiomarkerTimelineChart';
import { buildBiomarkerTimeline } from '@/lib/reportTimeline';
import { resolveReportDate } from '@/lib/reportHistory';

export default function ReportsPage() {
  const { user } = useAuth();
  const [reportHistory, setReportHistory] = useState<ReportHistoryEntry[]>([]);
  const [editingSharingId, setEditingSharingId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SharingPreferences>({ clinicianEmail: '', scope: 'summary', expiresAt: Date.now() + 86400000, active: false });
  const [statusMessage, setStatusMessage] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
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
        <p>These are your own reports, saved locally in your browser session.</p>
        {loadError && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            {loadError}
          </div>
        )}

        <BiomarkerTimelineChart reports={reportHistory} />

        {reportHistory.length === 0 ? (
          <div className="card">
            <p>You don&apos;t have any reports yet. Please <a href="/parse">review a report</a> first.</p>
          </div>
        ) : (
          <div className="card">
            {reportHistory.map((entry) => {
              const card = reportCardById.get(entry.id);
              if (!card) return null;
              return (
              <article
                key={entry.id}
                className="card"
                style={{
                  marginBottom: '0.75rem',
                  borderLeft: `4px solid ${card.accentColor}`,
                }}
              >
                <h3>{card.displayTitle}</h3>
                <p><small>Report date: {card.reportDateLabel}</small></p>
                <p>{card.testCount} test results</p>
                <p>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '999px',
                      background: card.hasInterpretation ? '#E6F6F7' : '#E5E7EB',
                      color: card.hasInterpretation ? '#077B82' : '#6B7280',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    {card.hasInterpretation ? 'Interpreted' : 'No interpretation yet'}
                  </span>
                </p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="nav-btn nav-btn-primary" onClick={() => (window.location.href = `/reports/${entry.id}`)}>Open Report</button>
                  <button className="nav-btn nav-btn-outline" onClick={() => beginSharing(entry)}>Manage Sharing Preferences</button>
                  {entry.sharingPreferences?.active && (
                    <button className="nav-btn nav-btn-danger" onClick={() => revokeSharing(entry.id)}>Revoke Share</button>
                  )}
                </div>
              </article>
              );
            })}
          </div>
        )}

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
