"use client";
import { useEffect, useState } from 'react';

type Health = { status: string; ok: boolean; error?: string };

export default function HealthPage() {
  const [health, setHealth] = useState<Health>({ status: 'unknown', ok: false });
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  useEffect(() => {
    let canceled = false;
    async function run() {
      try {
        const res = await fetch(`${backend}/api/v1/health`, { cache: 'no-store' });
        if (!res.ok) {
          if (!canceled) setHealth({ status: 'error', ok: false });
          return;
        }
        const json = (await res.json()) as { status: string };
        if (!canceled) setHealth({ status: json.status, ok: true });
      } catch (err: unknown) {
        if (!canceled) setHealth({ status: 'error', ok: false, error: (err as Error).message });
      }
    }
    run();
    return () => {
      canceled = true;
    };
  }, [backend]);

  return (
    <div className="stack">
      <h1>Health</h1>
      <div className="card">
        <p>
          Backend URL: <code>{backend}</code>
        </p>
        <p>
          Status: <strong>{health.ok ? health.status : 'unreachable'}</strong>
        </p>
        {!health.ok && health.error ? <p className="muted">{health.error}</p> : null}
      </div>
    </div>
  );
}
