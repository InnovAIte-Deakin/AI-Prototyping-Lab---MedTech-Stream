'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/store/authStore';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { BiomarkerTrendChart } from '@/components/BiomarkerTrendChart';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type PatientProfile = {
  id: string;
  display_name: string;
  email: string;
  date_of_birth: string | null;
};

type SharedReportSummary = {
  share_id: string;
  report_id: string;
  panel_type: string;
  report_date: string;
  view_scope: string;
  include_doctor_summary: boolean;
  expires_at: string;
  shared_at: string;
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

type ThreadMessage = {
  id: string;
  author_user_id: string;
  body: string;
  created_at: string;
};

type PatientSummaryThread = {
  report_id: string;
  thread_id: string;
  title: string | null;
  status: string;
  messages: ThreadMessage[];
};

type PatientSummary = {
  patient: PatientProfile;
  shared_reports: SharedReportSummary[];
  trends: TrendOut[] | null;
  threads: PatientSummaryThread[];
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

function formatDob(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(year, month - 1, day),
  );
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function scopeLabel(scope: string): string {
  if (scope === 'summary_only') return 'Summary only';
  if (scope === 'full_report') return 'Full report';
  if (scope === 'full_report_with_threads') return 'Full + threads';
  return scope;
}

function scopeBadgeVariant(scope: string): 'info' | 'optimal' | 'attention' {
  if (scope === 'summary_only') return 'info';
  if (scope === 'full_report') return 'optimal';
  return 'attention';
}

function directionBadgeVariant(direction: string): 'optimal' | 'info' | 'attention' {
  if (direction === 'improving') return 'optimal';
  if (direction === 'stable') return 'info';
  return 'attention';
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

export default function ClinicianPatientProfilePage({ params }: { params: { patientId: string } }) {
  const { status } = useAuth();
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedTrendKey, setSelectedTrendKey] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setAccessDenied(false);
    setSummary(null);
    try {
      const token = getToken();
      const res = await fetch(`${BACKEND_URL}/api/v1/clinician/patients/${params.patientId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { setAccessDenied(true); return; }
      const data: PatientSummary = await res.json();
      setSummary(data);
      const chartable = data.trends?.filter((t) => t.sparkline.length >= 2) ?? [];
      if (chartable.length > 0) setSelectedTrendKey(chartable[0].biomarker_key);
    } catch {
      setAccessDenied(true);
    } finally {
      setLoading(false);
    }
  }, [params.patientId]);

  useEffect(() => {
    if (status === 'authenticated') void loadSummary();
  }, [status, loadSummary]);

  if (status === 'unknown' || loading) {
    return (
      <section className="stack" style={{ padding: 'var(--space-8)' }}>
        <p style={{ color: 'var(--on-surface-muted)' }}>Loading patient profile…</p>
      </section>
    );
  }

  if (accessDenied) {
    return (
      <section className="stack" style={{ maxWidth: 680, margin: '0 auto', padding: 'var(--space-12) var(--space-4)', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 'var(--space-4)' }} aria-hidden="true">🔒</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-heading-lg)' }}>Access Denied</h1>
        <p style={{ color: 'var(--on-surface-muted)', marginTop: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
          You do not have an active share with this patient.
        </p>
        <a href="/clinician/shared-reports" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', background: 'linear-gradient(135deg, var(--primary), var(--primary-container))', color: '#fff', padding: '0.6rem 1.4rem', borderRadius: 'var(--radius-full)', fontWeight: 600, textDecoration: 'none', fontSize: 'var(--text-body-md)' }}>
          ← Back to dashboard
        </a>
      </section>
    );
  }

  if (!summary) return null;

  const { patient, shared_reports, trends, threads } = summary;
  const chartableTrends = trends?.filter((t) => t.sparkline.length >= 2) ?? [];
  const allTrends = trends ?? [];
  const selectedTrend = allTrends.find((t) => t.biomarker_key === selectedTrendKey) ?? null;
  const hasTrends = allTrends.length > 0;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'var(--space-5) var(--space-4)' }}>

      {/* ── Breadcrumb ── */}
      <a href="/clinician/shared-reports" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--on-surface-muted)', marginBottom: 'var(--space-4)', textDecoration: 'none', fontSize: 'var(--text-body-sm)' }}>
        ← Shared Reports
      </a>

      {/* ── Patient header (compact single row) ── */}
      <Card style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--primary-container))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 'var(--text-heading-sm)', fontWeight: 700, flexShrink: 0 }}>
            {patient.display_name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-heading-md)', margin: 0, lineHeight: 1.2 }}>
              {patient.display_name}
            </h1>
            <p style={{ margin: '2px 0 0', color: 'var(--on-surface-muted)', fontSize: 'var(--text-body-sm)' }}>
              {patient.email}
              {patient.date_of_birth && <> · DOB: {formatDob(patient.date_of_birth)}</>}
              {' · '}{shared_reports.length} shared report{shared_reports.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </Card>

      {/* ── Main 2-column: Reports table (left) + Trend panel (right) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: hasTrends ? '1fr 1fr' : '1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', alignItems: 'start' }}>

        {/* Left: Shared reports table */}
        <Card style={{ padding: 'var(--space-4)' }}>
          <p style={{ fontWeight: 600, fontSize: 'var(--text-body-md)', marginBottom: 'var(--space-3)', marginTop: 0 }}>
            Shared Reports
          </p>
          {shared_reports.length === 0 ? (
            <p style={{ color: 'var(--on-surface-muted)', fontSize: 'var(--text-body-sm)' }}>No reports currently shared.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--on-surface-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Panel</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--on-surface-muted)', fontWeight: 600 }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--on-surface-muted)', fontWeight: 600 }}>Scope</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--on-surface-muted)', fontWeight: 600 }}>Expires</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }} />
                  </tr>
                </thead>
                <tbody>
                  {shared_reports.map((report) => (
                    <tr key={report.share_id} style={{ borderBottom: '1px solid var(--surface-container-low)' }}>
                      <td style={{ padding: '8px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={report.panel_type}>
                        {report.panel_type}
                      </td>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{formatDate(report.report_date)}</td>
                      <td style={{ padding: '8px' }}>
                        <Badge variant={scopeBadgeVariant(report.view_scope)}>{scopeLabel(report.view_scope)}</Badge>
                      </td>
                      <td style={{ padding: '8px', color: 'var(--on-surface-muted)', whiteSpace: 'nowrap' }}>{formatDate(report.expires_at)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <a href={`/clinician/shared-reports/${report.report_id}`} style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          Open →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Right: Trend chart + trend list */}
        {hasTrends && (
          <Card style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <p style={{ fontWeight: 600, fontSize: 'var(--text-body-md)', margin: 0 }}>Biomarker Trends</p>
              {chartableTrends.length > 0 && (
                <select
                  className="input"
                  style={{ fontSize: 'var(--text-body-sm)', padding: '4px 8px', maxWidth: 200 }}
                  value={selectedTrendKey ?? ''}
                  onChange={(e) => setSelectedTrendKey(e.target.value)}
                  aria-label="Select biomarker"
                >
                  {chartableTrends.map((t) => (
                    <option key={t.biomarker_key} value={t.biomarker_key}>
                      {t.display_name}{t.unit ? ` (${t.unit})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Chart */}
            {selectedTrend && selectedTrend.sparkline.length >= 2 ? (
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <BiomarkerTrendChart
                  title={selectedTrend.display_name}
                  unit={selectedTrend.unit}
                  points={selectedTrend.sparkline.map((p) => ({
                    observed_at: typeof p.observed_at === 'string' ? p.observed_at : new Date(p.observed_at).toISOString(),
                    value: p.value,
                  }))}
                />
                <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--on-surface-muted)', margin: 'var(--space-2) 0 0', lineHeight: 1.5 }}>
                  {selectedTrend.trend_note}
                </p>
              </div>
            ) : selectedTrend ? (
              <p style={{ fontSize: 'var(--text-body-sm)', color: 'var(--on-surface-muted)', marginBottom: 'var(--space-3)' }}>
                Need at least 2 data points to chart {selectedTrend.display_name}.
              </p>
            ) : null}

            {/* Compact trend list table */}
            <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 'var(--space-2)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--outline-variant)', position: 'sticky', top: 0, background: 'var(--surface)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--on-surface-muted)', fontWeight: 600 }}>Biomarker</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--on-surface-muted)', fontWeight: 600 }}>Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {allTrends.map((trend) => (
                    <tr
                      key={trend.biomarker_key}
                      onClick={() => chartableTrends.some((t) => t.biomarker_key === trend.biomarker_key) && setSelectedTrendKey(trend.biomarker_key)}
                      style={{
                        borderBottom: '1px solid var(--surface-container-low)',
                        cursor: chartableTrends.some((t) => t.biomarker_key === trend.biomarker_key) ? 'pointer' : 'default',
                        background: selectedTrendKey === trend.biomarker_key ? 'var(--primary-container)' : undefined,
                      }}
                    >
                      <td style={{ padding: '6px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selectedTrendKey === trend.biomarker_key ? 600 : 400 }}>
                        {trend.display_name}
                        {trend.unit && <span style={{ color: 'var(--on-surface-muted)', fontWeight: 400 }}> ({trend.unit})</span>}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <Badge variant={directionBadgeVariant(trend.direction)}>{trend.direction}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* ── Conversation threads (2-column grid) ── */}
      {threads.length > 0 && (
        <Card style={{ padding: 'var(--space-4)' }}>
          <p style={{ fontWeight: 600, fontSize: 'var(--text-body-md)', marginBottom: 'var(--space-3)', marginTop: 0 }}>
            Conversation Threads
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--space-3)' }}>
            {threads.map((thread) => (
              <div key={thread.thread_id} style={{ padding: 'var(--space-3)', background: 'var(--surface-container-low)', borderRadius: 'var(--radius-md)' }}>
                {/* Thread header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-body-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {thread.title || 'Thread'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
                    <Badge variant={thread.status === 'open' ? 'info' : 'normal'}>{thread.status}</Badge>
                    <a href={`/clinician/shared-reports/${thread.report_id}`} style={{ fontSize: 'var(--text-label-sm)', color: 'var(--primary)', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      Report →
                    </a>
                  </div>
                </div>

                {/* Messages (capped height, scrollable) */}
                <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {thread.messages.length === 0 ? (
                    <p style={{ color: 'var(--on-surface-muted)', fontSize: 'var(--text-body-sm)', margin: 0 }}>No messages yet.</p>
                  ) : (
                    thread.messages.map((msg) => (
                      <div key={msg.id} style={{ padding: 'var(--space-2)', background: 'var(--surface)', borderRadius: 'var(--radius-sm)' }}>
                        <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', lineHeight: 1.5 }}>{msg.body}</p>
                        <p style={{ margin: '2px 0 0', color: 'var(--on-surface-muted)', fontSize: 'var(--text-label-sm)' }}>
                          {formatDateTime(msg.created_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
