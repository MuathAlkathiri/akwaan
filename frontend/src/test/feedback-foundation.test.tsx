import {
  render,
  renderHook,
  screen,
  act,
  waitFor,
} from "@testing-library/react";
import { toast as sonnerToast } from "sonner";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AkwaanLoader } from "@/components/akwaan/akwaan-loader";
import { PendingButtonContent } from "@/components/ui/pending-button-content";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useDelayedVisible } from "@/lib/use-delayed-visible";

/** The four-level feedback foundation, held to its policy. */

function mockReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("AkwaanLoader (branded loading)", () => {
  it("shows the caller's contextual label in an accessible status region", () => {
    mockReducedMotion(false);
    render(<AkwaanLoader label="نجهّز المباراة..." />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region.textContent).toContain("نجهّز المباراة...");
  });

  it("passes different copy per screen — never a hardcoded phrase", () => {
    mockReducedMotion(false);
    const { rerender } = render(<AkwaanLoader label="نرجعك للمباراة..." />);
    expect(screen.getByRole("status").textContent).toContain("نرجعك للمباراة...");
    rerender(<AkwaanLoader label="نجهز التحدي..." />);
    expect(screen.getByRole("status").textContent).toContain("نجهز التحدي...");
  });

  it("stills the orbit under reduced motion while staying legible", () => {
    mockReducedMotion(true);
    render(<AkwaanLoader label="نرجعك للمباراة..." />);
    const orbit = screen.getByTestId("akwaan-loader-orbit");
    expect(orbit).toHaveAttribute("data-motion", "reduced");
    expect(orbit.className).not.toContain("akwaan-orbit");
    // The words still carry the meaning with no motion.
    expect(screen.getByRole("status").textContent).toContain(
      "نرجعك للمباراة...",
    );
  });
});

describe("useDelayedVisible (no-flash gate)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never appears for a wait shorter than the delay", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedVisible(active, 350),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(false);
    // The wait resolves before the delay — nothing was ever shown.
    rerender({ active: false });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(false);
  });

  it("appears only once the wait outlasts the delay", () => {
    const { result } = renderHook(() => useDelayedVisible(true, 350));
    act(() => vi.advanceTimersByTime(350));
    expect(result.current).toBe(true);
  });
});

describe("PendingButtonContent (inline pending)", () => {
  it("swaps to a spinner and pending copy while pending, idle label otherwise", () => {
    const { rerender } = render(
      <Button aria-busy>
        <PendingButtonContent pending pendingLabel="جارٍ الإنشاء…">
          ابدأ المباراة
        </PendingButtonContent>
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("جارٍ الإنشاء…");
    expect(button.querySelector("svg")).toBeTruthy();
    expect(button).toHaveAttribute("aria-busy", "true");

    rerender(
      <Button>
        <PendingButtonContent pending={false} pendingLabel="جارٍ الإنشاء…">
          ابدأ المباراة
        </PendingButtonContent>
      </Button>,
    );
    expect(screen.getByRole("button").textContent).toContain("ابدأ المباراة");
    expect(screen.getByRole("button").querySelector("svg")).toBeNull();
  });
});

describe("global toast surface (visual polish only)", () => {
  it("mounts a single top-centre toaster on the navy Akwaan surface", async () => {
    // jsdom has no matchMedia; Sonner's theme="system" reads it. Shim it (this is
    // a test-env gap, not a product concern — real browsers implement it).
    mockReducedMotion(false);
    render(<Toaster />);
    // Sonner renders its list lazily; a toast brings the list element into the DOM.
    act(() => {
      sonnerToast.success("تم نسخ الرابط");
    });
    let toasters: NodeListOf<Element> = document.querySelectorAll(
      "[data-sonner-toaster]",
    );
    await waitFor(() => {
      toasters = document.querySelectorAll("[data-sonner-toaster]");
      expect(toasters.length).toBeGreaterThan(0);
    });
    // Exactly one global toaster.
    expect(toasters).toHaveLength(1);
    const toaster = toasters[0] as HTMLElement;
    // Positioned top-centre (clear of the fixed header via the offset).
    expect(toaster).toHaveAttribute("data-y-position", "top");
    expect(toaster).toHaveAttribute("data-x-position", "center");
    // Light Akwaan surface + navy text are applied via the Sonner CSS vars
    // somewhere in the toaster subtree (Sonner chooses which element carries them).
    const html = document.body.innerHTML;
    expect(html).toContain("hsl(var(--card))");
    expect(html).toContain("hsl(var(--brand-navy))");
    // And the toast text reads naturally.
    expect(document.body.textContent).toContain("تم نسخ الرابط");
  });
});

describe("reconnect feedback stays silent (no toast storms)", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("never fires a success toast on hydration, resync, or reconnect", () => {
    // Silent success is structural: the provider and the Match host surfaces
    // that own reconnect/resync never reach for a toast at all.
    for (const path of [
      "src/features/live-game-session/components/live-session-provider.tsx",
      "src/features/live-game-session/match/components/match-connection-banner.tsx",
      "src/features/live-game-session/match/components/match-host-screen.tsx",
    ]) {
      expect(read(path)).not.toContain("toast.success");
    }
  });

  it("does not reintroduce the old restore-success message", () => {
    for (const path of [
      "src/features/live-game-session/components/live-session-provider.tsx",
      "src/features/live-game-session/match/components/match-connection-banner.tsx",
      "src/features/live-game-session/match/components/match-host-screen.tsx",
    ]) {
      expect(read(path)).not.toContain("تمت استعادة");
    }
  });
});
