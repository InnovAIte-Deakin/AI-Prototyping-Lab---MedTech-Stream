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
      const data = (await res.json()) as { rows: Row[]; unparsed_lines: string[] };
      setRows(data.rows);
      setUnparsed(data.unparsed_lines);
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
      <form onSubmit={onSubmit} className="stack">
        <label>
          PDF(s) or image(s) (optional, up to 5 files, 500MB each):
          <Input
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))}
          />
        </label>
        <label>
          Or paste text:
          <TextArea value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <Button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Parsing…' : 'Parse'}
        </Button>
      </form>

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
                    <TD>{r.test_name}</TD>
                    <TD>
                      <Input
                        value={String(r.value)}
                        onChange={(e) => updateRow(i, { value: e.target.value })}
                        aria-label="value"
                      />
                    </TD>
                    <TD>
                      <Input
                        value={r.unit ?? ''}
                        onChange={(e) => updateRow(i, { unit: e.target.value })}
                        aria-label="unit"
                      />
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
          <div>
            <Button className="btn-primary" onClick={onExplain} disabled={explaining}>
              {explaining ? 'Explaining…' : 'Explain'}
            </Button>
          </div>
        </div>
      )}

      {unparsed.length > 0 && (
        <div className="stack">
          <h3>Unparsed Lines</h3>
          <div className="card">
            <ul>
              {unparsed.map((l, i) => (
                <li key={i} className="muted">
                  {l}
                </li>
              ))}
            </ul>
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
