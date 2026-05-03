'use client';

import { FormEvent, useState } from 'react';
import { useAuth } from '@/store/authStore';

export default function RegisterPage() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'patient' | 'caregiver' | 'clinician'>('patient');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await register(email.trim(), password, role);
    } catch (err: any) {
      setError(err?.message || 'Registration failed.');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">

        {/* Header */}
        <div className="auth-card-header">
          <div className="auth-logo-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
          </div>
          <h1 className="auth-title">Create account</h1>
          <p className="auth-subtitle">Join ReportX to save and understand your health reports</p>
        </div>

        {/* Body */}
        <div className="auth-card-body">
          <form onSubmit={submit} noValidate className="auth-form">

            <div className="auth-field">
              <label className="auth-label" htmlFor="register-email">Email address</label>
              <input
                id="register-email"
                className="auth-input"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="register-password">Password</label>
              <input
                id="register-password"
                className="auth-input"
                type="password"
                required
                autoComplete="new-password"
                placeholder="Choose a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">I am a…</label>
              <div className="auth-role-grid">
                {([
                  { value: 'patient', emoji: '🩺', label: 'Patient' },
                  { value: 'caregiver', emoji: '🤝', label: 'Caregiver' },
                  { value: 'clinician', emoji: '👨‍⚕️', label: 'Clinician' },
                ] as const).map(({ value, emoji, label }) => (
                  <label key={value} className="auth-role-label">
                    <input
                      type="radio"
                      name="role"
                      value={value}
                      className="auth-role-radio"
                      checked={role === value}
                      onChange={() => setRole(value)}
                    />
                    <span className="auth-role-emoji">{emoji}</span>
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-submit-btn">
              <span>Create account</span>
            </button>

          </form>

          <div className="auth-footer">
            Already have an account? <a href="/auth/login">Sign in</a>
          </div>
        </div>

      </div>
    </div>
  );
}
