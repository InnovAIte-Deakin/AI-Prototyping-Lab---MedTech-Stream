"use client";
import { useEffect, useState } from 'react';
import { checkHealth } from '@/lib/health';

export function HealthGate({ children }: { children: React.ReactNode }){
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState('Checking backend…');
  const backend = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');

  useEffect(() => {
    let active = true;
    const t0 = performance.now();
    (async () => {
      const h = await checkHealth(backend);
      const rtt = Math.round(performance.now() - t0);
      if (!active) return;
      if (h.ok) { setReady(true); setMsg(`Backend OK: ${h.backendUrl} • ${rtt}ms`); }
      else { setReady(false); setMsg(`Backend unreachable: ${h.backendUrl}`); }
    })();
    return () => { active = false; };
  }, [backend]);

  if (!ready) {
    return (
      <div className="h-screen grid place-items-center">
        <div className="card" role="alert" aria-live="polite" style={{ maxWidth: 520 }}>
          <strong>{msg}</strong>
          <p className="muted" style={{ marginTop: '.5rem' }}>Set NEXT_PUBLIC_BACKEND_URL if different.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
