'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/store/authStore';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/lib/notificationsApi';

type NotificationsContextType = {
  unreadCount: number;
  drawerOpen: boolean;
  drawerItems: NotificationItem[];
  drawerLoading: boolean;
  drawerError: string | null;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  refreshUnreadCount: () => Promise<void>;
  refreshDrawerItems: () => Promise<void>;
  handleMarkAllRead: () => Promise<void>;
  handleMarkRead: (notificationId: string) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextType | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItems, setDrawerItems] = useState<NotificationItem[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    if (status !== 'authenticated' || !user) {
      setUnreadCount(0);
      return;
    }
    try {
      setUnreadCount(await fetchUnreadCount());
    } catch {
      setUnreadCount(0);
    }
  }, [status, user]);

  const refreshDrawerItems = useCallback(async () => {
    if (status !== 'authenticated' || !user) {
      setDrawerItems([]);
      return;
    }
    setDrawerLoading(true);
    setDrawerError(null);
    try {
      const response = await fetchNotifications({ limit: 10, offset: 0 });
      setDrawerItems(response.items);
      setUnreadCount(response.total_unread);
    } catch (error) {
      setDrawerError(error instanceof Error ? error.message : 'Unable to load notifications.');
      setDrawerItems([]);
    } finally {
      setDrawerLoading(false);
    }
  }, [status, user]);

  const handleMarkRead = useCallback(async (notificationId: string) => {
    await markNotificationRead(notificationId);
    await refreshUnreadCount();
    setDrawerItems((current) => current.map((item) => (item.id === notificationId ? { ...item, read: true, read_at: new Date().toISOString() } : item)));
  }, [refreshUnreadCount]);

  const handleMarkAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setUnreadCount(0);
    setDrawerItems((current) => current.map((item) => ({ ...item, read: true, read_at: item.read_at ?? new Date().toISOString() })));
  }, []);

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    void refreshDrawerItems();
  }, [refreshDrawerItems]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((current) => !current), []);

  useEffect(() => {
    void refreshUnreadCount();
  }, [pathname, refreshUnreadCount]);

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      setUnreadCount(0);
      setDrawerItems([]);
      setDrawerOpen(false);
      return;
    }

    void refreshUnreadCount();
    const interval = window.setInterval(() => {
      void refreshUnreadCount();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [status, user, refreshUnreadCount]);

  const value = useMemo<NotificationsContextType>(() => ({
    unreadCount,
    drawerOpen,
    drawerItems,
    drawerLoading,
    drawerError,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    refreshUnreadCount,
    refreshDrawerItems,
    handleMarkAllRead,
    handleMarkRead,
  }), [
    unreadCount,
    drawerOpen,
    drawerItems,
    drawerLoading,
    drawerError,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    refreshUnreadCount,
    refreshDrawerItems,
    handleMarkAllRead,
    handleMarkRead,
  ]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
