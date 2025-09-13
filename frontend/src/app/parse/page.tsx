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
  const [isDragOver, setIsDragOver] = useState(false);

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files).slice(0, 5);
    setFiles(droppedFiles);
  };

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

  const clearAll = () => {
    setText('');
    setFiles([]);
    setRows([]);
    setUnparsed([]);
    setInterpretation(null);
    setError(null);
    setExplainError(null);
  };

  return (
    <div className="parse-page">
      <div className="parse-header">
        <h1>Parse Lab Report</h1>
        <p className="parse-subtitle">Upload your lab reports or paste the text to get started</p>
      </div>

      <div className="upload-section">
        <form onSubmit={onSubmit} className="upload-form">
          <div className="input-methods">
            {/* File Upload Section */}
            <div className="input-method">
              <div className="method-header">
                <div className="method-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7,10 12,15 17,10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </div>
                <div>
                  <h3>Upload Files</h3>
                  <p>PDF, PNG, or JPEG files (up to 5 files, 500MB each)</p>
                </div>
              </div>

              <div
                className={`file-upload-zone ${isDragOver ? 'drag-over' : ''} ${files.length > 0 ? 'has-files' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))}
                  className="file-input"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="file-upload-label">
                  <div className="upload-content">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17,8 12,3 7,8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <div>
                      <p className="upload-primary">Drop files here or click to browse</p>
                      <p className="upload-secondary">Support for PDF, PNG, JPEG</p>
                    </div>
                  </div>
                </label>

                {files.length > 0 && (
                  <div className="selected-files">
                    <h4>Selected Files:</h4>
                    <ul>
                      {files.map((file, i) => (
                        <li key={i} className="file-item">
                          <span className="file-name">{file.name}</span>
                          <span className="file-size">({Math.round(file.size / 1024)} KB)</span>
                          <button
                            type="button"
                            onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                            className="remove-file"
                            aria-label="Remove file"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="method-divider">
              <span>OR</span>
            </div>

            {/* Text Input Section */}
            <div className="input-method">
              <div className="method-header">
                <div className="method-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10,9 9,9 8,9"/>
                  </svg>
                </div>
                <div>
                  <h3>Paste Text</h3>
                  <p>Copy and paste your lab report text directly</p>
                </div>
              </div>

              <div className="text-input-zone">
                <TextArea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  placeholder="Paste your lab report text here...&#10;&#10;Example:&#10;Glucose: 95 mg/dL (Normal: 70-100)&#10;Cholesterol: 180 mg/dL (Normal: <200)&#10;..."
                  className="report-textarea"
                />
                {text && (
                  <div className="text-stats">
                    <span>{text.length} characters • {text.split('\n').length} lines</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="form-actions">
            <Button
              variant="primary"
              type="submit"
              disabled={loading || (!files.length && !text.trim())}
              size="lg"
            >
              {loading ? (
                <>
                  <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                  Parsing...
                </>
              ) : (
                'Parse Report'
              )}
            </Button>
            <Button variant="outline" type="button" onClick={clearAll} size="lg">
              Clear All
            </Button>
          </div>
        </form>
      </div>

      {error && (
        <div className="alert alert-error">
          <strong>Could not parse.</strong> {error}
        </div>
      )}

      {/* Rest of the component remains the same */}
      {rows.length > 0 && (
        <div className="stack">
          <h2>Results</h2>
          <div className="card table-container">
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
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={onExplain} disabled={explaining}>
              {explaining ? 'Explaining…' : 'Explain'}
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="no-print">Print</Button>
          </div>
        </div>
      )}

      {/* Additional Information Sections */}
      {unparsed.length > 0 && (
        <div className="info-section">
          <details className="info-card">
            <summary className="info-summary">
              <span className="info-icon">⚠️</span>
              <span className="info-title">Unparsed Lines ({unparsed.length})</span>
              <span className="info-description">Lines that couldn't be automatically processed</span>
            </summary>
            <div className="info-content">
              <ul className="unparsed-list">
                {unparsed.map((l, i) => (
                  <li key={i} className="unparsed-item">
                    <span className="line-number">{i + 1}.</span>
                    <span className="line-content">{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      )}

      {extractedText && (
        <div className="info-section">
          <details className="info-card">
            <summary className="info-summary">
              <span className="info-icon">🔍</span>
              <span className="info-title">Extracted Text</span>
              <span className="info-description">Raw text extracted from uploaded files (debug)</span>
            </summary>
            <div className="info-content">
              <pre className="extracted-text">{extractedText}</pre>
            </div>
          </details>
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
