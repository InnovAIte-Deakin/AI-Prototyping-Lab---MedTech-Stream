import React from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthProvider, useAuthStore } from "../authStore";

describe("authStore", () => {
  it("defaults to unauthenticated state", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuthStore(), { wrapper });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});