'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

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

function validatePassword(password: string): string {
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (new Blob([password]).size > 72) return 'Password must be 72 bytes or fewer.';
  return '';
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(token ? '' : 'Invalid password reset token.');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('Invalid password reset token.');
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          new_password: newPassword,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(formatErrorDetail(payload?.detail) || 'Password reset link is invalid or expired.');
      }

      const payload = await response.json().catch(() => null);
      setMessage(payload?.message || 'Password has been reset successfully.');

      window.setTimeout(() => {
        router.replace('/auth/login');
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Password reset link is invalid or expired.');
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
              <path d="M12 17v-6" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              <rect x="4" y="11" width="16" height="10" rx="2" />
            </svg>
          </div>
          <h1 className="auth-title">Reset password</h1>
          <p className="auth-subtitle">
            Choose a new password. Reset links expire after 1 hour and can only be used once.
          </p>
        </div>

        <div className="auth-card-body">
          <form onSubmit={submit} noValidate className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                className="auth-input"
                type="password"
                required
                autoComplete="new-password"
                placeholder="Choose a strong password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="confirm-password">
                Confirm password
              </label>
              <input
                id="confirm-password"
                className="auth-input"
                type="password"
                required
                autoComplete="new-password"
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>

            {error && (
              <div>
                <p className="auth-error">{error}</p>
                <p className="auth-footer">
                  <a href="/auth/forgot-password">Request a new reset link</a>
                </p>
              </div>
            )}

            {message && <p className="auth-success">{message}</p>}

            <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
              <span>{isSubmitting ? 'Resetting…' : 'Reset password'}</span>
            </button>
          </form>

          <div className="auth-footer">
            Back to <a href="/auth/login">sign in</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={(
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-card-body">Loading reset form...</div>
        </div>
      </div>
    )}>
      <ResetPasswordForm />
    </Suspense>
  );
}
