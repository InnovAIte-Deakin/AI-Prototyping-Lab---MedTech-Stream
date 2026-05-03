'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useAuth } from '@/store/authStore';
import { ProtectedView } from '@/components/ProtectedView';
import { fetchReportById, updateReportInHistory } from '@/lib/reportHistory';
import type { ReportHistoryEntry, SharingPreferences, Interpretation, ChatMessage } from '@/lib/reportHistory';
import { ThreadView, ConversationThread } from '@/components/ThreadView';
import { DoctorSummaryDocument, type SummaryFinding, type SummaryThread } from '@/components/DoctorSummaryDocument';
import Disclaimer from '@/components/Disclaimer';
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

export default function ReportDetailPage({ params, searchParams }: { params: { reportId: string }; searchParams?: { panel?: string; threadId?: string } }) {
  const { user } = useAuth();
  const [report, setReport] = useState<ReportHistoryEntry | undefined>(undefined);
  const [sharingPreferences, setSharingPreferences] = useState<SharingPreferences>(defaultSharingPreferences);
  const [statusMessage, setStatusMessage] = useState('');
  const [includeSummaryPDF, setIncludeSummaryPDF] = useState(false);
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [auditReloadToken, setAuditReloadToken] = useState(0);
  const [sharingPanelOpen, setSharingPanelOpen] = useState(false);

  useEffect(() => {
    if (searchParams?.panel === 'sharing') {
      setSharingPanelOpen(true);
    }
  }, [searchParams?.panel]);

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

  // Interpretation panel state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [interpretError, setInterpretError] = useState<string | null>(null);
  const [localInterpretation, setLocalInterpretation] = useState<Interpretation | undefined>(undefined);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
    if (report.interpretation) {
      setLocalInterpretation(report.interpretation);
    }
  }, [report]);

  // Restore saved chat thread when navigating to a report that has prior messages
  useEffect(() => {
    setChatMessages(report?.chatMessages ?? []);
  }, [report?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

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

  // ── Interpretation trigger ──
  async function triggerInterpretation() {
    setIsPanelOpen(true);
    const alreadyHave = localInterpretation || report?.interpretation;
    if (alreadyHave || isInterpreting || !report) return;

    setIsInterpreting(true);
    setInterpretError(null);
    try {
      const response = await fetch(`${backend}/api/v1/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: report.rows.map((row) => ({
            test_name: row.test_name,
            value: row.value,
            unit: row.unit ?? null,
            reference_range: row.reference_range ?? null,
            // 'unknown' is a valid DB enum value but not a clinically meaningful
            // flag for interpretation — normalise to null so the backend accepts it.
            flag: (row.flag && row.flag !== 'unknown') ? row.flag : null,
            confidence: row.confidence,
          })),
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to generate interpretation.');
      }
      const data = await response.json();
      const interp = data.interpretation as Interpretation;
      setLocalInterpretation(interp);
      updateReportInHistory(report.id, { interpretation: interp });
      setReport((prev) => (prev ? { ...prev, interpretation: interp } : prev));
      // Persist to backend so interpretation survives page refresh
      const token = getAccessToken();
      if (token) {
        fetch(`${backend}/api/v1/reports/${report.id}/interpretation`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ interpretation: interp }),
        }).catch(() => { /* non-critical — in-memory store still has it */ });
      }
    } catch (err: any) {
      setInterpretError(err?.message || 'Unable to generate interpretation. Please try again.');
    } finally {
      setIsInterpreting(false);
    }
  }

  // ── Chat send ──
  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || isSendingChat || !report) return;
    setChatInput('');
    const userMsg: ChatMessage = { role: 'user', text };
    const withUser: ChatMessage[] = [...chatMessages, userMsg];
    setChatMessages(withUser);
    setIsSendingChat(true);
    try {
      const activeInterp = localInterpretation || report.interpretation;
      const response = await fetch(`${backend}/api/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          interpretation_context: activeInterp?.summary || '',
          rows: report.rows.map((row) => ({
            test_name: row.test_name,
            value: row.value,
            unit: row.unit ?? null,
            reference_range: row.reference_range ?? null,
            flag: (row.flag && row.flag !== 'unknown') ? row.flag : null,
            confidence: row.confidence,
          })),
        }),
      });
      if (!response.ok) throw new Error('Chat request failed.');
      const data = await response.json();
      const aiMsg: ChatMessage = { role: 'ai', text: data.answer || 'No response received.' };
      const updated: ChatMessage[] = [...withUser, aiMsg];
      setChatMessages(updated);
      updateReportInHistory(report.id, { chatMessages: updated });
      setReport((prev) => prev ? { ...prev, chatMessages: updated } : prev);
    } catch {
      const errMsg: ChatMessage = { role: 'ai', text: 'Sorry, I could not answer that right now. Please try again or consult your clinician.' };
      const updated: ChatMessage[] = [...withUser, errMsg];
      setChatMessages(updated);
      updateReportInHistory(report.id, { chatMessages: updated });
      setReport((prev) => prev ? { ...prev, chatMessages: updated } : prev);
    } finally {
      setIsSendingChat(false);
    }
  }

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

  const activeInterp = localInterpretation || report?.interpretation;
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

  function isSharingError(msg: string) {
    return /fail|unable|error|provide|not found|denied/i.test(msg);
  }

  function getFlagRowClass(flag: string | null | undefined) {
    if (flag === 'high' || flag === 'low' || flag === 'abnormal') return `row-flagged-${flag}`;
    return '';
  }

  function getFlagLabel(flag: string | null | undefined) {
    if (!flag) return 'Unknown';
    return flag.charAt(0).toUpperCase() + flag.slice(1);
  }

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
          interpretationSummary={activeInterp?.summary}
          trendNotes={undefined}
          threads={threadSummaries}
        />
      </div>

      <div className="report-detail-page">

        {/* ── Page header ── */}
        <div className="report-detail-header">
          <a href="/reports" className="back-link">
            ← My Reports
          </a>
          <h1 className="report-detail-title">{report.title || 'Lab Report'}</h1>
          <div className="report-meta-row">
            <span className="meta-chip">
              <span className="meta-chip-label">Saved</span>
              {formatDate(report.createdAt)}
            </span>
            <span className="meta-chip">
              <span className="meta-chip-label">Results</span>
              {report.rows.length} {report.rows.length === 1 ? 'test' : 'tests'}
            </span>
            <button
              type="button"
              className={`meta-chip meta-chip-btn${activeInterp ? ' chip-success' : ''}`}
              onClick={() => void triggerInterpretation()}
              title={activeInterp ? 'View AI interpretation panel' : 'Generate AI interpretation'}
            >
              {activeInterp ? '✓ Interpreted — View' : '⚡ Generate Interpretation'}
            </button>
          </div>
        </div>

        {/* ── Test Results card ── */}
        <div className="report-section-card">
          <div className="card-section-header">
            <div className="card-section-header-inner">
              <div className="card-section-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                  <line x1="9" y1="12" x2="15" y2="12"/>
                  <line x1="9" y1="16" x2="15" y2="16"/>
                </svg>
              </div>
              <div className="card-section-text">
                <p className="card-section-title">Your Test Results</p>
                <p className="card-section-subtitle">Values from your lab report with reference ranges and status flags</p>
              </div>
            </div>
          </div>
          <div className="card-section-body">
            <div className="results-table-wrap">
              <table className="results-data-table">
                <thead>
                  <tr>
                    <th>Test Name</th>
                    <th>Value</th>
                    <th>Reference Range</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, idx) => (
                    <tr key={`${row.test_name}-${idx}`} className={getFlagRowClass(row.flag)}>
                      <td className="result-test-name">{row.test_name}</td>
                      <td className="result-value-cell">
                        {row.value}
                        {row.unit && <span className="result-unit">{row.unit}</span>}
                      </td>
                      <td className="result-ref">{row.reference_range || '—'}</td>
                      <td>
                        <span className={`rd-flag flag-${row.flag || 'unknown'}`}>
                          {getFlagLabel(row.flag)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Interpretation card (shown inline if already interpreted) ── */}
        {activeInterp && (
          <div className="report-section-card">
            <div className="card-section-header">
              <div className="card-section-header-inner">
                <div className="card-section-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                </div>
                <div className="card-section-text">
                  <p className="card-section-title">What This Means</p>
                  <p className="card-section-subtitle">A plain-language summary to help you prepare for your next clinical conversation</p>
                </div>
              </div>
              <button
                type="button"
                className="nav-btn nav-btn-outline"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
                onClick={() => void triggerInterpretation()}
              >
                Open AI chat
              </button>
            </div>
            <div className="card-section-body">
              <p className="interpretation-body">{activeInterp.summary}</p>
            </div>
          </div>
        )}

        <div className="report-header-actions" style={{ margin: '0.75rem 0 1rem' }}>
          <button
            type="button"
            className="btn btn-outline btn-md"
            onClick={() => void triggerInterpretation()}
            aria-label="Review My Report"
          >
            Review My Report
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

        {/* ── Sharing Preferences card ── */}
        <div className="report-section-card">
          <div className="card-section-header">
            <div className="card-section-header-inner">
              <div className="card-section-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"/>
                  <circle cx="6" cy="12" r="3"/>
                  <circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
              </div>
              <div className="card-section-text">
                <p className="card-section-title">Share with Your Clinician</p>
                <p className="card-section-subtitle">Grant temporary, scoped access — you can revoke it at any time</p>
              </div>
            </div>
            {sharingPreferences.active && (
              <span className="sharing-active-badge">
                <span className="sharing-active-dot" />
                Sharing active
              </span>
            )}
          </div>
          <div className="card-section-body">
            <div className="sharing-form-grid">
              <div className="sharing-field sharing-form-full">
                <label htmlFor="clinician-email">Clinician Email</label>
                <input
                  id="clinician-email"
                  type="email"
                  placeholder="clinician@example.com"
                  value={sharingPreferences.clinicianEmail}
                  onChange={(e) => setSharingPreferences({ ...sharingPreferences, clinicianEmail: e.target.value })}
                />
              </div>
              <div className="sharing-field">
                <label htmlFor="share-scope">Access Scope</label>
                <select
                  id="share-scope"
                  value={sharingPreferences.scope}
                  onChange={(e) => setSharingPreferences({ ...sharingPreferences, scope: e.target.value as 'summary' | 'full' })}
                >
                  <option value="summary">Summary only</option>
                  <option value="full">Full report</option>
                </select>
              </div>
              <div className="sharing-field">
                <label htmlFor="share-expiry">Access Expires</label>
                <input
                  id="share-expiry"
                  type="datetime-local"
                  value={new Date(sharingPreferences.expiresAt).toISOString().slice(0, 16)}
                  onChange={(e) => setSharingPreferences({ ...sharingPreferences, expiresAt: new Date(e.target.value).getTime() })}
                />
              </div>
              <div className="sharing-field sharing-form-full">
              {/* FR13 include doctor summary PDF */}
              <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--success-container)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
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
              </div>
            </div>
            <div className="sharing-divider" />
            <div className="sharing-actions">
              <button className="nav-btn nav-btn-primary" onClick={handleShareWithPDF}>
                {sharingPreferences.active ? 'Update Sharing' : 'Start Sharing'}
              </button>
              {sharingPreferences.active && (
                <button className="nav-btn nav-btn-danger" onClick={revokeShare}>
                  Revoke Access
                </button>
              )}
            </div>
            {statusMessage && (
              <p className={`sharing-status-msg ${isSharingError(statusMessage) ? 'msg-error' : 'msg-success'}`}>
                {statusMessage}
              </p>
            )}
          </div>
        </div>

        <AuditLogTimeline reportId={report.id} reloadToken={auditReloadToken} />

        <ThreadView
          reportId={report.id}
          accessToken={accessToken}
          onThreadsLoaded={setThreads}
          focusedThreadId={searchParams?.threadId}
        />

        <Disclaimer />

        <SharingPreferencesPanel
          open={sharingPanelOpen}
          onClose={() => setSharingPanelOpen(false)}
          onShare={handleShareWithPDF}
          onRevoke={sharingPreferences.active ? revokeShare : undefined}
          clinicianEmail={sharingPreferences.clinicianEmail}
          onClinicianEmailChange={(e) => setSharingPreferences({ ...sharingPreferences, clinicianEmail: e.target.value })}
          scope={sharingPreferences.scope}
          onScopeChange={(e) => setSharingPreferences({ ...sharingPreferences, scope: e.target.value as 'summary' | 'full' })}
          expiresAt={sharingPreferences.expiresAt}
          onExpiresAtChange={(e) => setSharingPreferences({ ...sharingPreferences, expiresAt: new Date(e.target.value).getTime() })}
          shareActive={sharingPreferences.active}
          statusMessage={statusMessage}
        />

      </div>

      {/* ── Interpretation Sidebar Panel ── */}
      {isPanelOpen && (
        <aside className="interp-sidebar" role="complementary" aria-label="AI Interpretation Panel">

          {/* Header */}
          <div className="interp-sidebar-header">
            <div className="card-section-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="interp-sidebar-text">
              <p className="interp-sidebar-title">AI Interpretation</p>
              <p className="interp-sidebar-subtitle">Plain-language explanation · Ask follow-up questions below</p>
            </div>
            <button
              type="button"
              className="interp-close-btn"
              onClick={() => setIsPanelOpen(false)}
              aria-label="Close interpretation panel"
            >
              ×
            </button>
          </div>

          {/* Scrollable body */}
          <div className="interp-sidebar-body">
            {isInterpreting && (
              <div className="interp-loading">
                <div className="interp-spinner" />
                <p>Generating your interpretation…</p>
              </div>
            )}

            {interpretError && !isInterpreting && (
              <p className="interp-error">{interpretError}</p>
            )}

            {activeInterp && !isInterpreting && (
              <>
                <div className="interp-section">
                  <p className="interp-section-label">Summary</p>
                  <p className="interp-text">{activeInterp.summary}</p>
                </div>

                {activeInterp.flags && activeInterp.flags.length > 0 && (
                  <div className="interp-section">
                    <p className="interp-section-label">Flagged Results</p>
                    <ul className="interp-flags-list">
                      {activeInterp.flags.map((flag, i) => (
                        <li key={i} className="interp-flag-item">
                          <span className={`rd-flag flag-${flag.severity}`}>{flag.severity}</span>
                          <span><strong>{flag.test_name}</strong> — {flag.note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeInterp.next_steps && activeInterp.next_steps.length > 0 && (
                  <div className="interp-section">
                    <p className="interp-section-label">Next Steps</p>
                    <ol className="interp-steps-list">
                      {activeInterp.next_steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {activeInterp.disclaimer && (
                  <p className="interp-disclaimer">{activeInterp.disclaimer}</p>
                )}
              </>
            )}

            {!activeInterp && !isInterpreting && !interpretError && (
              <div className="interp-loading">
                <p style={{ textAlign: 'center', color: 'var(--muted-ink)', fontSize: '0.875rem' }}>
                  Click the button above to generate your AI interpretation.
                </p>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chat section */}
          <div className="interp-chat">
            <div className="interp-chat-header">Ask a follow-up question</div>

            <div className="interp-chat-messages">
              {chatMessages.length === 0 && (
                <p className="interp-chat-empty">
                  Ask anything about your results or this explanation.
                </p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`chat-bubble chat-bubble-${msg.role}`}>
                  <p>{msg.text}</p>
                </div>
              ))}
              {isSendingChat && (
                <div className="chat-bubble chat-bubble-ai chat-bubble-loading">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              )}
            </div>

            <div className="interp-chat-compose">
              <textarea
                className="interp-chat-input"
                placeholder="Ask about your results…"
                value={chatInput}
                rows={2}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendChatMessage();
                  }
                }}
              />
              <button
                type="button"
                className="interp-send-btn"
                onClick={() => void sendChatMessage()}
                disabled={!chatInput.trim() || isSendingChat}
              >
                Send
              </button>
            </div>
          </div>

        </aside>
      )}
    </ProtectedView>
  );
}
