'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/store/authStore';
import { ProtectedView } from '@/components/ProtectedView';
import { getReportById, getReportHistoryForUser, updateReportInHistory } from '@/lib/reportHistory';
import type { ReportHistoryEntry, SharingPreferences } from '@/lib/reportHistory';

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

const defaultSharingPreferences: SharingPreferences = {
  clinicianEmail: '',
  scope: 'summary',
  expiresAt: Date.now() + 86400000,
  active: false,
};

export default function ReportDetailPage({ params }: { params: { reportId: string } }) {
  const { user } = useAuth();
  const [report, setReport] = useState<ReportHistoryEntry | undefined>(undefined);
  const [sharingPreferences, setSharingPreferences] = useState<SharingPreferences>(defaultSharingPreferences);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!params.reportId || !user) {
      setReport(undefined);
      return;
    }
    const candidate = getReportById(params.reportId);
    if (!candidate || candidate.patientEmail !== user.email) {
      setReport(undefined);
      return;
    }
    setReport(candidate);
  }, [params.reportId, user]);

  useEffect(() => {
    if (!report) return;
    setSharingPreferences(report.sharingPreferences ?? defaultSharingPreferences);
  }, [report]);

  if (!user) {
    return (
      <ProtectedView>
        <div>Loading...</div>
      </ProtectedView>
    );
  }

  if (!report) {
    return (
      <ProtectedView>
        <section className="stack">
          <h1>Report Not Found</h1>
          <p>This report does not exist or you do not have permission to view it.</p>
        </section>
      </ProtectedView>
    );
  }

  const currentPrefs = report?.sharingPreferences ?? defaultSharingPreferences;

  function updateShare() {
    if (!report) return;
    const updatedPrefs: SharingPreferences = { ...sharingPreferences, active: true };
    setSharingPreferences(updatedPrefs);
    updateReportInHistory(report.id, { sharingPreferences: updatedPrefs });
    setReport({ ...report, sharingPreferences: updatedPrefs });
    setStatusMessage('Sharing preferences updated.');
  }

  function revokeShare() {
    if (!report) return;
    const resetPrefs: SharingPreferences = { ...defaultSharingPreferences, expiresAt: Date.now() };
    setSharingPreferences(resetPrefs);
    updateReportInHistory(report.id, { sharingPreferences: resetPrefs });
    setReport({ ...report, sharingPreferences: resetPrefs });
    setStatusMessage('Sharing revoked.');
  }

  const interpretation = report.interpretation;

  return (
    <ProtectedView>
      <section className="stack">
        <h1>{report.title || 'Report Detail'}</h1>
        <p>Saved: {formatDate(report.createdAt)}</p>
        <p>Rows: {report.rows.length}</p>
        <p>Interpretation: {interpretation ? 'Available' : 'Not completed yet'}</p>

        <div className="card">
          <h2>Report Data</h2>
          <ul>
            {report.rows.map((row, idx) => (
              <li key={`${row.test_name}-${idx}`}>
                {row.test_name}: {row.value} {row.unit || ''} ({row.reference_range || '?'}), flag={row.flag || 'unknown'}
              </li>
            ))}
          </ul>
        </div>

        {interpretation && (
          <div className="card">
            <h2>Interpretation</h2>
            <p>{interpretation.summary}</p>
          </div>
        )}

        <div className="card">
          <h2>Sharing Preferences</h2>
          <div className="field">
            <label htmlFor="clinician-email">Clinician Email</label>
            <input
              id="clinician-email"
              value={sharingPreferences.clinicianEmail}
              onChange={(e) => setSharingPreferences({ ...sharingPreferences, clinicianEmail: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="share-scope">Scope</label>
            <select
              id="share-scope"
              value={sharingPreferences.scope}
              onChange={(e) => setSharingPreferences({ ...sharingPreferences, scope: e.target.value as 'summary' | 'full' })}
            >
              <option value="summary">Summary only</option>
              <option value="full">Full report</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="share-expiry">Expiry</label>
            <input
              id="share-expiry"
              type="datetime-local"
              value={new Date(sharingPreferences.expiresAt).toISOString().slice(0, 16)}
              onChange={(e) => setSharingPreferences({ ...sharingPreferences, expiresAt: new Date(e.target.value).getTime() })}
            />
          </div>
          <button className="nav-btn nav-btn-primary" onClick={updateShare}>{sharingPreferences.active ? 'Update Share' : 'Start Sharing'}</button>
          {sharingPreferences.active && <button className="nav-btn nav-btn-danger" onClick={revokeShare} style={{ marginLeft: '0.5rem' }}>Revoke</button>}
          {statusMessage && <p>{statusMessage}</p>}
        </div>

      </section>
    </ProtectedView>
  );
}
