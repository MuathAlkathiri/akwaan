import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: { isAdmin: false, isAuthenticated: true, user: { email: "a@b.com" } },
  account: undefined as unknown,
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => state.auth,
}));
vi.mock("../api/token-balance", () => ({
  useTokenAccount: () => ({ data: state.account }),
}));

import { LaunchAllowance, spokenMatches } from "./launch-allowance";
import { moreMatchesMailto } from "../contact";

const weekly = (remaining: number, renewsAt?: string) => ({
  balance: 0,
  campaign: { open: true },
  weekly: { limit: 3, used: 3 - remaining, remaining, renewsAt },
});

describe("the launch month on the home page", () => {
  beforeEach(() => {
    state.auth = {
      isAdmin: false,
      isAuthenticated: true,
      user: { email: "a@b.com" },
    };
    state.account = undefined;
  });

  it("tells a player how many they have left this week", () => {
    state.account = weekly(3, "2026-12-09T21:00:00.000Z");
    render(<LaunchAllowance />);
    const strip = screen.getByTestId("launch-allowance");
    expect(strip).toHaveTextContent("باقي لك 3 مباريات هالأسبوع");
    expect(strip).toHaveTextContent("إطلاق تجريبي");
    expect(screen.queryByTestId("launch-allowance-contact")).toBeNull();
  });

  it("says when they come back, and offers a way to ask for more", () => {
    state.account = weekly(0, "2026-12-09T21:00:00.000Z");
    render(<LaunchAllowance />);
    expect(screen.getByTestId("launch-allowance")).toHaveTextContent(
      "خلصت مبارياتك، تتجدد يوم الخميس",
    );
    const contact = screen.getByTestId("launch-allowance-contact");
    expect(contact).toHaveTextContent("تبي أكثر؟ كلمنا");
    // The account's own email is already in the message.
    expect(decodeURIComponent(contact.getAttribute("href")!)).toContain(
      "إيميل حسابي: a@b.com",
    );
  });

  it("promises no Thursday in the last week", () => {
    state.account = weekly(0);
    render(<LaunchAllowance />);
    expect(screen.getByTestId("launch-allowance")).not.toHaveTextContent(
      "الخميس",
    );
  });

  it("mentions a balance the player can still use", () => {
    state.account = { ...weekly(0, "2026-12-09T21:00:00.000Z"), balance: 2 };
    render(<LaunchAllowance />);
    expect(screen.getByTestId("launch-allowance")).toHaveTextContent(
      "وعندك مباراتين في رصيدك",
    );
  });

  it("tells a visitor the offer, without a number of their own", () => {
    state.auth = { isAdmin: false, isAuthenticated: false, user: null as never };
    render(<LaunchAllowance />);
    expect(screen.getByTestId("launch-allowance")).toHaveTextContent(
      "أول شهر ببلاش: 3 مباريات كل أسبوع",
    );
  });

  it("disappears once the campaign is over, and for an admin", () => {
    state.account = { balance: 4, campaign: { open: false } };
    const view = render(<LaunchAllowance />);
    expect(screen.queryByTestId("launch-allowance")).toBeNull();
    view.unmount();

    state.auth = { isAdmin: true, isAuthenticated: true, user: { email: "x" } };
    state.account = weekly(3);
    render(<LaunchAllowance />);
    expect(screen.queryByTestId("launch-allowance")).toBeNull();
  });
});

describe("counting Matches out loud", () => {
  it("uses the spoken forms, with Western digits", () => {
    expect(spokenMatches(1)).toBe("مباراة وحدة");
    expect(spokenMatches(2)).toBe("مباراتين");
    expect(spokenMatches(3)).toBe("3 مباريات");
    expect(spokenMatches(12)).toBe("12 مباراة");
  });
});

describe("the «كلمنا» link", () => {
  it("opens a ready-written email to support", () => {
    const link = moreMatchesMailto("a@b.com");
    expect(link.startsWith("mailto:support@playakwaan.com?")).toBe(true);
    expect(decodeURIComponent(link)).toContain("أبغى مباريات زيادة في أكوان");
  });
});
