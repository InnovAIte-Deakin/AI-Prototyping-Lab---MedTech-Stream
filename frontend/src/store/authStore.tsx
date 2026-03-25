"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

export type UserRole = "patient" | "caregiver" | "clinician";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, role: UserRole) => Promise<boolean>;
  logout: () => Promise<void>;
  clearSession: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(_email: string, _password: string) {
    setIsLoading(true);
    setError(null);
    setIsLoading(false);
    return false;
  }

  async function register(_email: string, _password: string, _role: UserRole) {
    setIsLoading(true);
    setError(null);
    setIsLoading(false);
    return false;
  }

  async function logout() {
    setUser(null);
    setError(null);
  }

  function clearSession() {
    setUser(null);
    setError(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      error,
      login,
      register,
      logout,
      clearSession,
    }),
    [user, isLoading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthStore() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthStore must be used within an AuthProvider");
  }
  return ctx;
}