'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/store/authStore';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type FindingOut = {
  id: string;
  biomarker_key: string;
  display_name: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  flag: string;
  reference_range_text: string | null;
};

type TrendPoint = {
  report_id: string;
  observed_at: string;
  value: number;
  unit: string | null;
  flag: string;
};

type TrendOut = {
  biomarker_key: string;
  display_name: string;
  unit: string | null;
  direction: string;
  trend_note: string;
  sparkline: TrendPoint[];
};

type ThreadMessageOut = {
  id: string;
  author_user_id: string;
  body: string;
  created_at: string;
};

type ThreadOut = {
  id: string;
  title: string | null;
  status: string;
  messages: ThreadMessageOut[];
};

type ReportView = {
  report_id: string;
  view_scope: 'summary_only' | 'full_report' | 'full_report_with_threads';
  include_doctor_summary: boolean;
  patient: { id: string; display_name: string; email: string; date_of_birth: string | null };
  report_date: string;
  panel_type: string;
  ai_summary: { summary?: string } | null;
  findings: FindingOut[] | null;
  trends: TrendOut[] | null;
  threads: ThreadOut[] | null;
  doctor_summary: { summary?: string } | null;
};

function flagBadgeVariant(flag: string): 'high' | 'low' | 'optimal' | 'attention' | 'normal' {
  if (flag === 'high') return 'high';
  if (flag === 'low') return 'low';
  if (flag === 'normal') return 'optimal';
  return 'attention';
}

function directionBadgeVariant(direction: string): 'optimal' | 'info' | 'attention' {
  if (direction === 'improving') return 'optimal';
  if (direction === 'stable') return 'info';
  return 'attention';
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function formatDob(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(year, month - 1, day),
  );
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('reportx_session');
    return stored ? JSON.parse(stored)?.accessToken ?? null : null;
  } catch {
    return null;
  }
}

