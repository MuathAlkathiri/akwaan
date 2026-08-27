import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  isAdmin: false,
  isAuthenticated: true,
  pathname: "/",
  logout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => (auth.isAdmin ? "/admin" : auth.pathname),
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
    isAuthenticated: auth.isAuthenticated,
    logout: auth.logout,
  }),
}));

import { Header } from "@/components/layout/header";

beforeEach(() => {
  auth.isAdmin = false;
  auth.isAuthenticated = true;
  auth.pathname = "/";
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
    expect(screen.getByRole("link", { name: "مبارياتي" })).toHaveAttribute(
      "href",
      "/matches",
    );
  });

  it("does not expose My Games to signed-out navigation", () => {
    auth.isAuthenticated = false;
    render(<Header />);
    expect(screen.queryByRole("link", { name: "مبارياتي" })).toBeNull();
  });

  it("keeps My Games out of the Match header HUD", () => {
    render(<Header variant="match" hud={<span>النتيجة</span>} />);
    expect(screen.getByText("النتيجة")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "مبارياتي" })).toBeNull();
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

  it("hides the redundant login action on the login page", () => {
    auth.isAuthenticated = false;
    auth.pathname = "/login";
    render(<Header merged />);

    expect(screen.queryByRole("link", { name: "تسجيل الدخول" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "أكوان - الرئيسية" }),
    ).toBeInTheDocument();
  });
});
