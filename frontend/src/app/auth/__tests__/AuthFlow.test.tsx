import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthProvider, useAuth } from '@/store/authStore';
import { ProtectedView } from '@/components/ProtectedView';

function TestConsumer() {
  const { user, login, register, logout, status } = useAuth();

  return (
    <div>
      <div>status: {status}</div>
      <div>user: {user ? `${user.email}:${user.role}` : 'none'}</div>
      <button onClick={() => register('a@b.com', 'pass', 'patient')}>register</button>
      <button onClick={() => login('a@b.com', 'pass')}>login</button>
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
  beforeEach(() => {
    localStorage.clear();
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

  it('expired session clears and redirects to login', async () => {
    const expiredUser = {
      user: {
        email: 'a@b.com',
        role: 'patient',
        token: 'token',
        expiresAt: Date.now() - 1000,
      },
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
