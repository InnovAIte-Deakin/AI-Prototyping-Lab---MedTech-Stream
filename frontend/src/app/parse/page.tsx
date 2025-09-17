'use client';

import { useEffect, useState } from 'react';
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
  const [meta, setMeta] = useState<any>(null);
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
      const data = (await res.json()) as { interpretation: any, meta?: any };
      setInterpretation(data.interpretation);
      setMeta((data as any).meta || null);
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
                    <td>
                      {r.flag ? (
                        <span className={`flag-chip ${r.flag}`}>
                          {r.flag.toUpperCase()}
                        </span>
                      ) : (
                        <span className="flag-chip normal">NORMAL</span>
                      )}
                    </td>
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
              <span className="info-description">Lines that couldn&#39;t be automatically processed</span>
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
          <h2>Insights</h2>
          <SummaryCard backendUrl={backend} summary={interpretation.summary} />
          {Array.isArray(interpretation.per_test) && interpretation.per_test.length > 0 && (
            <div className="card">
              <h3>Per‑test explanations</h3>
              <ul>
                {interpretation.per_test.map((t: any, i: number) => (
                  <li key={i}><strong>{t.test_name}:</strong> {t.explanation}</li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(interpretation.next_steps) && interpretation.next_steps.length > 0 && (
            <div className="card">
              <h3>Next steps</h3>
              <ol>
                {interpretation.next_steps.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}
          {meta && (
            <pre className="card no-print" style={{ fontSize: 12, color: 'var(--muted-ink)', background: 'var(--ui-muted)' }}>
{`LLM: ${meta.endpoint || 'unknown'} • ok: ${String(meta.ok)} • model: ${meta.model || ''}${meta.error ? ` • error: ${typeof meta.error === 'string' ? meta.error : (meta.error.message || JSON.stringify(meta.error))}` : ''}`}
            </pre>
          )}
        </div>
      )}
      <Disclaimer />
    </div>
  );
}

// Polished summary renderer: handles plain text or stray JSON gracefully

function SummaryCard({ summary, backendUrl }: { summary: string, backendUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState<boolean>(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  // Try to extract a human‑readable string from JSON‑looking content
  const tryParse = (s: string): string | null => {
    const trimmed = (s || "").trim();
    if (!trimmed) return null;
    const looksJson = (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
    if (!looksJson) return trimmed;
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj === 'string') return obj;
      if (obj && typeof obj.summary === 'string') return obj.summary;
      // Fallback: pretty print compact JSON snippet
      return JSON.stringify(obj, null, 2);
    } catch {
      return trimmed; // not real JSON; just show raw
    }
  };

  const baseText = tryParse(summary) ?? '';
  const isCodeBlock = baseText.trim().startsWith('{') || baseText.trim().startsWith('[');

  const LANGUAGE_OPTIONS = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'ar', label: 'العربية' },
    { value: 'zh', label: '中文 (普通话)' },
    { value: 'hi', label: 'हिन्दी' },
    { value: 'fr', label: 'Français' },
  ];

  const canTranslate = !isCodeBlock && baseText.trim().length > 0;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!canTranslate || selectedLanguage === 'en') {
      setTranslatedText(null);
      setTranslateError(null);
      setTranslating(false);
      return () => { controller.abort(); };
    }
    const run = async () => {
      try {
        setTranslating(true);
        setTranslateError(null);
        const res = await fetch(`${backendUrl}/api/v1/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: baseText, target_language: selectedLanguage }),
          signal: controller.signal,
        });
        if (!active) return;
        if (!res.ok) {
          let msg = 'Translation unavailable. Please try again later.';
          try {
            const body = await res.json();
            if (body && typeof body.detail === 'string') msg = body.detail;
          } catch {}
          setTranslateError(msg);
          setTranslatedText(null);
        } else {
          const data = await res.json();
          setTranslatedText(data.translation);
        }
      } catch (err: any) {
        if (!active) return;
        if (err?.name !== 'AbortError') {
          setTranslateError('Translation unavailable. Please try again later.');
          setTranslatedText(null);
        }
      } finally {
        if (active) setTranslating(false);
      }
    };
    run();
    return () => { active = false; controller.abort(); };
  }, [selectedLanguage, baseText, backendUrl, canTranslate]);

  const displayText = translatedText ?? baseText;
  // Turn double newlines into paragraphs; keep single‑line bullets as a list
  const lines = displayText.split(/\n/);
  const bullets: string[] = [];
  const other: string[] = [];
  for (const ln of lines) {
    if (/^\s*[-*•]\s+/.test(ln) || /^\s*\d+\.\s+/.test(ln)) bullets.push(ln.replace(/^\s*[-*•]\s+/, '').trim()); else other.push(ln);
  }

  const paras = other.join('\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="card summary-card">
      <div className="summary-toolbar no-print">
        <select
          aria-label="Translate summary"
          className="summary-translate-select"
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          disabled={!canTranslate}
        >
          {LANGUAGE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button className="btn btn-outline btn-sm" onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      {isCodeBlock ? (
        <pre className="summary-code">{baseText}</pre>
      ) : (
        <div className="summary-body">
          {translating && <p className="summary-status">Translating summary to {LANGUAGE_OPTIONS.find(l => l.value === selectedLanguage)?.label}...</p>}
          {translateError && <p className="summary-status error">{translateError}</p>}
          {paras.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {bullets.length > 0 && (
            <ul className="summary-bullets">
              {bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
