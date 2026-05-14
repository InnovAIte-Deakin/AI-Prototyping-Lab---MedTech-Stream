'use client';

import { useNotifications } from '@/store/notificationsStore';
import { NotificationDrawer } from './NotificationDrawer';

export function NotificationBell() {
  const { unreadCount, drawerOpen, closeDrawer, toggleDrawer } = useNotifications();

  return (
    <div className="notifications-bell-wrap">
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        onClick={toggleDrawer}
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', border: '1.5px solid #6b7280', background: '#f9fafb', cursor: 'pointer', padding: 0 }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-4-5.6V5a2 2 0 0 0-4 0v.4A6 6 0 0 0 6 11v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
          <path d="M9 17a3 3 0 0 0 6 0" />
        </svg>
        {unreadCount > 0 ? <span className="notifications-badge-dot">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>
      <NotificationDrawer open={drawerOpen} onClose={closeDrawer} />
    </div>
  );
}
