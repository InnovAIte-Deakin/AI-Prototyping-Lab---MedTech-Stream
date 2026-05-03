'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useNotifications } from '@/store/notificationsStore';
import { NotificationListItem } from './NotificationListItem';
import { resolveNotificationHref } from '@/lib/notificationsApi';

export function NotificationDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const {
    drawerItems,
    drawerLoading,
    drawerError,
    refreshDrawerItems,
    handleMarkAllRead,
    handleMarkRead,
  } = useNotifications();

  useEffect(() => {
    if (!open) return;
    void refreshDrawerItems();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, refreshDrawerItems]);

  if (!open) return null;

  const handleSelect = async (notificationId: string, href: string) => {
    await handleMarkRead(notificationId);
    onClose();
    router.push(href);
  };

  return (
    <>
      <div className="notifications-overlay" data-testid="notifications-overlay" onClick={onClose} />
      <aside className="notifications-drawer" role="dialog" aria-label="Notifications" onClick={(event) => event.stopPropagation()}>
        <div className="notifications-drawer-header">
          <div>
            <h2 className="notifications-drawer-title">Notifications</h2>
            <p className="muted-text" style={{ margin: 0 }}>Recent updates and shared-report activity</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="outline" size="sm" onClick={() => void handleMarkAllRead()}>
              Mark all read
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close notifications drawer">
              Close
            </Button>
          </div>
        </div>

        <div className="notifications-drawer-body">
          {drawerLoading ? <div className="notifications-loading">Loading notifications...</div> : null}
          {drawerError ? <div className="notifications-error">{drawerError}</div> : null}
          {!drawerLoading && !drawerError && drawerItems.length === 0 ? (
            <div className="notifications-empty">You're all caught up.</div>
          ) : null}
          <ul className="notifications-page-list" style={{ margin: 0 }}>
            {drawerItems.map((notification) => (
              <NotificationListItem
                key={notification.id}
                notification={notification}
                onSelect={(item) => handleSelect(item.id, resolveNotificationHref(item))}
              />
            ))}
          </ul>
          <Button variant="outline" size="sm" onClick={() => { onClose(); router.push('/notifications'); }}>
            View all notifications
          </Button>
        </div>
      </aside>
    </>
  );
}
