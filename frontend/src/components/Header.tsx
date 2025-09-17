'use client';

import React from 'react';
import ThemeToggle from './ThemeToggle';

export default function Header() {
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
            </ul>
            <ThemeToggle />
          </nav>
        </div>
      </header>
    </>
  );
}
