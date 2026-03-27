'use client';

import React from 'react';
import { useAuth } from '@/store/authStore';
import ThemeToggle from './ThemeToggle';

export default function Header() {
  const { user, status, logout } = useAuth();

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="modern-header">
        <div className="header-container">
          <div className="logo-section">
            <a href="/" className="logo">
              <div className="logo-icon">Rx</div>
              ReportX
            </a>
          </div>

          <nav className="nav-section" aria-label="Primary navigation">
            <ul className="nav-buttons">
              <li>
                <button
                  onClick={() => window.location.href = '/parse'}
                  className="nav-btn nav-btn-primary"
                  type="button"
                >
                  Review My Report
                </button>
              </li>
              <li>
                <button
                  onClick={() => window.location.href = '/health'}
                  className="nav-btn nav-btn-outline"
                  type="button"
                >
                  Health Check
                </button>
              </li>
              {status === 'authenticated' && user ? (
                <>
                  <li>
                    <button
                      onClick={logout}
                      className="nav-btn nav-btn-outline"
                      type="button"
                    >
                      Logout
                    </button>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', marginLeft: '0.5rem' }}>
                    <small style={{ color: '#555' }}>{user.email} ({user.role})</small>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <button onClick={() => (window.location.href = '/auth/login')} className="nav-btn nav-btn-outline" type="button">Login</button>
                  </li>
                  <li>
                    <button onClick={() => (window.location.href = '/auth/register')} className="nav-btn nav-btn-outline" type="button">Register</button>
                  </li>
                </>
              )}
            </ul>
            <ThemeToggle />
          </nav>
        </div>
      </header>
    </>
  );
}
