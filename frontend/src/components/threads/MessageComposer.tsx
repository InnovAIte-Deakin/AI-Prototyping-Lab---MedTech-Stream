'use client';

import React, { useState } from 'react';

export function MessageComposer({
  canWrite,
  sending,
  onSend,
}: {
  canWrite: boolean;
  sending: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(false);

  if (!canWrite) return null;

  const disabled = sending || inFlight || !value.trim();

  async function submit() {
    if (disabled) return;
    setError(null);
    const draft = value;
    setInFlight(true);
    try {
      await onSend(draft);
      setValue('');
    } catch (err: any) {
      setError(err?.message || 'Failed to send message');
      setValue(draft);
    } finally {
      setInFlight(false);
    }
  }

  return (
    <div>
      <textarea
        aria-label="Thread message input"
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: '100%', resize: 'vertical', minHeight: '3rem', maxHeight: '9rem' }}
      />
      <div style={{ marginTop: '0.5rem' }}>
        <button type="button" className="nav-btn nav-btn-primary" disabled={disabled} onClick={submit}>Send</button>
      </div>
      {error ? <p className="alert alert-error">{error}</p> : null}
    </div>
  );
}
