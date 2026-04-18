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
  // Colours pull from the global token palette so they stay coherent with the
  // rest of the interface. Each action has a family, not a primary colour.
  switch (action) {
    case 'created':
      return {
        bg: 'var(--ok-100)',
        border: 'oklch(from var(--ok) l c h / 0.45)',
        dot: 'var(--ok)',
        label: 'oklch(from var(--ok) calc(l - 0.15) c h)',
      };
    case 'revoked':
      return {
        bg: 'var(--alert-100)',
        border: 'oklch(from var(--alert) l c h / 0.4)',
        dot: 'var(--alert)',
        label: 'oklch(from var(--alert) calc(l - 0.15) c h)',
      };
    case 'expired':
      return {
        bg: 'var(--warn-100)',
        border: 'oklch(from var(--warn) l c h / 0.4)',
        dot: 'var(--warn)',
        label: 'oklch(from var(--warn) calc(l - 0.25) c h)',
      };
    case 'view':
      return {
        bg: 'var(--ocean-100)',
        border: 'oklch(from var(--ocean) l c h / 0.4)',
        dot: 'var(--ocean)',
        label: 'oklch(from var(--ocean) calc(l - 0.15) c h)',
      };
    default:
      return {
        bg: 'var(--surface-inset)',
        border: 'var(--border)',
        dot: 'var(--ink-mute)',
        label: 'var(--ink-soft)',
      };
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
    <section className="card" data-testid="audit-log-timeline" aria-labelledby="audit-heading">
      <span className="eyebrow" style={{ marginBottom: 0 }}>
        a quiet record
      </span>
      <h2 id="audit-heading" style={{ margin: '0.2rem 0 0.4rem', fontSize: 'var(--step-2)' }}>
        Sharing activity
      </h2>
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: '1rem' }}>
        Every share, revocation, view, and expiry is written down here, in the order it happened.
        Nothing disappears.
      </p>

      {loading ? <p className="muted">Loading activity…</p> : null}
      {!loading && error ? (
        <p role="alert" className="alert alert-error" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
      {!loading && !error && events.length === 0 ? (
        <p className="muted" style={{ fontStyle: 'italic' }}>
          No one has touched this report yet. When you share it, you will see the trail appear here.
        </p>
      ) : null}

      {events.length > 0 ? (
        <ol
          role="list"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0.5rem 0 0',
            borderLeft: '1px solid var(--rule)',
            paddingLeft: '1.25rem',
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
                  padding: '0.85rem 1rem 0.9rem',
                  marginBottom: '0.75rem',
                  background: accent.bg,
                  borderRadius: '14px',
                  borderLeft: `3px solid ${accent.border}`,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '-1.7rem',
                    top: '1.1rem',
                    width: '0.6rem',
                    height: '0.6rem',
                    borderRadius: '50%',
                    background: accent.dot,
                    boxShadow: '0 0 0 3px var(--paper)',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap',
                    alignItems: 'baseline',
                  }}
                >
                  <strong
                    style={{
                      color: accent.label,
                      fontFamily: 'Fraunces, serif',
                      fontWeight: 500,
                      fontSize: '1.02rem',
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {describeAuditAction(event.action)}
                  </strong>
                  <time
                    dateTime={event.occurred_at}
                    style={{ color: 'var(--ink-mute)', fontSize: '0.82rem', fontFeatureSettings: '"tnum"' }}
                  >
                    {formatTime(event.occurred_at)}
                  </time>
                </div>
                {summary ? (
                  <div style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginTop: '0.3rem' }}>{summary}</div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
