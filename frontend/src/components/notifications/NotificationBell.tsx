'use client';

import { useNotifications } from '@/store/notificationsStore';
import { NotificationDrawer } from './NotificationDrawer';

export function NotificationBell() {
  const { unreadCount, drawerOpen, closeDrawer, toggleDrawer } = useNotifications();

  return (
    <div className="notifications-bell-wrap">
      <button
        type="button"
        className="notifications-bell-button"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        onClick={toggleDrawer}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-4-5.6V5a2 2 0 0 0-4 0v.4A6 6 0 0 0 6 11v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
          <path d="M9 17a3 3 0 0 0 6 0" />
        </svg>
        {unreadCount > 0 ? <span className="notifications-badge-dot">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>
      <NotificationDrawer open={drawerOpen} onClose={closeDrawer} />
    </div>
  );
}
