'use client';

import { useEffect, useCallback, useState } from 'react';
import { useAuth } from '@/store/authStore';
import { ProtectedView } from '@/components/ProtectedView';
import { fetchReportById, updateReportInHistory } from '@/lib/reportHistory';
import type { ReportHistoryEntry, SharingPreferences } from '@/lib/reportHistory';
import { PatientQuestions } from '@/components/PatientQuestions';
import { ThreadView, ConversationThread } from '@/components/ThreadView';
import { DoctorSummaryDocument, type SummaryFinding, type SummaryThread } from '@/components/DoctorSummaryDocument';
import Disclaimer from '@/components/Disclaimer';
import { BiomarkerTrendChart } from '@/components/BiomarkerTrendChart';
import { fetchReportTrends, type BiomarkerTrend } from '@/lib/reportTrends';
import { AuditLogTimeline } from '@/components/AuditLogTimeline';
import { shareStateFrom, type ShareLifecycleState } from '@/lib/auditLog';
import { Badge } from '@/components/ui/Badge';
import { SharingPreferencesPanel } from '@/components/SharingPreferencesPanel';

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

const defaultSharingPreferences: SharingPreferences = {
  clinicianEmail: '',
  scope: 'summary',
  expiresAt: Date.now() + 86400000,
  active: false,
};

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Espanol' },
  { value: 'ar', label: 'العربية' },
  { value: 'zh', label: '中文 (普通话)' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'fr', label: 'Francais' },
];

