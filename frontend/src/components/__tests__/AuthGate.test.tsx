import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AuthGate from "../AuthGate";
import { AuthProvider } from "@/store/authStore";

describe("AuthGate", () => {
  it("blocks unauthenticated users", () => {
    render(
      <AuthProvider>
        <AuthGate>
          <div>Protected content</div>
        </AuthGate>
      </AuthProvider>,
    );

    expect(screen.getByText("Login required.")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});