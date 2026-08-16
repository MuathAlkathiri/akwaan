import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  isAdmin: false,
  logout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => (auth.isAdmin ? "/admin" : "/"),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "player@example.test",
      fullName: "لاعب أكوان",
      role: auth.isAdmin ? "admin" : "user",
    },
    isAdmin: auth.isAdmin,
    isAuthenticated: true,
    logout: auth.logout,
  }),
}));

import { Header } from "@/components/layout/header";

beforeEach(() => {
  auth.isAdmin = false;
  auth.logout.mockReset();
});

describe("authenticated header controls", () => {
  it("shows no player identity while keeping logout available", () => {
    render(<Header />);

    expect(screen.queryByText("لاعب أكوان")).toBeNull();
    expect(screen.queryByText("مرحبًا بك")).toBeNull();
    expect(screen.queryByText("player@example.test")).toBeNull();
    expect(document.querySelector('[data-slot="avatar"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "خروج" }));
    expect(auth.logout).toHaveBeenCalledOnce();
  });

  it("preserves role-based admin navigation without exposing identity", () => {
    auth.isAdmin = true;
    render(<Header />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(screen.getByRole("link", { name: "المستخدمين" })).toHaveAttribute(
      "href",
      "/admin/subscriptions",
    );
    expect(screen.queryByText("لاعب أكوان")).toBeNull();
    expect(screen.getByRole("button", { name: "خروج" })).toBeInTheDocument();
  });
});
