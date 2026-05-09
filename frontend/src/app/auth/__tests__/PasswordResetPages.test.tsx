import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../login/page';
import ForgotPasswordPage from '../forgot-password/page';
import ResetPasswordPage from '../reset-password/page';
import { AuthProvider } from '@/store/authStore';

const navigationState = vi.hoisted(() => ({
  token: 'valid-reset-token',
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams(navigationState.token ? `token=${navigationState.token}` : ''),
  useRouter: () => ({
    replace: navigationState.replace,
  }),
}));

describe('Password reset pages', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    navigationState.token = 'valid-reset-token';
    navigationState.replace.mockReset();
    vi.restoreAllMocks();
  });

  it('login page links to forgot password page', () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    const link = screen.getByRole('link', { name: /forgot password/i });

    expect(link).toHaveAttribute('href', '/auth/forgot-password');
  });

  it('forgot password form submits email and shows generic confirmation', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        message: 'If an account exists for that email, a password reset link has been sent.',
      }),
    }));
    vi.stubGlobal('fetch', fetchSpy);

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'reset.user@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if an account exists for that email/i)).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/auth/forgot-password',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reset.user@example.com' }),
      })
    );
  });

  it('reset form validates password match before submit', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: 'NewPassword123!' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'DifferentPassword123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('expired or invalid reset token renders error with link back', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Password reset token expired' }),
    }));
    vi.stubGlobal('fetch', fetchSpy);

    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: 'NewPassword123!' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'NewPassword123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password reset token expired/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /request a new reset link/i })).toHaveAttribute(
      'href',
      '/auth/forgot-password'
    );
  });
});