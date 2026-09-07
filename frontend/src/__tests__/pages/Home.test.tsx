import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Home from "../../pages/Home";

describe("Home", () => {
  it("renders Login and Register links pointing at the right routes", () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/register");
  });
});