export default function ReportDetailPage({ params }: { params: { reportId: string } }) {
  const { user } = useAuth();
  const [report, setReport] = useState<ReportHistoryEntry | undefined>(undefined);
  const [sharingPreferences, setSharingPreferences] = useState<SharingPreferences>(defaultSharingPreferences);
  const [statusMessage, setStatusMessage] = useState('');
  const [includeSummaryPDF, setIncludeSummaryPDF] = useState(false);
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [auditReloadToken, setAuditReloadToken] = useState(0);
  const [sharingPanelOpen, setSharingPanelOpen] = useState(false);

  // Trend states
  const [trends, setTrends] = useState<BiomarkerTrend[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [trendLanguage, setTrendLanguage] = useState('en');
  const [loadingTrendTranslations, setLoadingTrendTranslations] = useState(false);
  const [trendTranslationError, setTrendTranslationError] = useState<string | null>(null);
  const [trendNoteTranslations, setTrendNoteTranslations] = useState<Record<string, Record<string, string>>>({});
  const [prefetchedTrendLanguages, setPrefetchedTrendLanguages] = useState<Record<string, Record<string, boolean>>>({});
  const [biomarkerFilterText, setBiomarkerFilterText] = useState('');
  const [selectedBiomarkerKey, setSelectedBiomarkerKey] = useState('');

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

  useEffect(() => {
    setTrends([]);
    setTrendsError(null);
    setTrendLanguage('en');
    setTrendTranslationError(null);
    setTrendNoteTranslations({});
    setPrefetchedTrendLanguages({});
    setBiomarkerFilterText('');
    setSelectedBiomarkerKey('');
  }, [report?.id]);

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  function getAccessToken() {
    const stored = localStorage.getItem('reportx_session');
    if (!stored) return null;
    try {
      return JSON.parse(stored)?.accessToken || null;
    } catch {
      return null;
    }
  }

  const loadTrends = useCallback(async (reportId: string) => {
    setTrendsLoading(true);
    setTrendsError(null);
    try {
      const data = await fetchReportTrends(reportId);
      setTrends(Array.isArray(data.trends) ? data.trends : []);
    } catch (err: any) {
      const message = String(err?.message || 'Unable to load trends.');
      if (message.includes('403')) {
        setTrendsError('Trend details require full-report sharing access for clinician views.');
      } else {
        setTrendsError('Unable to load trends right now.');
      }
      setTrends([]);
    } finally {
      setTrendsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!report?.id) return;
    void loadTrends(report.id);
  }, [report?.id, loadTrends]);

  const translateTrendNotesIfNeeded = useCallback(async (languageCode: string) => {
    if (languageCode === 'en' || trends.length === 0) return;
    const withEnoughPoints = trends.filter((item) => item.sparkline.length > 1);
    const toTranslate = withEnoughPoints.filter(
      (item) => !trendNoteTranslations[item.biomarker_key]?.[languageCode] && !prefetchedTrendLanguages[item.biomarker_key]?.[languageCode],
    );
    if (toTranslate.length === 0) return;
    setLoadingTrendTranslations(true);
    setTrendTranslationError(null);
    try {
      const translated = await Promise.all(
        toTranslate.map(async (item) => {
          const response = await fetch(`${backend}/api/v1/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: item.trend_note, target_language: languageCode, prefetch_all: true }),
          });
          if (!response.ok) throw new Error('Trend note translation failed.');
          const payload = await response.json();
          return { biomarkerKey: item.biomarker_key, translations: (payload?.translations ?? {}) as Record<string, string> };
        }),
      );
      setTrendNoteTranslations((prev) => {
        const next = { ...prev };
        for (const item of translated) { next[item.biomarkerKey] = { ...(next[item.biomarkerKey] || {}), ...item.translations }; }
        return next;
      });
      setPrefetchedTrendLanguages((prev) => {
        const next = { ...prev };
        for (const item of translated) {
          const langMap = { ...(next[item.biomarkerKey] || {}) };
          for (const lang of Object.keys(item.translations)) langMap[lang] = true;
          next[item.biomarkerKey] = langMap;
        }
        return next;
      });
    } catch {
      setTrendTranslationError('Unable to translate trend notes right now. Showing English.');
      setTrendLanguage('en');
    } finally {
      setLoadingTrendTranslations(false);
    }
  }, [backend, prefetchedTrendLanguages, trendNoteTranslations, trends]);

  useEffect(() => {
    void translateTrendNotesIfNeeded(trendLanguage);
  }, [trendLanguage, translateTrendNotesIfNeeded]);

  async function updateShare() {
    if (!report) return;
    if (!sharingPreferences.clinicianEmail) {
      setStatusMessage('Please provide clinician email for sharing.');
      return;
    }
    const accessToken = getAccessToken();
    if (!accessToken) {
      setStatusMessage('Unable to find authenticated session. Please log in.');
      return;
    }
    try {
      const response = await fetch(`${backend}/api/v1/reports/${report.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          clinician_email: sharingPreferences.clinicianEmail,
          scope: sharingPreferences.scope === 'full' ? 'patient' : 'report',
          access_level: sharingPreferences.scope === 'full' ? 'comment' : 'read',
          expires_at: new Date(sharingPreferences.expiresAt).toISOString(),
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        setStatusMessage(error?.detail || 'Failed to update sharing preferences.');
        return;
      }
      const updatedPrefs: SharingPreferences = { ...sharingPreferences, active: true };
      setSharingPreferences(updatedPrefs);
      updateReportInHistory(report.id, { sharingPreferences: updatedPrefs });
      setReport({ ...report, sharingPreferences: updatedPrefs });
      setStatusMessage('Sharing preferences updated.');
      setAuditReloadToken((n) => n + 1);
    } catch {
      setStatusMessage('Unable to save sharing preferences. Please try again.');
    }
  }

  async function revokeShare() {
    if (!report) return;
    const accessToken = getAccessToken();
    if (!accessToken) {
      setStatusMessage('Unable to find authenticated session. Please log in.');
      return;
    }
    try {
      const response = await fetch(`${backend}/api/v1/reports/${report.id}/share/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ clinician_email: sharingPreferences.clinicianEmail }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        setStatusMessage(error?.detail || 'Failed to revoke sharing preferences.');
        return;
      }
      const resetPrefs: SharingPreferences = { ...defaultSharingPreferences, expiresAt: Date.now() };
      setSharingPreferences(resetPrefs);
      updateReportInHistory(report.id, { sharingPreferences: resetPrefs });
      setReport({ ...report, sharingPreferences: resetPrefs });
      setStatusMessage('Sharing revoked.');
      setAuditReloadToken((n) => n + 1);
    } catch {
      setStatusMessage('Unable to revoke sharing preferences. Please try again.');
    }
  }

  const interpretation = report?.interpretation;
  const trendItems = trends.filter((item) => item.sparkline.length > 1);
  const normalizedFilter = biomarkerFilterText.trim().toLowerCase();
  const filteredTrendItems = trendItems.filter((item) => {
    if (!normalizedFilter) return true;
    return `${item.display_name} ${item.biomarker_key}`.toLowerCase().includes(normalizedFilter);
  });

  useEffect(() => {
    if (filteredTrendItems.length === 0) { setSelectedBiomarkerKey(''); return; }
    const stillExists = filteredTrendItems.some((item) => item.biomarker_key === selectedBiomarkerKey);
    if (!stillExists) setSelectedBiomarkerKey(filteredTrendItems[0].biomarker_key);
  }, [filteredTrendItems, selectedBiomarkerKey]);

  const selectedTrend = filteredTrendItems.find((item) => item.biomarker_key === selectedBiomarkerKey) || filteredTrendItems[0] || null;

  const shareState: ShareLifecycleState = shareStateFrom(
    { active: sharingPreferences.active, expiresAt: sharingPreferences.expiresAt },
  );

  if (!user) {
    return (<ProtectedView><div>Loading...</div></ProtectedView>);
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

  // FR13 data
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

  const threadSummaries: SummaryThread[] = (Array.isArray(threads) ? threads : []).map((t) => ({
    title: t.title,
    patientQuestions: t.messages.filter((m) => m.kind === 'text').map((m) => m.body).slice(0, 5),
  }));

  const handleExportPDF = () => { window.print(); };

  const handleShareWithPDF = async () => {
    await updateShare();
    if (includeSummaryPDF) setTimeout(() => window.print(), 400);
  };

  // Count flagged results
  const flaggedCount = report.rows.filter((r) => r.flag === 'high' || r.flag === 'low' || r.flag === 'abnormal').length;
  const normalCount = report.rows.length - flaggedCount;

  // Resolve flag badge variant
  function flagBadgeVariant(flag: string | null | undefined): 'high' | 'low' | 'optimal' | 'attention' | 'normal' {
    if (!flag || flag === 'normal') return 'optimal';
    if (flag === 'high') return 'high';
    if (flag === 'low') return 'low';
    return 'attention';
  }

  function flagBadgeLabel(flag: string | null | undefined): string {
    if (!flag || flag === 'normal') return 'OPTIMAL';
    return flag.toUpperCase();
  }

  return (
    <ProtectedView>
      {/* FR13 print target */}
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
        {/* Breadcrumb */}
        <nav className="report-breadcrumb">
          <a href="/reports">Reports</a>
          <span className="report-breadcrumb-sep" aria-hidden="true">&gt;</span>
          <span>{report.title || 'Report Detail'}</span>
        </nav>

        {/* Report header */}
        <div className="report-header">
          <div>
            <h1 style={{ margin: 0 }}>{report.title || 'Report Detail'}</h1>
            <p className="report-header-meta">
              Patient: {user?.displayName || user?.email || 'Patient'} &bull; Date: {formatDate(report.createdAt)}
            </p>
          </div>
          <div className="report-header-actions">
            <button
              type="button"
              className="btn btn-outline btn-md"
              onClick={() => setSharingPanelOpen(true)}
              aria-label="Share Report"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.4rem' }}>
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share Report
            </button>
            <button
              id="export-doctor-summary-btn"
              type="button"
              className="btn btn-primary btn-md"
              onClick={handleExportPDF}
              title="Export a doctor-ready one-page PDF summary"
              aria-label="Export PDF"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.4rem' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export PDF
            </button>
          </div>
        </div>

        {/* Main content: two-column layout */}
        <div className="report-layout">
          {/* Left column */}
          <div>
            {/* Clinical Summary */}
            <div className="clinical-summary-card">
              <div className="clinical-summary-header">
                <h2>Clinical Summary</h2>
                {interpretation && (
                  <span className="ai-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                    </svg>
                    AI Analysis Ready
                  </span>
                )}
              </div>

              {interpretation ? (
                <p style={{ lineHeight: 1.7, color: 'var(--on-surface)' }}>{interpretation.summary}</p>
              ) : (
                <p style={{ color: 'var(--on-surface-muted)' }}>
                  No AI analysis available yet. Click &ldquo;Review My Report&rdquo; to generate an interpretation.
                </p>
              )}

              {/* Status indicators */}
              <div className="status-indicators">
                <div className="status-indicator status-indicator--success">
                  <svg className="status-indicator-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22,4 12,14.01 9,11.01" />
                  </svg>
                  <div>
                    <div className="status-indicator-label">Critical Markers</div>
                    <div>{normalCount > 0 ? 'Normal Range' : 'No data'}</div>
                  </div>
                </div>
                {flaggedCount > 0 && (
                  <div className="status-indicator status-indicator--warning">
                    <svg className="status-indicator-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <div>
                      <div className="status-indicator-label">Action Required</div>
                      <div>{flaggedCount} flagged result{flaggedCount > 1 ? 's' : ''}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Lab Results & Biomarkers */}
            <div className="card" style={{ padding: 'var(--space-6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
                <h2>Lab Results &amp; Biomarkers</h2>
              </div>

              {report.rows.length > 0 ? (
                <table className="lab-table">
                  <thead>
                    <tr>
                      <th>Biomarker</th>
                      <th>Result</th>
                      <th>Reference Range</th>
                      <th style={{ textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, idx) => {
                      const isFlagged = row.flag === 'high' || row.flag === 'low' || row.flag === 'abnormal';
                      return (
                        <tr key={`${row.test_name}-${idx}`} className={isFlagged ? 'lab-row-flagged' : ''}>
                          <td>
                            <div className="biomarker-name">{row.test_name}</div>
                          </td>
                          <td>
                            <span className={`result-value${isFlagged ? ' flagged' : ''}`}>
                              {String(row.value)}
                            </span>
                            {row.unit && <span className="result-unit">{row.unit}</span>}
                          </td>
                          <td style={{ color: 'var(--on-surface-muted)' }}>{row.reference_range || '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <Badge variant={flagBadgeVariant(row.flag)}>
                              {flagBadgeLabel(row.flag)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: 'var(--on-surface-muted)' }}>No lab results available.</p>
              )}
            </div>

            {/* Biomarker Trends */}
            <div className="card" style={{ padding: 'var(--space-6)' }}>
              <h2>Biomarker Trends</h2>
              {trendsLoading ? <p>Loading trends...</p> : null}
              {!trendsLoading && trendsError ? <p>{trendsError}</p> : null}
              {!trendsLoading && !trendsError && trendItems.length === 0 ? (
                <p style={{ color: 'var(--on-surface-muted)' }}>Not enough prior report data to calculate trends yet.</p>
              ) : null}
              {!trendsLoading && !trendsError && trendItems.length > 0 ? (
                <>
                  <div className="field" style={{ maxWidth: '420px' }}>
                    <label htmlFor="biomarker-filter">Filter biomarkers</label>
                    <input id="biomarker-filter" placeholder="Type biomarker name" value={biomarkerFilterText} onChange={(e) => setBiomarkerFilterText(e.target.value)} />
                  </div>
                  <div className="field" style={{ maxWidth: '420px' }}>
                    <label htmlFor="biomarker-select">Biomarker</label>
                    <select id="biomarker-select" value={selectedTrend?.biomarker_key || ''} onChange={(e) => setSelectedBiomarkerKey(e.target.value)}>
                      {filteredTrendItems.map((item) => (<option key={item.biomarker_key} value={item.biomarker_key}>{item.display_name}</option>))}
                    </select>
                  </div>
                  <div className="field" style={{ maxWidth: '320px' }}>
                    <label htmlFor="trend-language">Trend note language</label>
                    <select id="trend-language" value={trendLanguage} onChange={(e) => setTrendLanguage(e.target.value)}>
                      {LANGUAGE_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                    </select>
                  </div>
                  {loadingTrendTranslations ? <p>Loading translation...</p> : null}
                  {trendTranslationError ? <p>{trendTranslationError}</p> : null}
                  {!selectedTrend ? <p>No biomarkers match your filter.</p> : null}
                  {selectedTrend ? (
                    <>
                      <p>{trendNoteTranslations[selectedTrend.biomarker_key]?.[trendLanguage] || selectedTrend.trend_note}</p>
                      <BiomarkerTrendChart
                        title={selectedTrend.display_name}
                        unit={selectedTrend.unit}
                        points={selectedTrend.sparkline.map((point) => ({ observed_at: point.observed_at, value: point.value }))}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </div>

            {/* Patient Questions */}
            <PatientQuestions reportId={report.id} accessToken={accessToken} onThreadCreated={() => {}} />

            <AuditLogTimeline reportId={report.id} reloadToken={auditReloadToken} />
            <Disclaimer />
          </div>

          {/* Right column — sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Sharing Preferences sidebar card */}
            <div className="sharing-sidebar" data-testid="sharing-card" data-share-state={shareState}>
              <div className="sharing-sidebar-title">Sharing Preferences</div>
              <div className="field">
                <label htmlFor="clinician-email">Clinician Email</label>
                <input
                  id="clinician-email"
                  className="input"
                  value={sharingPreferences.clinicianEmail}
                  onChange={(e) => setSharingPreferences({ ...sharingPreferences, clinicianEmail: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="share-scope">Scope</label>
                <select
                  id="share-scope"
                  className="input"
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
                  className="input"
                  value={new Date(sharingPreferences.expiresAt).toISOString().slice(0, 16)}
                  onChange={(e) => setSharingPreferences({ ...sharingPreferences, expiresAt: new Date(e.target.value).getTime() })}
                />
              </div>
              {/* FR13 include doctor summary PDF */}
              <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--success-container)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginTop: 'var(--space-2)' }}>
                <input
                  id="include-summary-pdf"
                  type="checkbox"
                  checked={includeSummaryPDF}
                  onChange={(e) => setIncludeSummaryPDF(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                />
                <label htmlFor="include-summary-pdf" style={{ cursor: 'pointer', fontSize: 'var(--text-body-sm)', fontWeight: 500 }}>
                  Include Doctor-Ready Summary PDF
                  <span style={{ display: 'block', fontSize: 'var(--text-body-sm)', color: 'var(--on-surface-muted)', fontWeight: 400 }}>
                    Generated locally — never stored on server
                  </span>
                </label>
              </div>
              <button id="share-report-btn" className="btn btn-primary btn-md" style={{ width: '100%', marginTop: 'var(--space-3)' }} onClick={handleShareWithPDF}>
                {sharingPreferences.active ? 'Update Share' : 'Start Sharing'}
              </button>
              {sharingPreferences.active && (
                <button className="btn btn-danger btn-md" onClick={revokeShare} style={{ width: '100%', marginTop: 'var(--space-2)' }}>
                  Revoke
                </button>
              )}
              {statusMessage && <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-body-sm)', textAlign: 'center' }}>{statusMessage}</p>}
            </div>

            {/* Thread View / Intelligence Panel */}
            <div className="intelligence-panel">
              <div className="intelligence-panel-header">
                <div className="intelligence-panel-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Intelligence Panel</div>
                  <div style={{ fontSize: 'var(--text-body-sm)', color: 'var(--on-surface-muted)' }}>Contextual Analysis Assistant</div>
                </div>
              </div>
              <ThreadView
                reportId={report.id}
                accessToken={accessToken}
                onThreadsLoaded={setThreads}
              />
            </div>
          </div>
        </div>

        {/* Sharing Panel (slide-in) */}
        <SharingPreferencesPanel
          open={sharingPanelOpen}
          onClose={() => setSharingPanelOpen(false)}
          onShare={handleShareWithPDF}
          onRevoke={revokeShare}
          clinicianEmail={sharingPreferences.clinicianEmail}
          onClinicianEmailChange={(e) => setSharingPreferences({ ...sharingPreferences, clinicianEmail: e.target.value })}
          scope={sharingPreferences.scope}
          onScopeChange={(e) => setSharingPreferences({ ...sharingPreferences, scope: e.target.value as 'summary' | 'full' })}
          expiresAt={sharingPreferences.expiresAt}
          onExpiresAtChange={(e) => setSharingPreferences({ ...sharingPreferences, expiresAt: new Date(e.target.value).getTime() })}
          shareActive={sharingPreferences.active}
          statusMessage={statusMessage}
        />
      </section>
    </ProtectedView>
  );
}
