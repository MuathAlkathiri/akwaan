import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const catalog = vi.hoisted(() => ({
  worlds: [
    {
      id: "w-football",
      name: "كرة القدم",
      slug: "football",
      banner: { url: "/uploads/world-content/worlds/football.png" },
      sortOrder: 1,
      scopeCount: 4,
      challengeConfigurationCount: 4,
    },
    {
      id: "w-anime",
      name: "الأنمي",
      slug: "anime",
      banner: { url: "/uploads/world-content/worlds/anime.png" },
      sortOrder: 2,
      scopeCount: 4,
      challengeConfigurationCount: 4,
    },
    {
      id: "w-games",
      name: "الألعاب",
      slug: "video-games",
      banner: { url: "/uploads/world-content/worlds/games.png" },
      sortOrder: 3,
      scopeCount: 4,
      challengeConfigurationCount: 4,
    },
    {
      id: "w-puzzles",
      name: "الألغاز",
      slug: "puzzles",
      banner: { url: "/uploads/world-content/worlds/puzzles.png" },
      sortOrder: 4,
      scopeCount: 4,
      challengeConfigurationCount: 4,
    },
  ],
  fetch: vi.fn(),
}));

vi.mock("@/features/worlds/api/player-catalog.api", () => ({
  fetchPlayableWorlds: () => catalog.fetch(),
  fetchPlayableWorld: vi.fn(),
  fetchPlayableScopes: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    user: null,
    isAdmin: false,
    isAuthenticated: false,
    logout: vi.fn(),
  }),
}));

import { Footer } from "@/components/layout/footer";
import { Header, smoothScrollToHash } from "@/components/layout/header";
import { HowToPlayPage } from "@/features/how-to-play";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  catalog.fetch.mockReset();
  catalog.fetch.mockResolvedValue(catalog.worlds);
});

/** The walkthrough reads the shared catalogue query, so it needs the app's client. */
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HowToPlayPage />
    </QueryClientProvider>,
  );
}

describe("the how to play walkthrough", () => {
  it("opens on the hero the navigation promises", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "كيف تلعب أكوان؟" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("شاشة وحدة تجمعكم، وجوال كل لاعب يصير أداة اللعب"),
    ).toBeInTheDocument();
  });

  it("tells the four steps in the order a group lives them", () => {
    renderPage();

    const steps = screen.getAllByRole("listitem");
    expect(
      steps.map((step) => step.querySelector("h3")?.textContent),
    ).toEqual([
      "جهزوا الشاشة",
      "اختاروا 3 عوالم",
      "اربطوا جوالاتكم",
      "العبوا وتنافسوا",
    ]);
  });

  it("ends on the existing way into a Match, not a new one", () => {
    renderPage();

    // The walkthrough must not open its own entry point: this is the same
    // destination the home hero's primary action already uses.
    expect(screen.getByRole("link", { name: "ابدأ اللعبة" })).toHaveAttribute(
      "href",
      "/#worlds",
    );
  });

  it("draws Worlds from the shared catalogue query, not a second fetcher", async () => {
    renderPage();

    expect(await screen.findByText("كرة القدم")).toBeInTheDocument();
    expect(screen.getByText("الأنمي")).toBeInTheDocument();
    expect(screen.getByText("الألعاب")).toBeInTheDocument();
    // One request for the page: the same key the home grid already warms.
    expect(catalog.fetch).toHaveBeenCalledTimes(1);
  });

  it("marks exactly three Worlds as chosen, because that is the rule", async () => {
    const { container } = renderPage();

    await screen.findByText("كرة القدم");
    const badges = [...container.querySelectorAll(".akwaan-numeral")]
      .map((el) => el.textContent)
      .filter((text) => text && ["1", "2", "3", "4"].includes(text));
    // Three order badges on the portals, plus the four step numbers.
    expect(badges.filter((text) => text === "4")).toHaveLength(1);
    expect(badges).toHaveLength(7);
  });

  it("keeps the Worlds step inert — it explains a rule, it does not apply it", async () => {
    const { container } = renderPage();

    await screen.findByText("كرة القدم");
    const portals = container.querySelector('ul[dir="rtl"]');
    // No button, no link, no handler: this must never enrol a World in a Match.
    expect(portals?.querySelectorAll("button, a, input")).toHaveLength(0);
  });

  it("holds the Worlds step's shape when the catalogue cannot be read", async () => {
    catalog.fetch.mockRejectedValue(new Error("offline"));
    const { container } = renderPage();

    // Four slots either way, so the step never collapses or jumps, and no
    // broken-image icon reaches the page.
    await screen.findByRole("heading", { name: "اختاروا 3 عوالم" });
    const portals = container.querySelector('ul[dir="rtl"]');
    expect(portals?.querySelectorAll("li")).toHaveLength(4);
    // No image element at all in the portals, so nothing can render broken.
    expect(portals?.querySelectorAll("img")).toHaveLength(0);
  });

  it("shows no scannable code, because there is no Match to join yet", () => {
    const { container } = renderPage();

    // A real QR here would encode a join URL for a Match that does not exist.
    expect(container.querySelector("canvas")).toBeNull();
    expect(
      container.querySelector('[data-testid="qr-enlarge-trigger"]'),
    ).toBeNull();
  });
});

