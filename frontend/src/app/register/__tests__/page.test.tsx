import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RegisterPage from "../page";

describe("RegisterPage", () => {
  it("requires role selection", () => {
    render(<RegisterPage />);

    expect(screen.getByLabelText("Role")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByText("Role is required.")).toBeInTheDocument();
  });
});