import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PrivacyPolicy from "../../pages/PrivacyPolicy";

describe("PrivacyPolicy", () => {
  it("renders the policy heading and a working Back to Home link", () => {
    render(
      <MemoryRouter>
        <PrivacyPolicy />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
  });
});
