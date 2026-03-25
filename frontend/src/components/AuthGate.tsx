"use client";

import React from "react";

import { useAuthStore } from "@/store/authStore";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <p>Login required.</p>;
  }

  return <>{children}</>;
}