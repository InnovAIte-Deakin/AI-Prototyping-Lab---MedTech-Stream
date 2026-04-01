'use client';

import { useEffect } from 'react';
import { useAuth } from '@/store/authStore';

export default function LogoutPage() {
  const { logout } = useAuth();

  useEffect(() => {
    logout();
  }, [logout]);

  return (
    <div className="stack" style={{ maxWidth: 520, margin: '2rem auto' }}>
      <h1>Logged out</h1>
      <p>You have been signed out. Redirecting to login…</p>
    </div>
  );
}
