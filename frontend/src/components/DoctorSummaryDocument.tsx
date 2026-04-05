'use client';

/**
 * DoctorSummaryDocument — FR13
 *
 * This component renders a print-optimised, one-page doctor-ready summary.
 * It is hidden from normal screen rendering (display:none) and only becomes
 * visible when window.print() is called via @media print rules.
 *
 * The PDF is generated entirely client-side. Nothing is sent to or stored on
 * the server (FR13 requirement).
 */

import React from 'react';

export interface SummaryFinding {
  test_name: string;
  value: string;
  unit?: string;
  flag: string;
  reference_range?: string;
}

export interface SummaryThread {
  title: string | null;
  patientQuestions: string[];
}

export interface DoctorSummaryDocumentProps {
  reportTitle: string;
  reportDate: string;
  patientName: string;
  flaggedFindings: SummaryFinding[];
  allFindings: SummaryFinding[];
  interpretationSummary?: string;
  trendNotes?: string;
  threads: SummaryThread[];
}

function flagColor(flag: string): string {
  switch (flag.toLowerCase()) {
    case 'high':
      return '#dc2626';
    case 'low':
      return '#2563eb';
    case 'abnormal':
      return '#d97706';
    default:
      return '#16a34a';
  }
}

function flagBg(flag: string): string {
  switch (flag.toLowerCase()) {
    case 'high':
      return '#fef2f2';
    case 'low':
      return '#eff6ff';
    case 'abnormal':
      return '#fffbeb';
    default:
      return '#f0fdf4';
  }
}

export function DoctorSummaryDocument({
  reportTitle,
  reportDate,
  patientName,
  flaggedFindings,
  allFindings,
  interpretationSummary,
  trendNotes,
  threads,
}: DoctorSummaryDocumentProps) {
  const patientQuestions = threads.flatMap((t) => t.patientQuestions);

  return (
    <div className="doctor-summary-print" id="doctor-summary-print-root">
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '3px solid #1d4ed8' }}>
        <div>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.25rem' }}>
            ReportX · Doctor-Ready Summary
          </div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#1e3a5f', fontWeight: 700 }}>
            {reportTitle || 'Lab Results Summary'}
          </h1>
          <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: '#374151' }}>
            Patient: <strong>{patientName}</strong> &nbsp;·&nbsp; Report Date: <strong>{reportDate}</strong>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#9ca3af' }}>
          <div>Printed: {new Date().toLocaleDateString()}</div>
          <div style={{ marginTop: '0.2rem', fontStyle: 'italic' }}>Confidential — for treating clinician only</div>
        </div>
      </div>

      {/* ── Flagged Values ── */}
      {flaggedFindings.length > 0 && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#374151', margin: '0 0 0.6rem 0', fontWeight: 700 }}>
            ⚠ Flagged Values
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', border: '1px solid #e2e8f0' }}>Test</th>
                <th style={{ textAlign: 'center', padding: '0.35rem 0.5rem', border: '1px solid #e2e8f0' }}>Result</th>
                <th style={{ textAlign: 'center', padding: '0.35rem 0.5rem', border: '1px solid #e2e8f0' }}>Flag</th>
                <th style={{ textAlign: 'center', padding: '0.35rem 0.5rem', border: '1px solid #e2e8f0' }}>Reference Range</th>
              </tr>
            </thead>
            <tbody>
              {flaggedFindings.map((f, i) => (
                <tr key={i} style={{ backgroundColor: flagBg(f.flag) }}>
                  <td style={{ padding: '0.35rem 0.5rem', border: '1px solid #e2e8f0', fontWeight: 600 }}>{f.test_name}</td>
                  <td style={{ padding: '0.35rem 0.5rem', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    {f.value} {f.unit || ''}
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <span style={{ color: flagColor(f.flag), fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem' }}>{f.flag}</span>
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem', border: '1px solid #e2e8f0', textAlign: 'center', color: '#6b7280' }}>
                    {f.reference_range || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── All Findings (compact) ── */}
      {allFindings.filter(f => !['high','low','abnormal'].includes(f.flag.toLowerCase())).length > 0 && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#374151', margin: '0 0 0.6rem 0', fontWeight: 700 }}>
            ✓ Normal Results
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.3rem', fontSize: '0.78rem' }}>
            {allFindings
              .filter(f => !['high','low','abnormal'].includes(f.flag.toLowerCase()))
              .map((f, i) => (
                <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.3rem 0.5rem' }}>
                  <span style={{ fontWeight: 600 }}>{f.test_name}:</span>{' '}
                  {f.value} {f.unit || ''} <span style={{ color: '#16a34a', fontSize: '0.7rem' }}>✓</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* ── AI Explanation ── */}
      {interpretationSummary && (
        <section style={{ marginBottom: '1.25rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.75rem 1rem' }}>
          <h2 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1d4ed8', margin: '0 0 0.4rem 0', fontWeight: 700 }}>
            🤖 AI Explanation Summary
          </h2>
          <p style={{ margin: 0, fontSize: '0.83rem', color: '#1e3a5f', lineHeight: 1.6 }}>{interpretationSummary}</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.68rem', color: '#6b7280', fontStyle: 'italic' }}>
            AI-generated summary. Please review against patient's full clinical history.
          </p>
        </section>
      )}

      {/* ── Trend Notes ── */}
      {trendNotes && (
        <section style={{ marginBottom: '1.25rem', background: '#fefce8', border: '1px solid #fde047', borderRadius: '6px', padding: '0.75rem 1rem' }}>
          <h2 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a16207', margin: '0 0 0.4rem 0', fontWeight: 700 }}>
            📈 Trend Notes
          </h2>
          <p style={{ margin: 0, fontSize: '0.83rem', color: '#713f12', lineHeight: 1.6 }}>{trendNotes}</p>
        </section>
      )}

      {/* ── Patient Questions ── */}
      {patientQuestions.length > 0 && (
        <section style={{ marginBottom: '1.25rem', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: '6px', padding: '0.75rem 1rem' }}>
          <h2 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7e22ce', margin: '0 0 0.4rem 0', fontWeight: 700 }}>
            💬 Patient's Questions for Clinician
          </h2>
          <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.83rem', color: '#374151', lineHeight: 1.7 }}>
            {patientQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Footer ── */}
      <div style={{ marginTop: '1.5rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#9ca3af' }}>
        <span>Generated by ReportX — AI-assisted health report platform</span>
        <span>Clinician review required before any clinical decisions are made.</span>
      </div>
    </div>
  );
}