describe("scrolling to a section", () => {
  /** A click we can ask afterwards whether the handler took it over. */
  function clickEvent() {
    const prevented = { current: false };
    const event = {
      preventDefault: () => {
        prevented.current = true;
      },
    } as unknown as React.MouseEvent<HTMLAnchorElement>;
    return { prevented, event };
  }

  it("glides to a section on this page instead of jumping to it", () => {
    const section = document.createElement("section");
    section.id = "how-to-play";
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    document.body.append(section);

    const { event, prevented } = clickEvent();
    smoothScrollToHash(event, "/#how-to-play");

    expect(prevented.current).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(window.location.hash).toBe("#how-to-play");

    section.remove();
    scrollIntoView.mockRestore();
  });

  it("leaves navigation to another page alone", () => {
    const { event, prevented } = clickEvent();
    smoothScrollToHash(event, "/somewhere-else#how-to-play");

    expect(prevented.current).toBe(false);
  });

  it("leaves a section that is not on the page to the browser", () => {
    const { event, prevented } = clickEvent();
    smoothScrollToHash(event, "/#not-rendered");

    expect(prevented.current).toBe(false);
  });
});

describe("site chrome", () => {
  it("offers the how-to-play link from the header", () => {
    render(<Header />);

    expect(
      screen.getByRole("link", { name: "كيف تلعب" }),
    ).toHaveAttribute("href", "/how-to-play");
  });

  it("carries the brand, both link columns, and the notice", () => {
    render(<Footer />);

    // The brand block is the canonical mark, not the word set in body type.
    expect(screen.getByAltText("أكوان")).toBeInTheDocument();
    expect(
      screen.getByText(/لعبة جماعية تجمع المعرفة/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "روابط سريعة" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "الدعم والقانونية" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "مبارياتي" })).toHaveAttribute(
      "href",
      "/matches",
    );
    // Worlds is a section of the home page, so the footer must reuse the
    // header's destination rather than inventing a /worlds route.
    expect(screen.getByRole("link", { name: "العوالم" })).toHaveAttribute(
      "href",
      "/#worlds",
    );
    expect(screen.getByRole("link", { name: "كيف تلعب" })).toHaveAttribute(
      "href",
      "/how-to-play",
    );
    expect(
      screen.getByRole("link", { name: "support@playakwaan.com" }),
    ).toHaveAttribute("href", "mailto:support@playakwaan.com");
    expect(
      screen.getByText("© 2026 أكوان. جميع الحقوق محفوظة."),
    ).toBeInTheDocument();
  });
});
