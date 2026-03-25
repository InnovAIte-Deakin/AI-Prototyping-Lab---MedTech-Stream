'use client';

import { useEffect, useMemo, useState } from 'react';
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

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'ar', label: 'العربية' },
  { value: 'zh', label: '中文 (普通话)' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'fr', label: 'Français' },
];

const THINKING_STEPS = [
  'Parsing your report text',
  'Comparing values with reference ranges',
  'Drafting a patient-friendly explanation',
];

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
  'image/png',
  'image/jpeg',
]);

const MAX_UPLOAD_FILES = 5;

const isAcceptedFile = (file: File): boolean => {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  const lower = file.name.toLowerCase();
  return lower.endsWith('.pdf') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg');
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [interpretation, setInterpretation] = useState<null | {
    summary: string;
    per_test: { test_name: string; explanation: string }[];
    flags: { test_name: string; severity: string; note: string }[];
    next_steps: string[];
    disclaimer: string;
    translations?: Record<string, string>;
  }>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [doctorView, setDoctorView] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

  useEffect(() => {
    if (!uploadError) return;
    const timer = window.setTimeout(() => setUploadError(null), 3500);
    return () => window.clearTimeout(timer);
  }, [uploadError]);

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
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) {
      return;
    }
    const valid = droppedFiles.filter(isAcceptedFile);
    if (valid.length === 0) {
      setUploadError('Only PDF, PNG, or JPEG files are supported.');
      return;
    }
    if (valid.length < droppedFiles.length) {
      setUploadError('Only PDF, PNG, or JPEG files are supported.');
    }
    setFiles((prev) => {
      const merged = [...prev, ...valid];
      if (merged.length <= MAX_UPLOAD_FILES) {
        setUploadError(null);
        return merged;
      }
      setUploadError(`You can upload up to ${MAX_UPLOAD_FILES} files. Ignored ${merged.length - MAX_UPLOAD_FILES} extra file(s).`);
      return merged.slice(0, MAX_UPLOAD_FILES);
    });
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let res: Response;
      if (files.length > 0) {
        const fd = new FormData();
        for (const f of files.slice(0, MAX_UPLOAD_FILES)) {
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
      if (!res.ok) {
        const e: any = new Error("We couldn’t review that report right now. Please try again.");
        e.userMessage = true;
        throw e;
      }
      const data = (await res.json()) as { rows: Row[]; unparsed_lines: string[]; extracted_text?: string };
      setRows(data.rows);
      setUnparsed(data.unparsed_lines);
      setExtractedText(data.extracted_text || '');
    } catch (err: any) {
      if (err && (err as any).userMessage) {
        setError(err.message);
      } else {
        setError("We had trouble reviewing your report. Please try again in a moment.");
      }
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
      if (!res.ok) {
        const e: any = new Error("We couldn’t review that report right now. Please try again.");
        e.userMessage = true;
        throw e;
      }
      const data = (await res.json()) as { interpretation: any };
      setInterpretation(data.interpretation);
    } catch (err: any) {
      if (err && (err as any).userMessage) {
        setExplainError(err.message);
      } else {
        setExplainError("We had trouble reviewing your report. Please try again in a moment.");
      }
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
    setUploadError(null);
    const input = document.getElementById('file-upload') as HTMLInputElement | null;
    if (input) {
      input.value = '';
    }
  };

  return (
    <div className="parse-page">
      <div className="parse-header">
        <h1>Understand Your Lab Report</h1>
        <p className="parse-subtitle">Upload your report or paste the text. We’ll sort the numbers and explain them in plain language so you can talk confidently with your clinician.</p>
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
                  <h3>Upload Your Report</h3>
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
                  onChange={(e) => {
                    const selected = Array.from(e.target.files || []);
                    if (selected.length === 0) {
                      return;
                    }
                    const valid = selected.filter(isAcceptedFile);
                    if (valid.length === 0) {
                      setUploadError('Only PDF, PNG, or JPEG files are supported.');
                      e.target.value = '';
                      return;
                    }
                    if (valid.length < selected.length) {
                      setUploadError('Only PDF, PNG, or JPEG files are supported.');
                    }
                    setFiles((prev) => {
                      const merged = [...prev, ...valid];
                      if (merged.length <= MAX_UPLOAD_FILES) {
                        setUploadError(null);
                        return merged;
                      }
                      setUploadError(`You can upload up to ${MAX_UPLOAD_FILES} files. Ignored ${merged.length - MAX_UPLOAD_FILES} extra file(s).`);
                      return merged.slice(0, MAX_UPLOAD_FILES);
                    });
                    // reset input so selecting again with same file works
                    e.target.value = '';
                  }}
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
                    {uploadError && (
                      <div className="upload-alert">{uploadError}</div>
                    )}
                    <div className="selected-files__header">
                      <h4>Selected Files</h4>
                      <button
                        type="button"
                        className="remove-file remove-file--pill"
                        onClick={() => {
                          setFiles([]);
                          setUploadError(null);
                          const input = document.getElementById('file-upload') as HTMLInputElement | null;
                          if (input) input.value = '';
                        }}
                      >
                        <span className="remove-file-icon" aria-hidden="true"></span>
                        <span className="remove-file-label">Clear All</span>
                      </button>
                    </div>
                    <ul>
                      {files.map((file, i) => (
                        <li key={i} className="file-item">
                          <span className="file-name">{file.name}</span>
                          <span className="file-size">({Math.round(file.size / 1024)} KB)</span>
                          <button
                            type="button"
                            className="remove-file"
                            aria-label={`Remove ${file.name}`}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setFiles((prev) => {
                                const next = prev.filter((_, idx) => idx !== i);
                                if (next.length < MAX_UPLOAD_FILES) {
                                  setUploadError(null);
                                }
                                if (next.length === 0) {
                                  const input = document.getElementById('file-upload') as HTMLInputElement | null;
                                  if (input) {
                                    input.value = '';
                                  }
                                }
                                return next;
                              });
                            }}
                          >
                            <span className="remove-file-icon" aria-hidden="true"></span>
                            <span className="sr-only">Remove</span>
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
                  Reviewing...
                </>
              ) : (
                'Review Report'
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
          <strong>We ran into a hiccup.</strong> {error}
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
                  <th>Text</th>
                  <th>Reference</th>
                  <th>Value</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.test_name}</td>
                    <td>{r.reference_range}</td>
                    <td>{`${String(r.value)}${r.unit ? ` ${r.unit}` : ''}`}</td>
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
              <span className="info-title">Lines we couldn’t read ({unparsed.length})</span>
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
            <strong>We couldn’t review your report this time.</strong> {explainError}
          </div>
          <div className="no-print">
            <Button onClick={onExplain}>Retry</Button>
          </div>
        </div>
      ) : null}

      {explaining && <ThinkingCard />}

      {interpretation && (
        <div className="stack">
          <h2>Insights</h2>
          <SummaryCard summary={interpretation.summary} translations={interpretation.translations} />
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
        </div>
      )}
      <Disclaimer />
    </div>
  );
}

