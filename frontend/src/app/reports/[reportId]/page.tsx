'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/store/authStore';
import { ProtectedView } from '@/components/ProtectedView';
import { getReportById, getReportHistoryForUser, updateReportInHistory } from '@/lib/reportHistory';
import type { ReportHistoryEntry, SharingPreferences } from '@/lib/reportHistory';

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function ReportDetailPage({ params }: { params: { reportId: string } }) {
  const { user } = useAuth();
  const [sharingPreferences, setSharingPreferences] = useState<SharingPreferences>({ clinicianEmail: '', scope: 'summary', expiresAt: Date.now() + 86400000, active: false });
  const [statusMessage, setStatusMessage] = useState('');

  const report = useMemo(() => {
    if (!params.reportId || !user) return undefined;
    const candidate = getReportById(params.reportId);
    if (!candidate || candidate.patientEmail !== user.email) return undefined;
    return candidate;
  }, [params.reportId, user]);

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

  const currentPrefs = report.sharingPreferences ?? { clinicianEmail: '', scope: 'summary', expiresAt: Date.now() + 86400000, active: false };

  function updateShare() {
    if (!report) return;
    updateReportInHistory(report.id, { sharingPreferences });
    setStatusMessage('Sharing preferences updated.');
  }

  function revokeShare() {
    if (!report) return;
    updateReportInHistory(report.id, { sharingPreferences: { clinicianEmail: '', scope: 'summary', expiresAt: Date.now(), active: false } });
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
              value={sharingPreferences.clinicianEmail || currentPrefs.clinicianEmail}
              onChange={(e) => setSharingPreferences({ ...sharingPreferences, clinicianEmail: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="share-scope">Scope</label>
            <select
              id="share-scope"
              value={sharingPreferences.scope || currentPrefs.scope}
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
              value={new Date(sharingPreferences.expiresAt || currentPrefs.expiresAt).toISOString().slice(0, 16)}
              onChange={(e) => setSharingPreferences({ ...sharingPreferences, expiresAt: new Date(e.target.value).getTime() })}
            />
          </div>
          <button className="nav-btn nav-btn-primary" onClick={updateShare}>{currentPrefs.active ? 'Update Share' : 'Start Sharing'}</button>
          {currentPrefs.active && <button className="nav-btn nav-btn-danger" onClick={revokeShare} style={{ marginLeft: '0.5rem' }}>Revoke</button>}
          {statusMessage && <p>{statusMessage}</p>}
        </div>

      </section>
    </ProtectedView>
  );
}
