'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/authStore';
import { ProtectedView } from '@/components/ProtectedView';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ThreadView } from '@/components/ThreadView';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

type Finding = {
  id: string;
  biomarker_key: string;
  display_name: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  flag: string | null;
  reference_range_text: string | null;
};

type SharedReportData = {
  share: {
    share_id: string;
    scope: string;
    access_level: string;
    expires_at: string;
    include_doctor_summary?: boolean;
  };
  patient: {
    id: string;
    email: string;
    display_name: string;
    date_of_birth?: string;
  };
  report: {
    id: string;
    title: string | null;
    created_at: string;
    observed_at: string;
    interpretation?: { summary: string } | null;
    findings: Finding[];
  };
};

function getAccessToken() {
  if (typeof window === 'undefined') return '';
  try {
    return JSON.parse(window.localStorage.getItem('reportx_session') || '{}')?.accessToken || '';
  } catch {
    return '';
  }
}

function flagBadgeVariant(flag: string | null | undefined): 'high' | 'low' | 'optimal' | 'attention' {
  if (!flag || flag === 'normal') return 'optimal';
  if (flag === 'high') return 'high';
  if (flag === 'low') return 'low';
  return 'attention';
}

function flagBadgeLabel(flag: string | null | undefined): string {
  if (!flag || flag === 'normal') return 'OPTIMAL';
  return flag.toUpperCase();
}

