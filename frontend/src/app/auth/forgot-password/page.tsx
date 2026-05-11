'use client';

import { FormEvent, useState } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const GENERIC_CONFIRMATION =
  'If an account exists for that email, a password reset link has been sent.';

function formatErrorDetail(detail: unknown): string {
  if (!detail && detail !== 0) return '';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const message = (item as any).msg || (item as any).detail;
          return typeof message === 'string' ? message : JSON.stringify(item);
        }
        return String(item);
      })
      .join('; ');
  }
  if (typeof detail === 'object' && detail !== null) {
    const message = (detail as any).msg || (detail as any).detail || (detail as any).message;
    return typeof message === 'string' ? message : JSON.stringify(detail);
  }
  return String(detail);
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Email address is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(formatErrorDetail(payload?.detail) || 'Could not request password reset.');
      }

      const payload = await response.json().catch(() => null);
      setMessage(payload?.message || GENERIC_CONFIRMATION);
    } catch (err: any) {
      setError(err?.message || 'Could not request password reset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card-header">
          <div className="auth-logo-icon" aria-hidden="true">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="auth-title">Forgot password?</h1>
          <p className="auth-subtitle">
            Enter your email address and we will send a secure reset link if the account exists.
          </p>
        </div>

        <div className="auth-card-body">
          <form onSubmit={submit} noValidate className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="forgot-password-email">
                Email address
              </label>
              <input
                id="forgot-password-email"
                className="auth-input"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-success">{message}</p>}

            <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
              <span>{isSubmitting ? 'Sending…' : 'Send reset link'}</span>
            </button>
          </form>

          <div className="auth-footer">
            Remembered your password? <a href="/auth/login">Sign in</a>
          </div>
        </div>
      </div>
    </div>
  );
}