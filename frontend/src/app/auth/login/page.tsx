'use client';

import { FormEvent, useState } from 'react';
import { useAuth } from '@/store/authStore';

export default function LoginPage() {
  const { login, status } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err?.message || 'Login failed.');
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 520, margin: '2rem auto' }}>
      <h1>Login</h1>
      <p>Enter your credentials to continue.</p>

      <form onSubmit={submit} noValidate>
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: '.5rem', margin: '.25rem 0' }}
        />

        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: '.5rem', margin: '.25rem 0' }}
        />

        <button type="submit" style={{ marginTop: '1rem' }}>
          Login
        </button>
      </form>

      <p>{status === 'authenticated' ? 'Already authenticated' : 'Not authenticated'}</p>

      {error && <div className="error" style={{ color: 'red' }}>{error}</div>}

      <p style={{ marginTop: '1rem' }}>
        New here? <a href="/auth/register">Register</a>
      </p>
    </div>
  );
}
