'use client';

import { useEffect } from 'react';
import { useAuth } from '@/store/authStore';

export function ProtectedView({ children }: { children: React.ReactNode }) {
  const { status, user, refresh, isExpired } = useAuth();

  useEffect(() => {
    if (status === 'unknown') {
      return;
    }
    if (!user || isExpired()) {
      refresh();
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/auth/login');
      }
    }
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
