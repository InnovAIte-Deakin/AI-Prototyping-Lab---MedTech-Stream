'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Role = 'patient' | 'caregiver' | 'clinician';

export type AuthUser = {
  id?: string;
  email: string;
  role: Role;
  displayName?: string;
};

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

type AuthSession = {
  user: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
};

type AuthContextType = {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, role: Role) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<boolean>;
  isExpired: () => boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'reportx_session';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const SESSION_DURATION_MS = 1000 * 60 * 60; // 1h

type UserRecord = {
  password: string;
  role: Role;
};

type UserStore = Record<string, UserRecord>;

function safeRedirect(path: string) {
  if (typeof window === 'undefined') return;
  // During tests, jsdom does not support real navigation; use history.replaceState to avoid errors.
  const isJsdom = navigator.userAgent.includes('jsdom');
  if (isJsdom) {
    try {
      window.history.replaceState(null, '', path);
    } catch {
      // ignore
    }
    return;
  }

  try {
    window.location.href = path;
  } catch {
    // ignore network or environment complications.
  }
}

function loadStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.user || !parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistSession(session: AuthSession | null) {
  if (typeof window === 'undefined') return;
  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

function loadUserStore(): UserStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(USERS_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UserStore;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function persistUserStore(store: UserStore) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USERS_STORE_KEY, JSON.stringify(store));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>('unknown');
  const user = session?.user ?? null;

  const isExpired = useCallback(() => {
    if (!session) return true;
    return Date.now() > session.accessTokenExpiresAt;
  }, [session]);

  const logout = useCallback(async () => {
    const token = session?.accessToken;
    setSession(null);
    setStatus('unauthenticated');
    persistSession(null);

    if (token) {
      try {
        await fetch(`${BACKEND_URL}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // no-op on logout failure
      }
    }

    safeRedirect('/auth/login');
  }, [session]);

  const refresh = useCallback(async (): Promise<boolean> => {
    const stored = loadStoredSession();
    if (!stored) {
      setSession(null);
      setStatus('unauthenticated');
      return false;
    }

    if (Date.now() < stored.accessTokenExpiresAt) {
      setSession(stored);
      setStatus('authenticated');
      return true;
    }

    if (Date.now() > stored.refreshTokenExpiresAt) {
      setSession(null);
      setStatus('unauthenticated');
      persistSession(null);
      return false;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: stored.refreshToken }),
      });
      if (!res.ok) {
        throw new Error('Refresh failed');
      }
      const data = await res.json();

      const refreshedSession: AuthSession = {
        user: {
          id: data.user.id,
          email: data.user.email,
          role: data.user.roles?.[0] as Role,
          displayName: data.user.display_name,
        },
        accessToken: data.access_token,
        accessTokenExpiresAt: new Date(data.access_token_expires_at).getTime(),
        refreshToken: data.refresh_token,
        refreshTokenExpiresAt: new Date(data.refresh_token_expires_at).getTime(),
      };
      setSession(refreshedSession);
      setStatus('authenticated');
      persistSession(refreshedSession);
      return true;
    } catch {
      setSession(null);
      setStatus('unauthenticated');
      persistSession(null);
      return false;
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      if (!email || !password) throw new Error('Email and password are required.');

      const res = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const message = json?.detail || 'Invalid email or password.';
        setSession(null);
        setStatus('unauthenticated');
        throw new Error(message);
      }

      const data = await res.json();

      const nextSession: AuthSession = {
        user: {
          id: data.user.id,
          email: data.user.email,
          role: data.user.roles?.[0] as Role,
          displayName: data.user.display_name,
        },
        accessToken: data.access_token,
        accessTokenExpiresAt: new Date(data.access_token_expires_at).getTime(),
        refreshToken: data.refresh_token,
        refreshTokenExpiresAt: new Date(data.refresh_token_expires_at).getTime(),
      };

      setSession(nextSession);
      setStatus('authenticated');
      persistSession(nextSession);
      safeRedirect('/parse');
    },
    []
  );

  const register = useCallback(
    async (email: string, password: string, role: Role) => {
      if (!email || !password || !role) throw new Error('Email, password, and role are required.');

      const res = await fetch(`${BACKEND_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role, display_name: '' }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const message = json?.detail || 'Registration failed.';
        throw new Error(message);
      }

      // On successful register, log in to get tokens.
      await login(email, password);
    },
    [login]
  );

  useEffect(() => {
    const initialize = async () => {
      const stored = loadStoredSession();
      if (!stored) {
        setSession(null);
        setStatus('unauthenticated');
        return;
      }
      if (Date.now() <= stored.accessTokenExpiresAt) {
        setSession(stored);
        setStatus('authenticated');
        return;
      }
      const ok = await refresh();
      if (!ok && typeof window !== 'undefined') {
        window.location.href = '/auth/login';
      }
    };
    void initialize();
  }, [refresh]);

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
