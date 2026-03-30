import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoginPage from '../login/page';
import RegisterPage from '../register/page';
import { AuthProvider } from '@/store/authStore';

describe('Auth pages', () => {
  const stubFetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.endsWith('/api/v1/auth/register')) {
      return {
        ok: true,
        status: 201,
        json: async () => ({ user: { id: '1', email: 'test@x.com', display_name: 'Test', roles: ['clinician'], is_active: true } }),
      };
    }
    if (url.endsWith('/api/v1/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'access-token',
          token_type: 'bearer',
          access_token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          refresh_token: 'refresh-token',
          refresh_token_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          user: { id: '1', email: 'test@x.com', display_name: 'Test', roles: ['clinician'], is_active: true },
        }),
      };
    }
    if (url.endsWith('/api/v1/auth/refresh')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'access-token-2',
          token_type: 'bearer',
          access_token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          refresh_token: 'refresh-token-2',
          refresh_token_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          user: { id: '1', email: 'test@x.com', display_name: 'Test', roles: ['clinician'], is_active: true },
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({ detail: 'Not found' }) };
  });

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.stubGlobal('fetch', stubFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register and set status', async () => {
    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@x.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'clinician' } });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      const raw = localStorage.getItem('reportx_session');
      expect(raw).toBeTruthy();
      const session = JSON.parse(raw || '{}');
      expect(session.user.email).toBe('test@x.com');
      expect(session.user.role).toBe('clinician');
      expect(session.accessTokenExpiresAt).toBeGreaterThan(Date.now());
    });
  });

  it('should show error when login password is blank', async () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@x.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByText(/email and password are required/i)).toBeInTheDocument();
    });
  });
});
