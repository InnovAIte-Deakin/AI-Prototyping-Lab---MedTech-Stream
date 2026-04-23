'use client';

import React from 'react';
import { useAuth } from '@/store/authStore';
import ThemeToggle from './ThemeToggle';

/**
 * Redesigned navigation bar matching Figma spec.
 * - Logo left ("ReportX" in primary blue)
 * - Center nav links with active underline
 * - Right: primary CTA pill + avatar + theme toggle
 * - Role-aware: patient vs clinician vs unauthenticated
 */
export default function Header() {
  const { user, status, logout } = useAuth();

  const isAuth = status === 'authenticated' && user;
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

  const navLink = (href: string, label: string) => {
    const isActive = currentPath === href || currentPath.startsWith(href + '/');
    return (
      <li key={href}>
        <button
          onClick={() => (window.location.href = href)}
          className={`nav-link${isActive ? ' active' : ''}`}
          type="button"
        >
          {label}
        </button>
      </li>
    );
  };

  // Build center nav items based on role
  const centerLinks: { href: string; label: string }[] = [];
  if (isAuth) {
    centerLinks.push({ href: '/reports', label: 'My Reports' });
  }
  centerLinks.push({ href: '/health', label: 'Health Check' });

  // User initials for avatar
  const initials = user?.email
    ? user.email.charAt(0).toUpperCase()
    : '?';

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="nav-header">
        <div className="nav-header-inner">
          {/* Logo */}
          <a href="/" className="nav-logo">
            <div className="nav-logo-icon">Rx</div>
            ReportX
          </a>

          {/* Center nav */}
          <ul className="nav-center">
            {centerLinks.map((link) => navLink(link.href, link.label))}
          </ul>

          {/* Right actions */}
          <div className="nav-right">
            <button
              onClick={() => (window.location.href = '/parse')}
              className="nav-cta"
              type="button"
            >
              Review My Report
            </button>

            {isAuth ? (
              <>
                <div className="nav-avatar" title={`${user.email} (${user.role})`}>
                  {initials}
                </div>
                <button
                  onClick={logout}
                  className="nav-link"
                  type="button"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => (window.location.href = '/auth/login')}
                  className="nav-link"
                  type="button"
                >
                  Login
                </button>
                <button
                  onClick={() => (window.location.href = '/auth/register')}
                  className="nav-link"
                  type="button"
                >
                  Sign Up
                </button>
              </>
            )}

            <ThemeToggle />
          </div>
        </div>
      </header>
    </>
  );
}
