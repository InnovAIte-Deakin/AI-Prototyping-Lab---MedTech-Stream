import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthProvider, useAuth } from '@/store/authStore';
import { ProtectedView } from '@/components/ProtectedView';

function TestConsumer() {
  const { user, login, register, logout, status } = useAuth();
  const [error, setError] = React.useState('');

  const loginSafely = async (email: string, password: string) => {
    try {
      setError('');
      await login(email, password);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    }
  };

  return (
    <div>
      <div>status: {status}</div>
      <div>user: {user ? `${user.email}:${user.role}` : 'none'}</div>
      <div>error: {error || 'none'}</div>
      <button onClick={() => register('a@b.com', 'pass', 'patient')}>register</button>
      <button onClick={() => loginSafely('a@b.com', 'pass')}>login</button>
      <button onClick={() => loginSafely('a@b.com', 'wrong')}>login-bad-password</button>
      <button onClick={() => loginSafely('unknown@b.com', 'pass')}>login-unknown</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function TestProtectedPage() {
  return (
    <ProtectedView>
      <div>protected-content</div>
    </ProtectedView>
  );
}

describe('Auth flow', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/api/v1/auth/register')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ user: { id: '1', email: 'a@b.com', display_name: 'A', roles: ['patient'], is_active: true } }),
        };
      }
      if (url.endsWith('/api/v1/auth/login')) {
        const body = JSON.parse((init?.body as string) || '{}');
        const email = body.email;
        const password = body.password;
        if (email === 'a@b.com' && password === 'pass') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'access-token',
              token_type: 'bearer',
              access_token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
              refresh_token: 'refresh-token',
              refresh_token_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
              user: { id: '1', email: 'a@b.com', display_name: 'A', roles: ['patient'], is_active: true },
            }),
          };
        }
        return {
          ok: false,
          status: 401,
          json: async () => ({ detail: 'Invalid email or password.' }),
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
            user: { id: '1', email: 'a@b.com', display_name: 'A', roles: ['patient'], is_active: true },
          }),
        };
      }
      if (url.endsWith('/api/v1/auth/logout')) {
        return { ok: true, status: 204, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({ detail: 'Not found' }) };
    });

    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });


  it('register sets user and session', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText('register'));

    await waitFor(() => {
      expect(screen.getByText(/user:/i)).toHaveTextContent('a@b.com:patient');
      expect(screen.getByText(/status:/i)).toHaveTextContent('authenticated');
    });

    const raw = localStorage.getItem('reportx_session');
    expect(raw).toBeTruthy();
    const session = JSON.parse(raw || '{}');
    expect(session.user.email).toBe('a@b.com');
    expect(session.user.role).toBe('patient');
  });

  it('login rejects incorrect password and unknown user', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText('register'));

    await waitFor(() => {
      expect(screen.getByText(/status:/i)).toHaveTextContent('authenticated');
    });

    fireEvent.click(screen.getByText('logout'));

    await waitFor(() => {
      expect(screen.getByText(/status:/i)).toHaveTextContent('unauthenticated');
    });

    fireEvent.click(screen.getByText('login-bad-password'));

    await waitFor(() => {
      expect(screen.getByText(/error:/i)).toHaveTextContent('Invalid email or password.');
      expect(screen.getByText(/status:/i)).toHaveTextContent('unauthenticated');
    });

    fireEvent.click(screen.getByText('login-unknown'));

    await waitFor(() => {
      expect(screen.getByText(/error:/i)).toHaveTextContent('Invalid email or password.');
      expect(screen.getByText(/status:/i)).toHaveTextContent('unauthenticated');
    });
  });

  it('expired session clears and redirects to login', async () => {
    const expiredUser = {
      user: {
        id: '1',
        email: 'a@b.com',
        role: 'patient',
        displayName: 'A',
      },
      accessToken: 'access-token',
      accessTokenExpiresAt: Date.now() - 1000,
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: Date.now() - 1000,
    };
    localStorage.setItem('reportx_session', JSON.stringify(expiredUser));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/status:/i)).toHaveTextContent('unauthenticated');
      expect(window.location.pathname).toBe('/auth/login');
    });
  });

  it('ProtectedView redirects unauthenticated to login', async () => {
    render(
      <AuthProvider>
        <TestProtectedPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(window.location.href).toContain('/auth/login');
    });
  });
});
