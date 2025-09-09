'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import Disclaimer from '@/components/Disclaimer';

type Row = {
  test_name: string;
  value: number | string;
  unit: string | null;
  reference_range: string | null;
  flag: 'low' | 'high' | 'normal' | 'abnormal' | null;
  confidence: number;
};

export default function ParsePage() {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [interpretation, setInterpretation] = useState<null | {
    summary: string;
    per_test: { test_name: string; explanation: string }[];
    flags: { test_name: string; severity: string; note: string }[];
    next_steps: string[];
    disclaimer: string;
  }>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [doctorView, setDoctorView] = useState<boolean>(false);

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let res: Response;
      if (files.length > 0) {
        const fd = new FormData();
        for (const f of files.slice(0, 5)) {
          fd.append('files', f);
        }
        res = await fetch(`${backend}/api/v1/parse`, { method: 'POST', body: fd });
      } else {
        res = await fetch(`${backend}/api/v1/parse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      }
      if (!res.ok) throw new Error(`Parse failed: ${res.status}`);
      const data = (await res.json()) as { rows: Row[]; unparsed_lines: string[]; extracted_text?: string };
      setRows(data.rows);
      setUnparsed(data.unparsed_lines);
      setExtractedText(data.extracted_text || '');
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onExplain() {
    setExplainError(null);
    setExplaining(true);
    setInterpretation(null);
    try {
      const res = await fetch(`${backend}/api/v1/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) throw new Error(`Interpret failed: ${res.status}`);
      const data = (await res.json()) as { interpretation: any };
      setInterpretation(data.interpretation);
    } catch (err: any) {
      setExplainError(err.message || String(err));
    } finally {
      setExplaining(false);
    }
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="stack">
      <h1>Parse Lab Report</h1>
      <div className="card">
        <form onSubmit={onSubmit} className="stack">
          <div className="stack">
            <label>
              <strong>Upload files</strong> <span className="muted">(PDF/PNG/JPEG, up to 5 files, 500MB each)</span>
              <Input
                type="file"
                multiple
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))}
              />
            </label>
            <label>
              <strong>Or paste text</strong>
              <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Paste report text here..." />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? 'Parsing…' : 'Parse'}
            </Button>
            <Button variant="outline" type="button" onClick={() => { setText(''); setFiles([]); setRows([]); setUnparsed([]); setInterpretation(null); }}>Clear</Button>
          </div>
        </form>
      </div>

      {error ? <div className="alert alert-error"><strong>Could not parse.</strong> {error}</div> : null}

      {rows.length > 0 && (
        <div className="stack">
          <h2>Results</h2>
          <div className="card table-container">
            <Table>
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <THead>
                <TR>
                  <TH>Test</TH>
                  <TH>Value</TH>
                  <TH>Unit</TH>
                  <TH>Reference Range</TH>
                  <TH>Flag</TH>
                  <TH>Confidence</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r, i) => (
                  <TR key={i}>
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        <span>{r.test_name}</span>
                        {r.flag && r.flag !== 'normal' ? (
                          <span className={`badge-flag ${r.flag}`}>{r.flag.toUpperCase()}</span>
                        ) : null}
                      </div>
                    </TD>
                    <TD>
                      <Input
                        value={String(r.value)}
                        onChange={(e) => updateRow(i, { value: e.target.value })}
                        aria-label="value"
                      />
                    </TD>
                    <TD>
                      <Input value={r.unit ?? ''} onChange={(e) => updateRow(i, { unit: e.target.value })} aria-label="unit" />
                    </TD>
                    <TD>
                      <Input
                        value={r.reference_range ?? ''}
                        onChange={(e) => updateRow(i, { reference_range: e.target.value })}
                        aria-label="reference range"
                      />
                    </TD>
                    <TD>{r.flag ?? ''}</TD>
                    <TD>{r.confidence.toFixed(2)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={onExplain} disabled={explaining}>
              {explaining ? 'Explaining…' : 'Explain'}
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="no-print">Print</Button>
            <Button variant="outline" onClick={() => setDoctorView((v) => !v)}>{doctorView ? 'Hide Doctor View' : 'Show Doctor View'}</Button>
          </div>
        </div>
      )}

      {unparsed.length > 0 && (
        <div className="stack">
          <details className="card">
            <summary className="muted">Unparsed lines ({unparsed.length})</summary>
            <ul className="unparsed-list">
              {unparsed.map((l, i) => (
                <li key={i} className="muted">
                  {l}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {extractedText && (
        <div className="stack">
          <details className="card">
            <summary className="muted">Extracted text (debug)</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{extractedText}</pre>
          </details>
        </div>
      )}

      {doctorView && rows.length > 0 && (
        <div className="stack">
          <h2>Doctor View</h2>
          <div className="card doctor-summary">
            <table className="table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Value</th>
                  <th>Unit</th>
                  <th>Reference</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.test_name}</td>
                    <td>{String(r.value)}</td>
                    <td>{r.unit}</td>
                    <td>{r.reference_range}</td>
                    <td>{r.flag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {explainError ? (
        <div className="alert alert-error">
          <div>
            <strong>Interpretation error:</strong> {explainError}
          </div>
          <div className="no-print">
            <Button onClick={onExplain}>Retry</Button>
          </div>
        </div>
      ) : null}

      {explaining && (
        <div className="card">
          <div className="skeleton" style={{ width: '60%' }} />
          <div className="skeleton" style={{ width: '80%', marginTop: '0.5rem' }} />
          <div className="skeleton" style={{ width: '70%', marginTop: '0.5rem' }} />
        </div>
      )}

      {interpretation && (
        <div className="stack">
          <h2>Interpretation</h2>
          <div className="card">
            <h3>Summary</h3>
            <p>{interpretation.summary}</p>

            {interpretation.flags && interpretation.flags.length > 0 && (
              <div className="stack" style={{ marginTop: '0.75rem' }}>
                <h3>Flags</h3>
                <ul>
                  {interpretation.flags.map((f, i) => (
                    <li key={i}>
                      <strong>{f.test_name}:</strong> {f.severity} — <span className="muted">{f.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {interpretation.per_test && interpretation.per_test.length > 0 && (
              <div className="stack" style={{ marginTop: '0.75rem' }}>
                <h3>Per Test</h3>
                <ul>
                  {interpretation.per_test.map((p, i) => (
                    <li key={i}>
                      <strong>{p.test_name}:</strong> {p.explanation}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            

            <div className="stack" style={{ marginTop: '0.75rem' }}>
              <h3>Next Steps</h3>
              <ol>
                {interpretation.next_steps.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>

            <aside className="muted" style={{ marginTop: '0.75rem' }}>
              <em>{interpretation.disclaimer}</em>
            </aside>
          </div>
        </div>
      )}
      <Disclaimer />
    </div>
  );
}
