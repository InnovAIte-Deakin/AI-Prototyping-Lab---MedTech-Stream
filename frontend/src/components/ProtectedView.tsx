'use client';

import { useEffect } from 'react';
import { useAuth } from '@/store/authStore';

function safeRedirect(path: string) {
  if (typeof window === 'undefined') return;
  const isJsdom = navigator.userAgent.includes('jsdom');
  if (isJsdom) {
    try {
      window.history.replaceState(null, '', path);
    } catch {
      // ignore
    }
    return;
  }

  try {
    window.location.href = path;
  } catch {
    // ignore (browser environment may have navigation restrictions)
  }
}
export function ProtectedView({ children }: { children: React.ReactNode }) {
  const { status, user, refresh, isExpired } = useAuth();

  useEffect(() => {
    if (status === 'unknown') {
      return;
    }

    let cancelled = false;

    const doRefreshAndRedirect = async () => {
      const isFresh = await refresh();
      if (cancelled) {
        return;
      }
      if (!isFresh) {
        safeRedirect('/auth/login');
      }
    };

    if (!user || isExpired() || status !== 'authenticated') {
      void doRefreshAndRedirect();
    }

    return () => {
      cancelled = true;
    };
  }, [status, user, isExpired, refresh]);

  if (status !== 'authenticated' || !user || isExpired()) {
    return (
      <div className="h-screen grid place-items-center" role="alert" aria-live="polite">
        <p>Redirecting to login…</p>
      </div>
    );
  }

  return <>{children}</>;
}
