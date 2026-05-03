const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export type NotificationItem = {
  id: string;
  recipient_user_id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  resource_type: string;
  resource_id: string;
  thread_id?: string | null;
  report_id?: string | null;
  kind?: string | null;
  title?: string | null;
  payload?: Record<string, unknown> | null;
  read_at?: string | null;
};

export type NotificationListResponse = {
  items: NotificationItem[];
  total_unread: number;
  limit: number;
  offset: number;
};

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('reportx_session');
    if (!raw) return null;
    return JSON.parse(raw)?.accessToken || null;
  } catch {
    return null;
  }
}

async function fetchJson(path: string, init?: RequestInit): Promise<any> {
  const token = getAccessToken();
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return response.json().catch(() => null);
}

function normalizeListResponse(payload: any, limit: number, offset: number): NotificationListResponse {
  if (Array.isArray(payload)) {
    const items = payload as NotificationItem[];
    return {
      items,
      total_unread: items.filter((item) => !item.read).length,
      limit,
      offset,
    };
  }
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    total_unread: Number(payload?.total_unread ?? 0),
    limit: Number(payload?.limit ?? limit),
    offset: Number(payload?.offset ?? offset),
  };
}

export async function fetchNotifications(options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}): Promise<NotificationListResponse> {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (options.unreadOnly) {
    query.set('unread_only', 'true');
  }
  const payload = await fetchJson(`/api/v1/notifications?${query.toString()}`);
  return normalizeListResponse(payload, limit, offset);
}

export async function fetchUnreadCount(): Promise<number> {
  const payload = await fetchJson('/api/v1/notifications/unread-count');
  return Number(payload?.unread ?? 0);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await fetchJson(`/api/v1/notifications/${notificationId}/read`, {
    method: 'PATCH',
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetchJson('/api/v1/notifications/read-all', {
    method: 'PATCH',
  });
}

export function resolveNotificationHref(notification: NotificationItem): string {
  const reportId = notification.report_id || (notification.payload?.report_id as string | undefined) || notification.resource_id;
  const threadId = notification.thread_id || (notification.payload?.thread_id as string | undefined);
  const type = notification.type;

  if (type === 'report_shared_confirmed' || type === 'share_revocation_confirmed' || type === 'share_expiring_soon') {
    return reportId ? `/reports/${reportId}?panel=sharing` : '/reports';
  }

  if (type === 'clinician_viewed_report') {
    return reportId ? `/reports/${reportId}` : '/reports';
  }

  if (type === 'clinician_replied_in_thread' || type === 'patient_message_in_thread' || type === 'thread_reply') {
    return reportId && threadId ? `/reports/${reportId}?threadId=${threadId}` : reportId ? `/reports/${reportId}` : '/reports';
  }

  if (type === 'new_report_shared' || type === 'share_revoked' || type === 'share_expiry_warning' || type === 'share_expired') {
    return reportId ? `/reports/shared?reportId=${reportId}` : '/reports/shared';
  }

  return '/notifications';
}
