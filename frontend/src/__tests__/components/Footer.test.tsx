import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Footer from "../../components/Footer";

describe("Footer", () => {
  it("renders the copyright with the current year and a Privacy Policy link", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    expect(screen.getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Privacy Policy" });
    expect(link).toHaveAttribute("href", "/privacy-policy");
  });
});
