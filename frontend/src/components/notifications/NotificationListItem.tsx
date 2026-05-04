'use client';

import { Badge } from '@/components/ui/Badge';
import { resolveNotificationHref, type NotificationItem } from '@/lib/notificationsApi';

function formatRelativeTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString();
}

export function NotificationListItem({
  notification,
  onSelect,
}: {
  notification: NotificationItem;
  onSelect?: (notification: NotificationItem) => void;
}) {
  const href = resolveNotificationHref(notification);
  const isUnread = !notification.read;

  return (
    <li className={`notification-item${isUnread ? ' notification-item--unread' : ''}`}>
      <button
        type="button"
        className="notification-item-button"
        onClick={() => {
          if (onSelect) {
            onSelect(notification);
            return;
          }
          if (typeof window !== 'undefined') {
            window.location.href = href;
          }
        }}
      >
        <div className="notification-item-topline">
          <span className="notification-item-title">{notification.message}</span>
          {isUnread ? <Badge variant="attention">New</Badge> : null}
        </div>
        <div className="notification-item-meta">
          <span>{notification.type.replace(/_/g, ' ')}</span>
          <span>{formatRelativeTime(notification.created_at)}</span>
        </div>
      </button>
    </li>
  );
}
