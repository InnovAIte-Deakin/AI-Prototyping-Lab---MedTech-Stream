"use client";
import { useParseStore } from '@/store/parseStore';

export function LogsPane(){
  const { metrics } = useParseStore();
  if (!metrics.lastStatus) return <div className="muted" style={{ fontSize: 14 }}>No activity yet.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', fontSize: 14 }}>
      <div>Status: <strong>{metrics.lastStatus}</strong></div>
      <div>Took: <strong>{metrics.lastParseMs ?? 0} ms</strong></div>
      <div>Rows: <strong>{metrics.parsedRowCount ?? 0}</strong></div>
      <div>Unparsed: <strong>{metrics.unparsedCount ?? 0}</strong></div>
    </div>
  );
}

