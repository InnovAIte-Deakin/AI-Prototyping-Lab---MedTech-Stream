export type AuditAction = 'created' | 'revoked' | 'expired' | 'view' | string;

export type AuditEvent = {
  event_id: string;
  action: AuditAction;
  occurred_at: string;
  context: Record<string, unknown>;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function getAccessToken(): string | null {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem('reportx_session');
    if (!raw) return null;
    return JSON.parse(raw)?.accessToken ?? null;
  } catch {
    return null;
  }
}

export async function fetchReportAuditLog(reportId: string): Promise<AuditEvent[]> {
  if (!reportId?.trim()) {
    throw new Error('reportId is required');
  }
  const token = getAccessToken();
  if (!token) {
    throw new Error('User is not authenticated.');
  }

  const response = await fetch(
    `${BACKEND_URL}/api/v1/audit/reports/${encodeURIComponent(reportId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Audit log request failed: ${response.status} ${text}`);
  }
  const data = (await response.json()) as AuditEvent[];
  // Defensive copy + chronological sort (oldest first) so the UI timeline is deterministic.
  return [...data].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
}

export function describeAuditAction(action: string): string {
  switch (action) {
    case 'created':
      return 'Share created';
    case 'revoked':
      return 'Share revoked';
    case 'expired':
      return 'Share expired';
    case 'view':
      return 'Clinician viewed report';
    default:
      return action.replace(/_/g, ' ');
  }
}

export type ShareLifecycleState = 'active' | 'expired' | 'revoked' | 'inactive';

export function shareStateFrom(
  prefs: { active?: boolean; expiresAt?: number } | undefined,
  now: number = Date.now(),
): ShareLifecycleState {
  if (!prefs) return 'inactive';
  if (!prefs.active) return 'inactive';
  if (prefs.expiresAt && prefs.expiresAt < now) return 'expired';
  return 'active';
}
