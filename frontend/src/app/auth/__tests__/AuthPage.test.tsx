import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoginPage from '../login/page';
import RegisterPage from '../register/page';
import { AuthProvider } from '@/store/authStore';

describe('Auth pages', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
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
      expect(window.location.pathname).toBe('/parse');
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
