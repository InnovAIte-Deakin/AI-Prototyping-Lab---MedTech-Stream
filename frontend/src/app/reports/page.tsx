'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedView } from '@/components/ProtectedView';
import { useAuth } from '@/store/authStore';
import { getReportHistoryForUser, updateReportInHistory } from '@/lib/reportHistory';
import type { ReportHistoryEntry, SharingPreferences } from '@/lib/reportHistory';

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [reportHistory, setReportHistory] = useState<ReportHistoryEntry[]>([]);
  const [editingSharingId, setEditingSharingId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SharingPreferences>({ clinicianEmail: '', scope: 'summary', expiresAt: Date.now() + 86400000, active: false });
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    setReportHistory(getReportHistoryForUser(user.email));
  }, [user]);

  function refresh() {
    if (!user) return;
    setReportHistory(getReportHistoryForUser(user.email));
  }

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

  function saveSharing() {
    if (!editingSharingId || !user) return;
    const payload = {
      sharingPreferences: {
        clinicianEmail: sheet.clinicianEmail,
        scope: sheet.scope,
        expiresAt: sheet.expiresAt,
        active: true,
      },
    };
    updateReportInHistory(editingSharingId, payload);
    refresh();
    setStatusMessage('Sharing preferences saved for this report.');
  }

  function revokeSharing(id: string) {
    updateReportInHistory(id, { sharingPreferences: { clinicianEmail: '', scope: 'summary', expiresAt: Date.now(), active: false } });
    refresh();
    setStatusMessage('Sharing revoked.');
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

        {reportHistory.length === 0 ? (
          <div className="card">
            <p>You don't have any reports yet. Please <a href="/parse">review a report</a> first.</p>
          </div>
        ) : (
          <div className="card">
            {reportHistory.map((entry) => (
              <article key={entry.id} className="card" style={{ marginBottom: '0.75rem' }}>
                <h3>{entry.title || 'Untitled Report'}</h3>
                <p><small>Saved: {formatDate(entry.createdAt)}</small></p>
                <p>Rows: {entry.rows?.length ?? 0}</p>
                <p>Interpretation: {entry.interpretation ? 'Yes' : 'No'}</p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="nav-btn nav-btn-primary" onClick={() => (window.location.href = `/reports/${entry.id}`)}>Open Report</button>
                  <button className="nav-btn nav-btn-outline" onClick={() => beginSharing(entry)}>Manage Sharing Preferences</button>
                  {entry.sharingPreferences?.active && (
                    <button className="nav-btn nav-btn-danger" onClick={() => revokeSharing(entry.id)}>Revoke Share</button>
                  )}
                </div>
              </article>
            ))}
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
