'use client';

import { useEffect } from 'react';
import { useAuth } from '@/store/authStore';

export function ProtectedView({ children }: { children: React.ReactNode }) {
  const { status, user, refresh, isExpired } = useAuth();

  useEffect(() => {
    if (status === 'unknown') {
      return;
    }

    let cancelled = false;

    if (!user || isExpired()) {
      const doRefreshAndRedirect = async () => {
        try {
          await refresh();
          if (cancelled) {
            return;
          }
        } catch {
          // ignore
        }
        if (!cancelled && typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
      };

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
