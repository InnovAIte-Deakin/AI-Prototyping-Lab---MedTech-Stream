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
    <div className="stack" style={{ maxWidth: 520, margin: '2rem auto' }}>
      <h1>Register</h1>
      <p>Create an account with a role field.</p>

      <form onSubmit={submit} noValidate>
        <label htmlFor="register-email">Email</label>
        <input
          id="register-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: '.5rem', margin: '.25rem 0' }}
        />

        <label htmlFor="register-password">Password</label>
        <input
          id="register-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: '.5rem', margin: '.25rem 0' }}
        />

        <label htmlFor="register-role">Role</label>
        <select
          id="register-role"
          value={role}
          onChange={(e) => setRole(e.target.value as 'patient' | 'caregiver' | 'clinician')}
          style={{ width: '100%', padding: '.5rem', margin: '.25rem 0' }}
        >
          <option value="patient">Patient</option>
          <option value="caregiver">Caregiver</option>
          <option value="clinician">Clinician</option>
        </select>

        <button type="submit" style={{ marginTop: '1rem' }}>
          Register
        </button>
      </form>

      {error && <div className="error" style={{ color: 'red' }}>{error}</div>}

      <p style={{ marginTop: '1rem' }}>
        Already have an account? <a href="/auth/login">Login</a>
      </p>
    </div>
  );
}
