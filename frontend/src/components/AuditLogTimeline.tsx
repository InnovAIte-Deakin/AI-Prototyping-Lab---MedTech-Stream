'use client';

import { useEffect, useState } from 'react';
import {
  fetchReportAuditLog,
  describeAuditAction,
  type AuditEvent,
} from '@/lib/auditLog';

type Props = {
  reportId: string;
  reloadToken?: number;
};

function eventAccent(action: string): { bg: string; border: string; dot: string; label: string } {
  switch (action) {
    case 'created':
      return { bg: '#ecfdf5', border: '#34d399', dot: '#059669', label: '#047857' };
    case 'revoked':
      return { bg: '#fef2f2', border: '#f87171', dot: '#dc2626', label: '#b91c1c' };
    case 'expired':
      return { bg: '#fff7ed', border: '#fb923c', dot: '#c2410c', label: '#9a3412' };
    case 'view':
      return { bg: '#eff6ff', border: '#60a5fa', dot: '#1d4ed8', label: '#1e40af' };
    default:
      return { bg: '#f9fafb', border: '#d1d5db', dot: '#6b7280', label: '#374151' };
  }
}

function formatTime(iso: string): string {
  const ts = new Date(iso);
  if (Number.isNaN(ts.getTime())) return iso;
  return ts.toLocaleString();
}

function contextSummary(event: AuditEvent): string | null {
  const ctx = event.context ?? {};
  const parts: string[] = [];
  if (typeof ctx.grantee_email === 'string') parts.push(`recipient: ${ctx.grantee_email}`);
  if (typeof ctx.scope === 'string') parts.push(`scope: ${ctx.scope}`);
  if (typeof ctx.access_level === 'string') parts.push(`access: ${ctx.access_level}`);
  return parts.length > 0 ? parts.join(' • ') : null;
}

export function AuditLogTimeline({ reportId, reloadToken = 0 }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchReportAuditLog(reportId)
      .then((payload) => {
        if (!cancelled) setEvents(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load audit log.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, reloadToken]);

  return (
    <div className="card" data-testid="audit-log-timeline">
      <h2 style={{ margin: 0 }}>Sharing Activity</h2>
      <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.25rem' }}>
        Every share, revocation, view, and expiry is recorded here in chronological order.
      </p>

      {loading ? <p>Loading activity…</p> : null}
      {!loading && error ? (
        <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>
      ) : null}
      {!loading && !error && events.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No sharing activity recorded for this report yet.</p>
      ) : null}

      {events.length > 0 ? (
        <ol
          role="list"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0.75rem 0 0',
            borderLeft: '2px solid #e5e7eb',
            paddingLeft: '1rem',
          }}
        >
          {events.map((event) => {
            const accent = eventAccent(event.action);
            const summary = contextSummary(event);
            return (
              <li
                key={event.event_id}
                data-testid={`audit-event-${event.action}`}
                style={{
                  position: 'relative',
                  padding: '0.75rem 0.9rem',
                  marginBottom: '0.75rem',
                  background: accent.bg,
                  borderRadius: '8px',
                  borderLeft: `4px solid ${accent.border}`,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '-1.45rem',
                    top: '1rem',
                    width: '0.75rem',
                    height: '0.75rem',
                    borderRadius: '50%',
                    background: accent.dot,
                    boxShadow: '0 0 0 3px #fff',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <strong style={{ color: accent.label }}>{describeAuditAction(event.action)}</strong>
                  <time dateTime={event.occurred_at} style={{ color: '#4b5563', fontSize: '0.85rem' }}>
                    {formatTime(event.occurred_at)}
                  </time>
                </div>
                {summary ? (
                  <div style={{ color: '#374151', fontSize: '0.9rem', marginTop: '0.25rem' }}>{summary}</div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