export default function ClinicianReportViewPage({ params }: any) {
  const { user } = useAuth();
  const [data, setData] = useState<SharedReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSharedReport() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${BACKEND_URL}/api/v1/reports/shared-reports/${params.reportId}`, {
          headers: { Authorization: `Bearer ${getAccessToken()}` },
        });
        if (!response.ok) {
          throw new Error('Unable to load this shared report. The share may have expired or been revoked.');
        }
        const payload = await response.json();
        setData(payload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load shared report.');
      } finally {
        setLoading(false);
      }
    }

    if (params.reportId) {
      void loadSharedReport();
    }
  }, [params.reportId]);

  if (!user) {
    return <ProtectedView><div>Loading...</div></ProtectedView>;
  }

  if (loading) {
    return (
      <ProtectedView>
        <section className="clinician-report-view">
          <div className="clinician-dashboard-loading">
            <div className="clinician-loading-spinner" />
            <p>Loading shared report...</p>
          </div>
        </section>
      </ProtectedView>
    );
  }

  if (error || !data) {
    return (
      <ProtectedView>
        <section className="clinician-report-view">
          <div className="clinician-report-breadcrumb">
            <a href="/reports/shared">Shared Reports</a>
            <span className="breadcrumb-sep">&rsaquo;</span>
            <span>Report</span>
          </div>
          <div className="clinician-dashboard-error">
            <p>{error || 'Report not found.'}</p>
            <Button variant="outline" onClick={() => window.location.href = '/reports/shared'}>
              Back to Shared Reports
            </Button>
          </div>
        </section>
      </ProtectedView>
    );
  }

  const { share, patient, report } = data;
  const scope = share.scope;
  const showFindings = scope === 'full_report' || scope === 'full_report_with_threads';
  const showThreads = scope === 'full_report_with_threads';
  const showDoctorSummary = share.include_doctor_summary === true;

  const flaggedCount = report.findings.filter(
    (f) => f.flag === 'high' || f.flag === 'low' || f.flag === 'abnormal'
  ).length;

  const accessToken = getAccessToken();

  return (
    <ProtectedView>
      <section className="clinician-report-view">

        {/* Breadcrumb */}
        <div className="clinician-report-breadcrumb">
          <a href="/reports/shared">Shared Reports</a>
          <span className="breadcrumb-sep">&rsaquo;</span>
          <span>{report.title || 'Lab Report'}</span>
        </div>

        {/* Patient profile header */}
        <div className="clinician-report-header">
          <div className="clinician-report-header-left">
            <div className="clinician-patient-avatar clinician-patient-avatar--lg">
              {patient.display_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="clinician-report-title">{report.title || 'Lab Report'}</h1>
              <div className="clinician-report-patient-info">
                <span className="clinician-patient-name-lg">{patient.display_name}</span>
                {patient.date_of_birth ? (
                  <span className="clinician-patient-dob">
                    DOB: {new Date(patient.date_of_birth).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </span>
                ) : null}
                <span className="clinician-report-date-label">
                  Report Date: {new Date(report.observed_at).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </span>
              </div>
            </div>
          </div>
          <div className="clinician-report-header-right">
            <Badge variant={scopeBadgeVariant(scope)}>
              {formatScopeLabel(scope)}
            </Badge>
            <span className="clinician-expiry-label">
              Expires {new Date(share.expires_at).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
              })}
            </span>
          </div>
        </div>

        {/* Clinical Summary — always shown */}
        {report.interpretation?.summary ? (
          <div className="clinician-summary-card">
            <div className="clinician-summary-accent" />
            <div className="clinician-summary-content">
              <div className="clinician-summary-header">
                <h2 className="clinician-summary-title">Clinical Summary</h2>
                <Badge variant="info">AI Analysis</Badge>
              </div>
              <p className="clinician-summary-text">{report.interpretation.summary}</p>
              {showFindings ? (
                <div className="clinician-status-indicators">
                  <div className="clinician-status-card clinician-status-normal">
                    <span className="clinician-status-icon">&#10003;</span>
                    <div>
                      <span className="clinician-status-label">Normal Results</span>
                      <span className="clinician-status-count">{report.findings.length - flaggedCount}</span>
                    </div>
                  </div>
                  {flaggedCount > 0 ? (
                    <div className="clinician-status-card clinician-status-flagged">
                      <span className="clinician-status-icon">&#9888;</span>
                      <div>
                        <span className="clinician-status-label">Flagged Results</span>
                        <span className="clinician-status-count">{flaggedCount}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="clinician-summary-card">
            <div className="clinician-summary-accent" />
            <div className="clinician-summary-content">
              <h2 className="clinician-summary-title">Clinical Summary</h2>
              <p className="clinician-summary-text muted-text">No AI interpretation is available for this report.</p>
            </div>
          </div>
        )}

        {/* Doctor Summary — conditional on include_doctor_summary flag */}
        {showDoctorSummary ? (
          <div className="clinician-doctor-summary-card">
            <h2 className="clinician-doctor-summary-title">Doctor Summary</h2>
            <p className="clinician-doctor-summary-text">
              {report.interpretation?.summary || 'Clinical summary data is included for physician review.'}
            </p>
            {showFindings && flaggedCount > 0 ? (
              <div className="clinician-doctor-flagged">
                <strong>Flagged biomarkers ({flaggedCount}):</strong>
                <ul>
                  {report.findings
                    .filter((f) => f.flag === 'high' || f.flag === 'low' || f.flag === 'abnormal')
                    .map((f) => (
                      <li key={f.id}>
                        {f.display_name}: {f.value_numeric ?? f.value_text} {f.unit || ''} — <Badge variant={flagBadgeVariant(f.flag)}>{flagBadgeLabel(f.flag)}</Badge>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Lab Results table — only for full_report and full_report_with_threads */}
        {showFindings ? (
          <div className="clinician-lab-section">
            <h2 className="clinician-lab-heading">Lab Results & Biomarkers</h2>
            <div className="clinician-lab-table-wrap">
              <table className="clinician-lab-table">
                <thead>
                  <tr>
                    <th>Biomarker</th>
                    <th>Result</th>
                    <th>Reference Range</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.findings.map((finding) => (
                    <tr
                      key={finding.id}
                      className={
                        finding.flag === 'high' || finding.flag === 'low' || finding.flag === 'abnormal'
                          ? 'clinician-lab-row clinician-lab-row--flagged'
                          : 'clinician-lab-row'
                      }
                    >
                      <td>
                        <div className="clinician-biomarker-name">{finding.display_name}</div>
                      </td>
                      <td>
                        <span className={finding.flag === 'high' || finding.flag === 'low' ? 'clinician-value-flagged' : ''}>
                          {finding.value_numeric ?? finding.value_text ?? '—'}
                        </span>
                        {finding.unit ? <span className="clinician-value-unit"> {finding.unit}</span> : null}
                      </td>
                      <td className="clinician-ref-range">
                        {finding.reference_range_text || '—'}
                      </td>
                      <td>
                        <Badge variant={flagBadgeVariant(finding.flag)}>
                          {flagBadgeLabel(finding.flag)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* Threads panel — only for full_report_with_threads */}
        {showThreads ? (
          <div className="clinician-threads-section">
            <h2 className="clinician-threads-heading">Conversation Threads</h2>
            <ThreadView
              reportId={report.id}
              accessToken={accessToken}
            />
          </div>
        ) : null}

      </section>
    </ProtectedView>
  );
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
