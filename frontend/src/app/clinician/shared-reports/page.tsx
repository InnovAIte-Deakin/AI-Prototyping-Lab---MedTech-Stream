'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/store/authStore';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type DashboardItem = {
  share_id: string;
  report_id: string;
  patient_name: string;
  patient_id: string;
  report_date: string;
  panel_type: string;
  view_scope: string;
  include_doctor_summary: boolean;
  expires_at: string;
  shared_at: string;
};

function scopeLabel(scope: string): string {
  switch (scope) {
    case 'summary_only': return 'Summary only';
    case 'full_report': return 'Full report';
    case 'full_report_with_threads': return 'Full + threads';
    default: return scope;
  }
}

function scopeBadgeVariant(scope: string): 'info' | 'optimal' | 'attention' {
  if (scope === 'summary_only') return 'info';
  if (scope === 'full_report') return 'optimal';
  return 'attention';
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export default function ClinicianDashboardPage() {
  const { user, status } = useAuth();
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stored = localStorage.getItem('reportx_session');
      const token = stored ? JSON.parse(stored)?.accessToken : null;
      const res = await fetch(`${BACKEND_URL}/api/v1/clinician/shared-reports`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.detail || `Error ${res.status}`);
      }
      const data: DashboardItem[] = await res.json();
      setItems(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load shared reports.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void loadDashboard();
  }, [status, loadDashboard]);

  if (status === 'unknown' || loading) {
    return (
      <section className="stack" style={{ padding: 'var(--space-8)' }}>
        <p style={{ color: 'var(--on-surface-muted)' }}>Loading shared reports…</p>
      </section>
    );
  }

  if (!user || user.role !== 'clinician') {
    return (
      <section className="stack" style={{ padding: 'var(--space-8)' }}>
        <h1>Access Denied</h1>
        <p>This page is only accessible to clinicians.</p>
      </section>
    );
  }

  return (
    <section className="stack" style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-8) var(--space-4)' }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-sm)', marginBottom: 'var(--space-2)' }}>
          Shared Reports
        </h1>
        <p style={{ color: 'var(--on-surface-muted)', fontSize: 'var(--text-body-md)' }}>
          Reports your patients have shared with you. Access is scoped and time-limited.
        </p>
      </div>

      {error && (
        <Card>
          <p style={{ color: 'var(--danger)', fontSize: 'var(--text-body-sm)' }}>{error}</p>
        </Card>
      )}

      {!loading && !error && items.length === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--on-surface-muted)' }}>
            <p style={{ fontSize: 'var(--text-body-lg)', marginBottom: 'var(--space-2)' }}>No reports shared with you yet.</p>
            <p style={{ fontSize: 'var(--text-body-sm)' }}>
              When a patient shares their report, it will appear here.
            </p>
          </div>
        </Card>
      )}

      {items.length > 0 && (
        <div className="report-history-table-card" role="region" aria-label="Shared reports table">
          <table className="rh-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Report Date</th>
                <th>Panel / Type</th>
                <th>Access Scope</th>
                <th>Expires</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.share_id}>
                  <td>
                    <a
                      href={`/clinician/patients/${item.patient_id}`}
                      style={{ fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}
                    >
                      {item.patient_name}
                    </a>
                  </td>
                  <td>{formatDate(item.report_date)}</td>
                  <td>
                    <div className="rh-panel">
                      <svg className="rh-panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      {item.panel_type}
                    </div>
                  </td>
                  <td>
                    <Badge variant={scopeBadgeVariant(item.view_scope)}>
                      {scopeLabel(item.view_scope)}
                    </Badge>
                  </td>
                  <td style={{ color: 'var(--on-surface-muted)', fontSize: 'var(--text-body-sm)' }}>
                    {formatDate(item.expires_at)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <a
                      href={`/clinician/shared-reports/${item.report_id}`}
                      aria-label={`Open report for ${item.patient_name}`}
                      className="rh-action-btn"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: 'var(--text-body-sm)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
