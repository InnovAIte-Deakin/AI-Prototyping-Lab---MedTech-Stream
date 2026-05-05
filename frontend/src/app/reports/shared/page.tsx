'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedView } from '@/components/ProtectedView';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

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
      <section className="shared-reports-shell">
        <div className="notifications-page-header">
          <div>
            <h1 style={{ marginBottom: '0.25rem' }}>Shared Reports</h1>
            <p className="muted-text" style={{ margin: 0 }}>Reports you can access through patient consent.</p>
          </div>
          {focusedItem ? <span className="badge badge-info">Focused report loaded</span> : null}
        </div>

        {loading ? <div className="notifications-loading">Loading shared reports...</div> : null}
        {error ? <div className="notifications-error">{error}</div> : null}

        {!loading && !error ? (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Patient</TH>
                  <TH>Report</TH>
                  <TH>Scope</TH>
                  <TH>Access</TH>
                  <TH>Expires</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {items.map((item) => (
                  <TR key={item.share_id} className={item.report_id === focusedReportId ? 'shared-report-row shared-report-row--focused' : 'shared-report-row'}>
                    <TD>
                      <div>{item.patient.display_name}</div>
                      <div className="muted-text">{item.patient.email}</div>
                    </TD>
                    <TD>
                      <div>{item.report.title || 'Untitled report'}</div>
                      <div className="muted-text">{new Date(item.report.observed_at).toLocaleDateString()}</div>
                    </TD>
                    <TD>{item.scope}</TD>
                    <TD>{item.access_level}</TD>
                    <TD>{new Date(item.expires_at).toLocaleDateString()}</TD>
                    <TD style={{ textAlign: 'right' }}>
                      <Button variant="outline" size="sm" onClick={() => router.push(`/reports/${item.report_id}`)}>
                        Open report
                      </Button>
                    </TD>
                  </TR>
                ))}
                {items.length === 0 ? (
                  <TR>
                    <TD colSpan={6}>
                      <div className="notifications-page-empty">No shared reports available.</div>
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </Card>
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
          <section className="shared-reports-shell">
            <div className="notifications-loading">Loading shared reports...</div>
          </section>
        </ProtectedView>
      )}
    >
      <SharedReportsPageContent />
    </Suspense>
  );
}
