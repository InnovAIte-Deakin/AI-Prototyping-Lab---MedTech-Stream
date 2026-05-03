'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedView } from '@/components/ProtectedView';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/store/authStore';
import { useNotifications } from '@/store/notificationsStore';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, resolveNotificationHref, type NotificationItem } from '@/lib/notificationsApi';
import { NotificationListItem } from '@/components/notifications/NotificationListItem';

function getAccessToken() {
  if (typeof window === 'undefined') return '';
  try {
    return JSON.parse(window.localStorage.getItem('reportx_session') || '{}')?.accessToken || '';
  } catch {
    return '';
  }
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const { refreshUnreadCount } = useNotifications();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 20;

  const typeOptions = useMemo(() => {
    const values = new Set(items.map((item) => item.type));
    return ['all', ...Array.from(values).sort()];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === 'unread' && item.read) return false;
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      return true;
    });
  }, [filter, items, typeFilter]);

  const loadNotifications = useCallback(async (nextOffset = 0, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchNotifications({
        unreadOnly: filter === 'unread',
        limit,
        offset: nextOffset,
      });
      setItems((current) => (append ? [...current, ...response.items] : response.items));
      setOffset(nextOffset);
      setHasMore(response.items.length === limit);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load notifications.');
      if (!append) {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, [filter, limit]);

  useEffect(() => {
    if (!user) return;
    void loadNotifications(0, false);
  }, [loadNotifications, user]);

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    await refreshUnreadCount();
    await loadNotifications(0, false);
  };

  const handleMarkRead = async (notification: NotificationItem) => {
    await markNotificationRead(notification.id);
    await refreshUnreadCount();
    setItems((current) => current.map((item) => (item.id === notification.id ? { ...item, read: true, read_at: new Date().toISOString() } : item)));
    window.location.href = resolveNotificationHref(notification);
  };

  return (
    <ProtectedView>
      <section className="notifications-page-shell">
        <div className="notifications-page-header">
          <div>
            <h1 style={{ marginBottom: '0.25rem' }}>Notifications</h1>
            <p className="muted-text" style={{ margin: 0 }}>Follow up on report sharing, replies, and clinician activity.</p>
          </div>
          <Button variant="outline" onClick={() => void handleMarkAllRead()} disabled={items.length === 0}>
            Mark all read
          </Button>
        </div>

        <Card className="notifications-page-toolbar">
          <div className="notifications-page-filters">
            <Button variant={filter === 'all' ? 'primary' : 'outline'} size="sm" onClick={() => setFilter('all')}>
              All
            </Button>
            <Button variant={filter === 'unread' ? 'primary' : 'outline'} size="sm" onClick={() => setFilter('unread')}>
              Unread
            </Button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Type
              <select className="input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                {typeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All types' : option.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="muted-text">{items.length} shown{typeFilter !== 'all' ? ` · ${typeFilter.replace(/_/g, ' ')}` : ''}</div>
        </Card>

        {loading ? <div className="notifications-loading">Loading notifications...</div> : null}
        {error ? <div className="notifications-error">{error}</div> : null}
        {!loading && filteredItems.length === 0 ? <div className="notifications-page-empty">No notifications yet.</div> : null}

        <ul className="notifications-page-list">
          {filteredItems.map((notification) => (
            <NotificationListItem key={notification.id} notification={notification} onSelect={handleMarkRead} />
          ))}
        </ul>

        {hasMore && !loading ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Button variant="outline" onClick={() => void loadNotifications(offset + limit, true)}>
              Load more
            </Button>
          </div>
        ) : null}
      </section>
    </ProtectedView>
  );
}
