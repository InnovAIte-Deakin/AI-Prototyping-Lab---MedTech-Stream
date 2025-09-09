"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useParseStore } from '@/store/parseStore';

const ACCEPT = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file

export function FileQueue(){
  const { backendUrl, files, setFiles, setResult, setMetrics } = useParseStore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onPick(e: React.ChangeEvent<HTMLInputElement>){
    const list = Array.from(e.target.files || []);
    const bad = list.find(f => !ACCEPT.includes(f.type) || f.size > MAX_BYTES);
    if (bad){
      setError(`Unsupported type or too large: ${bad.name}`);
      return;
    }
    setError(null);
    setFiles(list);
  }

  async function onParse(){
    setBusy(true); setError(null); setResult(undefined);
    const t0 = performance.now();
    try {
      let res: Response;
      if (files.length > 0){
        const fd = new FormData();
        for (const f of files) fd.append('files', f.file);
        res = await fetch(`${backendUrl}/api/v1/parse`, { method:'POST', body: fd });
      } else {
        setError('Please select at least one PDF or image, or paste text in the old Parse page.');
        setBusy(false);
        return;
      }
      const took = Math.round(performance.now() - t0);
      const json = await res.json();
      const rows = Array.isArray(json.rows) ? json.rows : [];
      const unparsed = Array.isArray(json.unparsed_lines) ? json.unparsed_lines : [];
      setResult({ rows, unparsed, extractedText: json.extracted_text });
      setMetrics({ lastStatus: res.status, lastParseMs: took, parsedRowCount: rows.length, unparsedCount: unparsed.length });
      if (!res.ok) setError(`Parse failed: ${res.status}`);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="stack">
        <input type="file" multiple accept={ACCEPT.join(',')} onChange={onPick} />
        {error ? <div className="alert alert-error">{error}</div> : null}
      </div>
      <div>
        <Button onClick={onParse} disabled={busy}>{busy ? 'Parsing…' : 'Parse'}</Button>
      </div>
      <ul className="muted" style={{ fontSize: 14 }}>
        {files.map((f, i) => (
          <li key={i}>{f.file.name} — {(f.file.size/1024/1024).toFixed(2)} MB</li>
        ))}
      </ul>
    </div>
  );
}

