'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedView } from '@/components/ProtectedView';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatLocalDate, formatUtcDate } from '@/lib/dateFormatting';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type SharedReportRow = {
  share_id: string;
  report_id: string;
  report: {
    id: string;
    title: string | null;
    created_at: string;
    observed_at: string;
    findings: unknown[];
  };
  patient: {
    id: string;
    email: string;
    display_name: string;
  };
  scope: string;
  access_level: string;
  shared_at: string;
  expires_at: string;
};

function getAccessToken() {
  if (typeof window === 'undefined') return '';
  try {
    return JSON.parse(window.localStorage.getItem('reportx_session') || '{}')?.accessToken || '';
  } catch {
    return '';
  }
}

function formatScopeLabel(scope: string): string {
  switch (scope) {
    case 'summary_only': return 'Summary Only';
    case 'full_report': return 'Full Report';
    case 'full_report_with_threads': return 'Full Report + Threads';
    default: return scope.replace(/_/g, ' ');
  }
}

function scopeBadgeVariant(scope: string): 'info' | 'optimal' | 'attention' {
  if (scope === 'summary_only') return 'info';
  if (scope === 'full_report_with_threads') return 'optimal';
  return 'optimal';
}

function SharedReportsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedReportId = searchParams.get('reportId');
  const [items, setItems] = useState<SharedReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${BACKEND_URL}/api/v1/reports/shared-reports`, {
          headers: { Authorization: `Bearer ${getAccessToken()}` },
        });
        if (!response.ok) {
          throw new Error('Unable to load shared reports.');
        }
        const payload = await response.json();
        setItems(Array.isArray(payload) ? payload : []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load shared reports.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const focusedItem = useMemo(() => items.find((item) => item.report_id === focusedReportId) ?? null, [items, focusedReportId]);

  return (
    <ProtectedView>
      <section className="clinician-dashboard">
        {/* Page header */}
        <div className="clinician-dashboard-header">
          <div>
            <h1 className="clinician-dashboard-title">Shared Reports</h1>
            <p className="clinician-dashboard-subtitle">
              Reports shared with you by patients through secure consent.
              {items.length > 0 && !loading ? ` You have ${items.length} active ${items.length === 1 ? 'share' : 'shares'}.` : ''}
            </p>
          </div>
          {focusedItem ? <Badge variant="info">Viewing shared report</Badge> : null}
        </div>

        {loading ? (
          <div className="clinician-dashboard-loading">
            <div className="clinician-loading-spinner" />
            <p>Loading shared reports...</p>
          </div>
        ) : null}

        {error ? (
          <div className="clinician-dashboard-error">
            <p>{error}</p>
          </div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="clinician-dashboard-empty">
            <div className="clinician-empty-icon" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <h2 className="clinician-empty-title">No reports have been shared with you yet</h2>
            <p className="clinician-empty-text">
              When patients share their lab reports with you, they will appear here.
              Shares are time-limited and can be revoked by the patient at any time.
            </p>
          </div>
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <div className="clinician-reports-table-wrap">
            <table className="clinician-reports-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Report</th>
                  <th>Report Date</th>
                  <th>Share Scope</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.share_id}
                    className={item.report_id === focusedReportId ? 'clinician-row clinician-row--focused' : 'clinician-row'}
                  >
                    <td>
                      <div className="clinician-patient-cell">
                        <div className="clinician-patient-avatar">
                          {item.patient.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="clinician-patient-name">{item.patient.display_name}</div>
                          <div className="clinician-patient-email">{item.patient.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="clinician-report-title">{item.report.title || 'Untitled Report'}</div>
                    </td>
                    <td>
                      <div className="clinician-report-date">
                        {formatLocalDate(item.report.observed_at)}
                      </div>
                    </td>
                    <td>
                      <Badge variant={scopeBadgeVariant(item.scope)}>
                        {formatScopeLabel(item.scope)}
                      </Badge>
                    </td>
                    <td>
                      <div className="clinician-expiry-date">
                        {formatUtcDate(item.expires_at)}
                      </div>
                    </td>
                    <td>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => router.push(`/reports/shared/${item.report_id}`)}
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </ProtectedView>
  );
}

export default function SharedReportsPage() {
  return (
    <Suspense
      fallback={(
        <ProtectedView>
          <section className="clinician-dashboard">
            <div className="clinician-dashboard-loading">
              <div className="clinician-loading-spinner" />
              <p>Loading shared reports...</p>
            </div>
          </section>
        </ProtectedView>
      )}
    >
      <SharedReportsPageContent />
    </Suspense>
  );
}
