'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Role = 'patient' | 'caregiver' | 'clinician';

export type AuthUser = {
  email: string;
  role: Role;
  token: string;
  expiresAt: number;
};

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

type AuthContextType = {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, role: Role) => Promise<void>;
  logout: () => void;
  refresh: () => void;
  isExpired: () => boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'reportx_session';
const SESSION_DURATION_MS = 1000 * 60 * 60; // 1h

function loadStoredSession(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user: AuthUser };
    if (!parsed?.user) return null;
    return parsed.user;
  } catch {
    return null;
  }
}

function persistSession(user: AuthUser | null) {
  if (typeof window === 'undefined') return;
  if (!user) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }));
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('unknown');

  const isExpired = useCallback(() => {
    if (!user) return true;
    return Date.now() > user.expiresAt;
  }, [user]);

  const logout = useCallback(() => {
    setUser(null);
    setStatus('unauthenticated');
    persistSession(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
  }, []);

  const refresh = useCallback(() => {
    const stored = loadStoredSession();
    if (!stored) {
      setUser(null);
      setStatus('unauthenticated');
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login';
      }
      return;
    }
    if (Date.now() > stored.expiresAt) {
      setUser(null);
      setStatus('unauthenticated');
      persistSession(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login';
      }
      return;
    }
    setUser(stored);
    setStatus('authenticated');
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      if (!email || !password) throw new Error('Email and password are required.');
      const existing = loadStoredSession();
      let role: Role = 'patient';
      if (existing?.email === email) {
        role = existing.role;
      }
      const nextUser: AuthUser = {
        email,
        role,
        token: `token-${Date.now()}`,
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      setUser(nextUser);
      setStatus('authenticated');
      persistSession(nextUser);
      if (typeof window !== 'undefined') {
        window.location.href = '/parse';
      }
    },
    []
  );

  const register = useCallback(
    async (email: string, password: string, role: Role) => {
      if (!email || !password || !role) throw new Error('Email, password, and role are required.');
      const nextUser: AuthUser = {
        email,
        role,
        token: `token-${Date.now()}`,
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      setUser(nextUser);
      setStatus('authenticated');
      persistSession(nextUser);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/parse');
      }
    },
    []
  );

  useEffect(() => {
    const stored = loadStoredSession();
    if (stored && Date.now() <= stored.expiresAt) {
      setUser(stored);
      setStatus('authenticated');
    } else {
      setUser(null);
      setStatus('unauthenticated');
      if (stored) {
        persistSession(null);
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', '/auth/login');
        }
      }
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && user && isExpired()) {
      logout();
    }
  }, [user, status, isExpired, logout]);

  useEffect(() => {
    if (status !== 'authenticated' || !user) return;
    const timer = window.setInterval(() => {
      if (isExpired()) {
        logout();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, user, isExpired, logout]);

  const value = useMemo(
    () => ({ user, status, login, register, logout, refresh, isExpired }),
    [user, status, login, register, logout, refresh, isExpired]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