export default function ClinicianReportViewPage({ params }: { params: { reportId: string } }) {
  const { status } = useAuth();
  const [view, setView] = useState<ReportView | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replySending, setReplySending] = useState<Record<string, boolean>>({});
  const [replyError, setReplyError] = useState<Record<string, string | null>>({});
  const [localThreads, setLocalThreads] = useState<ThreadOut[]>([]);
  const [selectedTrendKey, setSelectedTrendKey] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setAccessDenied(false);
    setView(null);
    try {
      const token = getToken();
      const res = await fetch(`${BACKEND_URL}/api/v1/clinician/shared-reports/${params.reportId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 403 || !res.ok) { setAccessDenied(true); return; }
      const data: ReportView = await res.json();
      setView(data);
      setLocalThreads(data.threads ?? []);
      if (data.trends && data.trends.length > 0) {
        setSelectedTrendKey(data.trends[0].biomarker_key);
      }
    } catch {
      setAccessDenied(true);
    } finally {
      setLoading(false);
    }
  }, [params.reportId]);

  useEffect(() => {
    if (status === 'authenticated') void loadReport();
  }, [status, loadReport]);

  useEffect(() => {
    const el = bottomRef.current;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth' });
  }, [localThreads]);

  async function sendReply(threadId: string) {
    const text = replyText[threadId]?.trim();
    if (!text || replySending[threadId]) return;
    setReplySending((prev) => ({ ...prev, [threadId]: true }));
    setReplyError((prev) => ({ ...prev, [threadId]: null }));
    try {
      const token = getToken();
      const res = await fetch(`${BACKEND_URL}/api/v1/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || `Error ${res.status}`);
      }
      const msg: ThreadMessageOut = await res.json();
      setLocalThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, messages: [...t.messages, msg] } : t));
      setReplyText((prev) => ({ ...prev, [threadId]: '' }));
    } catch (err: unknown) {
      setReplyError((prev) => ({ ...prev, [threadId]: err instanceof Error ? err.message : 'Failed to send.' }));
    } finally {
      setReplySending((prev) => ({ ...prev, [threadId]: false }));
    }
  }

  if (status === 'unknown' || loading) {
    return (
      <section className="stack" style={{ padding: 'var(--space-8)' }}>
        <p style={{ color: 'var(--on-surface-muted)' }}>Loading report…</p>
      </section>
    );
  }

  if (accessDenied) {
    return (
      <section className="stack" style={{ maxWidth: 680, margin: '0 auto', padding: 'var(--space-12) var(--space-4)', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 'var(--space-4)' }} aria-hidden="true">🔒</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-heading-lg)' }}>Access Denied</h1>
        <p style={{ color: 'var(--on-surface-muted)', marginTop: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
          You do not have an active share for this report, or it has expired or been revoked.
        </p>
        <a href="/clinician/shared-reports" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', background: 'linear-gradient(135deg, var(--primary), var(--primary-container))', color: '#fff', padding: '0.6rem 1.4rem', borderRadius: 'var(--radius-full)', fontWeight: 600, textDecoration: 'none', fontSize: 'var(--text-body-md)' }}>
          ← Back to dashboard
        </a>
      </section>
    );
  }

  if (!view) return null;

  const scopeLabel = view.view_scope === 'summary_only' ? 'Summary only' : view.view_scope === 'full_report' ? 'Full report' : 'Full report + threads';
  const canReply = view.view_scope === 'full_report_with_threads';
  const selectedTrend = view.trends?.find((t) => t.biomarker_key === selectedTrendKey) ?? view.trends?.[0] ?? null;
  const hasSummaryContent = view.ai_summary?.summary || view.doctor_summary?.summary;

  return (
    <div className="report-detail-page" style={{ maxWidth: 1200, margin: '0 auto', padding: 'var(--space-6) var(--space-4)' }}>

      {/* ── Breadcrumb + patient strip ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <a href="/clinician/shared-reports" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--on-surface-muted)', textDecoration: 'none', fontSize: 'var(--text-body-sm)' }}>
          ← Shared Reports
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Badge variant="info">{scopeLabel}</Badge>
          {view.include_doctor_summary && <Badge variant="optimal">Includes doctor summary</Badge>}
        </div>
      </div>

      {/* ── Patient header card (compact 2-col) ── */}
      <Card style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-4)', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--primary-container))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 'var(--text-heading-sm)', fontWeight: 700, flexShrink: 0 }}>
              {view.patient.display_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--text-body-lg)', fontFamily: 'var(--font-display)' }}>{view.patient.display_name}</p>
              <p style={{ margin: 0, color: 'var(--on-surface-muted)', fontSize: 'var(--text-body-sm)' }}>
                {view.patient.email}
                {view.patient.date_of_birth && <> · DOB: {formatDob(view.patient.date_of_birth)}</>}
              </p>
              <p style={{ margin: 0, color: 'var(--on-surface-muted)', fontSize: 'var(--text-body-sm)' }}>
                {view.panel_type} · {formatDate(view.report_date)}
              </p>
            </div>
          </div>
          <a href={`/clinician/patients/${view.patient.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontWeight: 600, fontSize: 'var(--text-body-sm)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Patient Profile
          </a>
        </div>
      </Card>

      {/* ── Summary cards (AI + Doctor) ── */}
      {hasSummaryContent && (
        <div style={{ display: 'grid', gridTemplateColumns: view.ai_summary?.summary && view.doctor_summary?.summary ? '1fr 1fr' : '1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          {view.ai_summary?.summary && (
            <Card accent="blue">
              <p style={{ color: 'var(--on-surface-muted)', fontSize: 'var(--text-label-sm)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-2)' }}>AI Summary</p>
              <p style={{ lineHeight: 1.6, fontSize: 'var(--text-body-sm)', margin: 0 }}>{view.ai_summary.summary}</p>
            </Card>
          )}
          {view.include_doctor_summary && view.doctor_summary?.summary && (
            <Card accent="purple">
              <p style={{ color: 'var(--on-surface-muted)', fontSize: 'var(--text-label-sm)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-2)' }}>Doctor Summary</p>
              <p style={{ lineHeight: 1.6, fontSize: 'var(--text-body-sm)', margin: 0 }}>{view.doctor_summary.summary}</p>
            </Card>
          )}
        </div>
      )}

      {!hasSummaryContent && view.view_scope === 'summary_only' && (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <p style={{ color: 'var(--on-surface-muted)', fontSize: 'var(--text-body-sm)', margin: 0 }}>
            This report was shared with summary-only access. The AI summary will appear here once it has been generated for this report.
          </p>
        </Card>
      )}

      {/* ── Findings + Trend Analysis side-by-side ── */}
      {view.findings !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: view.trends !== null ? '3fr 2fr' : '1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', alignItems: 'start' }}>

          {/* Findings table */}
          <Card>
            <p style={{ fontWeight: 600, fontSize: 'var(--text-body-md)', marginBottom: 'var(--space-3)' }}>Test Results</p>
            {view.findings.length === 0 ? (
              <p style={{ color: 'var(--on-surface-muted)', fontSize: 'var(--text-body-sm)' }}>No findings recorded.</p>
            ) : (
              <div className="results-table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
                <table className="results-data-table" role="table" style={{ fontSize: 'var(--text-body-sm)' }}>
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>Value</th>
                      <th>Range</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.findings.map((finding) => (
                      <tr key={finding.id}>
                        <td className="result-test-name" style={{ fontSize: 'var(--text-body-sm)' }}>{finding.display_name}</td>
                        <td className="result-value-cell">
                          {finding.value_numeric ?? finding.value_text}
                          {finding.unit && <span className="result-unit"> {finding.unit}</span>}
                        </td>
                        <td className="result-ref" style={{ fontSize: 'var(--text-label-sm)' }}>{finding.reference_range_text || '—'}</td>
                        <td><Badge variant={flagBadgeVariant(finding.flag)}>{finding.flag.toUpperCase()}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Trend panel */}
          {view.trends !== null && (
            <Card>
              <p style={{ fontWeight: 600, fontSize: 'var(--text-body-md)', marginBottom: 'var(--space-3)' }}>Trend Analysis</p>
              {view.trends.length === 0 ? (
                <p style={{ color: 'var(--on-surface-muted)', fontSize: 'var(--text-body-sm)' }}>Not enough data yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 420, overflowY: 'auto' }}>
                  {view.trends.map((trend) => (
                    <button
                      key={trend.biomarker_key}
                      type="button"
                      onClick={() => setSelectedTrendKey(trend.biomarker_key)}
                      style={{ textAlign: 'left', padding: 'var(--space-2) var(--space-3)', background: selectedTrendKey === trend.biomarker_key ? 'var(--primary-container)' : 'var(--surface-container-low)', borderRadius: 'var(--radius-sm)', border: selectedTrendKey === trend.biomarker_key ? '1.5px solid var(--primary)' : '1.5px solid transparent', cursor: 'pointer', width: '100%' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trend.display_name}</span>
                        <Badge variant={directionBadgeVariant(trend.direction)}>{trend.direction}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedTrend && (
                <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--surface-container-low)', borderRadius: 'var(--radius-sm)' }}>
                  <p style={{ fontSize: 'var(--text-label-sm)', fontWeight: 600, margin: '0 0 var(--space-1)' }}>{selectedTrend.display_name}</p>
                  <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--on-surface-muted)', margin: 0 }}>{selectedTrend.trend_note}</p>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── Thread panel (full_report_with_threads only) ── */}
      {view.view_scope === 'full_report_with_threads' && (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <p style={{ fontWeight: 600, fontSize: 'var(--text-body-md)', marginBottom: 'var(--space-3)' }}>Conversation Threads</p>
          {localThreads.length === 0 ? (
            <p style={{ color: 'var(--on-surface-muted)', fontSize: 'var(--text-body-sm)' }}>No threads for this report yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--space-4)' }}>
              {localThreads.map((thread) => (
                <div key={thread.id} style={{ padding: 'var(--space-3)', background: 'var(--surface-container-low)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--text-body-sm)' }}>{thread.title || 'Thread'}</span>
                    <Badge variant={thread.status === 'open' ? 'info' : 'normal'}>{thread.status}</Badge>
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    {thread.messages.map((msg) => (
                      <div key={msg.id} style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-body-sm)' }}>
                        <p style={{ margin: 0 }}>{msg.body}</p>
                        <p style={{ margin: '2px 0 0', color: 'var(--on-surface-muted)', fontSize: 'var(--text-label-sm)' }}>{formatDateTime(msg.created_at)}</p>
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                  {canReply && thread.status === 'open' && (
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                      <textarea
                        placeholder="Write a reply…"
                        aria-label={`Reply to ${thread.title || 'thread'}`}
                        rows={2}
                        value={replyText[thread.id] ?? ''}
                        onChange={(e) => setReplyText((prev) => ({ ...prev, [thread.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendReply(thread.id); } }}
                        style={{ flex: 1, resize: 'vertical', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--outline-variant)', background: 'var(--surface)', fontSize: 'var(--text-body-sm)' }}
                      />
                      <button type="button" aria-label="Send reply" className="btn btn-primary btn-sm" disabled={!replyText[thread.id]?.trim() || replySending[thread.id]} onClick={() => void sendReply(thread.id)} style={{ alignSelf: 'flex-end' }}>
                        Send
                      </button>
                    </div>
                  )}
                  {replyError[thread.id] && (
                    <p style={{ color: 'var(--danger)', fontSize: 'var(--text-body-sm)', marginTop: 'var(--space-2)' }}>{replyError[thread.id]}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