// Polished summary renderer: handles plain text or stray JSON gracefully

function ThinkingCard() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStep((prev) => (prev + 1) % THINKING_STEPS.length);
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="card thinking-card">
      <div className="thinking-header">
        <span className="thinking-pulse" />
        <span>Analyzing your report…</span>
      </div>
      <ul className="thinking-steps">
        {THINKING_STEPS.map((step, index) => (
          <li key={step} className={`thinking-step ${index <= activeStep ? 'is-active' : ''}`}>
            {step}
          </li>
        ))}
      </ul>
      <div className="thinking-meter" />
    </div>
  );
}

function SummaryCard({ summary, translations }: { summary: string; translations?: Record<string, string> }) {
  const [copied, setCopied] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');

  const normalizedTranslations = useMemo(() => {
    const next: Record<string, string> = { en: summary };
    Object.entries(translations ?? {}).forEach(([code, text]) => {
      if (typeof text === 'string' && text.trim()) {
        next[code] = text.trim();
      }
    });
    return next;
  }, [summary, translations]);

  const availableOptions = useMemo(() => {
    return LANGUAGE_OPTIONS.filter(opt => Boolean(normalizedTranslations[opt.value]));
  }, [normalizedTranslations]);

  useEffect(() => {
    if (!availableOptions.find(opt => opt.value === selectedLanguage)) {
      setSelectedLanguage('en');
    }
    setCopied(false);
  }, [availableOptions, selectedLanguage, summary]);

  const tryParse = (value: string): string | null => {
    const trimmed = (value || '').trim();
    if (!trimmed) return null;
    const looksJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (!looksJson) return trimmed;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
      if (parsed && typeof parsed.summary === 'string') return parsed.summary;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return trimmed;
    }
  };

  const displayRaw = normalizedTranslations[selectedLanguage] ?? summary;
  const displayText = tryParse(displayRaw) ?? '';
  const isCodeBlock = displayText.trim().startsWith('{') || displayText.trim().startsWith('[');

  const lines = displayText.split(/\n/);
  const bullets: string[] = [];
  const other: string[] = [];
  for (const ln of lines) {
    if (/^\s*[-*•]\s+/.test(ln) || /^\s*\d+\.\s+/.test(ln)) {
      bullets.push(ln.replace(/^\s*[-*•]\s+/, '').trim());
    } else {
      other.push(ln);
    }
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
        >
          {availableOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button className="btn btn-outline btn-sm" onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      {isCodeBlock ? (
        <pre className="summary-code">{displayText}</pre>
      ) : (
        <div className="summary-body">
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
