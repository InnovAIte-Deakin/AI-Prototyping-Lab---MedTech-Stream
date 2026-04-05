'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/store/authStore';
import { ProtectedView } from '@/components/ProtectedView';
import { fetchReportById, updateReportInHistory } from '@/lib/reportHistory';
import type { ReportHistoryEntry, SharingPreferences } from '@/lib/reportHistory';
import { PatientQuestions } from '@/components/PatientQuestions';
import { ThreadView } from '@/components/ThreadView';
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
    async function loadReport() {
      if (!params.reportId || !user) {
        setReport(undefined);
        return;
      }
      try {
        const candidate = await fetchReportById(params.reportId);
        if (!candidate) {
          setReport(undefined);
          setStatusMessage('Report not found.');
          return;
        }
        setReport(candidate);
        setStatusMessage('');
      } catch (err: any) {
        console.error('loadReport failed', err);
        setReport(undefined);
        setStatusMessage(err?.message || 'Failed to load report.');
      }
    }
    void loadReport();
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
          {statusMessage && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{statusMessage}</div>}
        </section>
      </ProtectedView>
    );
  }

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  async function updateShare() {
    if (!report) return;
    if (!sharingPreferences.clinicianEmail) {
      setStatusMessage('Please provide clinician email for sharing.');
      return;
    }

    const accessToken = (() => {
      const stored = localStorage.getItem('reportx_session');
      if (!stored) return null;
      try {
        const session = JSON.parse(stored);
        return session?.accessToken || null;
      } catch {
        return null;
      }
    })();

    if (!accessToken) {
      setStatusMessage('Unable to find authenticated session. Please log in.');
      return;
    }

    try {
      const response = await fetch(`${backend}/api/v1/reports/${report.id}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          clinician_email: sharingPreferences.clinicianEmail,
          scope: 'report',
          access_level: sharingPreferences.scope === 'full' ? 'comment' : 'read',
          expires_at: new Date(sharingPreferences.expiresAt).toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        const message = error?.detail || 'Failed to update sharing preferences.';
        setStatusMessage(message);
        return;
      }

      const updatedPrefs: SharingPreferences = { ...sharingPreferences, active: true };
      setSharingPreferences(updatedPrefs);
      updateReportInHistory(report.id, { sharingPreferences: updatedPrefs });
      setReport({ ...report, sharingPreferences: updatedPrefs });
      setStatusMessage('Sharing preferences updated.');
    } catch (err) {
      setStatusMessage('Unable to save sharing preferences. Please try again.');
    }
  }

  async function revokeShare() {
    if (!report) return;

    const accessToken = (() => {
      const stored = localStorage.getItem('reportx_session');
      if (!stored) return null;
      try {
        const session = JSON.parse(stored);
        return session?.accessToken || null;
      } catch {
        return null;
      }
    })();

    if (!accessToken) {
      setStatusMessage('Unable to find authenticated session. Please log in.');
      return;
    }

    try {
      const response = await fetch(`${backend}/api/v1/reports/${report.id}/share/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ clinician_email: sharingPreferences.clinicianEmail }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        const message = error?.detail || 'Failed to revoke sharing preferences.';
        setStatusMessage(message);
        return;
      }

      const resetPrefs: SharingPreferences = { ...defaultSharingPreferences, expiresAt: Date.now() };
      setSharingPreferences(resetPrefs);
      updateReportInHistory(report.id, { sharingPreferences: resetPrefs });
      setReport({ ...report, sharingPreferences: resetPrefs });
      setStatusMessage('Sharing revoked.');
    } catch {
      setStatusMessage('Unable to revoke sharing preferences. Please try again.');
    }
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

        <PatientQuestions 
          reportId={report.id} 
          accessToken={localStorage.getItem('reportx_session') ? JSON.parse(localStorage.getItem('reportx_session')!)?.accessToken || '' : ''} 
          onThreadCreated={() => {}} 
        />

        <ThreadView 
          reportId={report.id} 
          accessToken={localStorage.getItem('reportx_session') ? JSON.parse(localStorage.getItem('reportx_session')!)?.accessToken || '' : ''} 
        />

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
