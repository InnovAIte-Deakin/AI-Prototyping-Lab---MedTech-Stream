'use client';

import { useEffect, useCallback, useState } from 'react';
import { useAuth } from '@/store/authStore';
import { ProtectedView } from '@/components/ProtectedView';
import { fetchReportById, updateReportInHistory } from '@/lib/reportHistory';
import type { ReportHistoryEntry, SharingPreferences } from '@/lib/reportHistory';
import { PatientQuestions } from '@/components/PatientQuestions';
import { ThreadView, ConversationThread } from '@/components/ThreadView';
import { DoctorSummaryDocument, type SummaryFinding, type SummaryThread } from '@/components/DoctorSummaryDocument';
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
  // FR13 state
  const [includeSummaryPDF, setIncludeSummaryPDF] = useState(false);
  const [threads, setThreads] = useState<ConversationThread[]>([]);

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

  // --- FR13: build data for DoctorSummaryDocument ---
  const accessToken = (() => {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem('reportx_session');
    if (!stored) return '';
    try { return JSON.parse(stored)?.accessToken || ''; } catch { return ''; }
  })();

  const allFindingsForPDF: SummaryFinding[] = report.rows.map((r) => ({
    test_name: r.test_name,
    value: String(r.value ?? ''),
    unit: r.unit || undefined,
    flag: r.flag || 'unknown',
    reference_range: r.reference_range || undefined,
  }));

  const flaggedFindings = allFindingsForPDF.filter(
    (f) => ['high', 'low', 'abnormal'].includes(f.flag.toLowerCase())
  );

  const threadSummaries: SummaryThread[] = threads.map((t) => ({
    title: t.title,
    patientQuestions: t.messages
      .filter((m) => m.kind === 'text')
      .map((m) => m.body)
      .slice(0, 5),
  }));

  const handleExportPDF = () => {
    window.print();
  };

  const handleShareWithPDF = async () => {
    await updateShare();
    if (includeSummaryPDF) {
      setTimeout(() => window.print(), 400);
    }
  };

  return (
    <ProtectedView>
      {/* FR13 — hidden print-only wrapper, revealed only via @media print */}
      <div id="doctor-summary-print-target" style={{ display: 'none' }}>
        <DoctorSummaryDocument
          reportTitle={report.title || 'Lab Results Summary'}
          reportDate={formatDate(report.createdAt)}
          patientName={user?.displayName || user?.email || 'Patient'}
          flaggedFindings={flaggedFindings}
          allFindings={allFindingsForPDF}
          interpretationSummary={interpretation?.summary}
          trendNotes={undefined}
          threads={threadSummaries}
        />
      </div>

      <section className="stack">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <h1 style={{ margin: 0 }}>{report.title || 'Report Detail'}</h1>
          <button
            id="export-doctor-summary-btn"
            className="nav-btn nav-btn-primary"
            onClick={handleExportPDF}
            title="Export a doctor-ready one-page PDF summary — generated locally, never stored on server"
          >
            📄 Export Doctor Summary
          </button>
        </div>
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
          accessToken={accessToken}
          onThreadCreated={() => {}}
        />

        <ThreadView
          reportId={report.id}
          accessToken={accessToken}
          onThreadsLoaded={setThreads}
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
          {/* FR13 — include doctor-ready summary PDF when sharing */}
          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#f0fdf4', padding: '0.75rem', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '0.5rem' }}>
            <input
              id="include-summary-pdf"
              type="checkbox"
              checked={includeSummaryPDF}
              onChange={(e) => setIncludeSummaryPDF(e.target.checked)}
              style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
            />
            <label htmlFor="include-summary-pdf" style={{ cursor: 'pointer', fontSize: '0.9rem', color: '#15803d', fontWeight: 500 }}>
              📄 Also download Doctor-Ready Summary PDF
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', fontWeight: 400 }}>Generated locally in your browser — never stored on server</span>
            </label>
          </div>
          <button id="share-report-btn" className="nav-btn nav-btn-primary" onClick={handleShareWithPDF}>{sharingPreferences.active ? 'Update Share' : 'Start Sharing'}</button>
          {sharingPreferences.active && <button className="nav-btn nav-btn-danger" onClick={revokeShare} style={{ marginLeft: '0.5rem' }}>Revoke</button>}
          {statusMessage && <p>{statusMessage}</p>}
        </div>

      </section>
    </ProtectedView>
  );
}
