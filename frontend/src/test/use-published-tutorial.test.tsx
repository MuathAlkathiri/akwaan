import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "@/lib/api/client";
import { notifyPublishedTutorialInvalidation } from "@/features/challenge-explainer/tutorial-cache-events";
import { usePublishedTutorial } from "@/features/challenge-explainer/use-published-tutorial";

vi.mock("@/lib/api/client", () => ({
  default: { get: vi.fn() },
}));

const get = vi.mocked(apiClient.get);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  get.mockReset();
});

describe("published tutorial cache scope", () => {
  it("requests World-specific content and does not reuse another World's cache", async () => {
    get.mockImplementation(
      async (url) =>
        ({
          data: {
            data: {
              scenario: { kind: "ryo", prompt: String(url) },
            },
          },
        }) as never,
    );

    const { result, rerender } = renderHook(
      ({ worldId }: { worldId?: string }) =>
        usePublishedTutorial("read-your-opponent", worldId),
      {
        initialProps: { worldId: "world-football" },
        wrapper,
      },
    );
    await waitFor(() =>
      expect(result.current.data?.scenario.prompt).toContain(
        "/worlds/world-football/mechanics/read-your-opponent/tutorial",
      ),
    );

    rerender({ worldId: "world-anime" });
    await waitFor(() =>
      expect(result.current.data?.scenario.prompt).toContain(
        "/worlds/world-anime/mechanics/read-your-opponent/tutorial",
      ),
    );
    expect(get).toHaveBeenNthCalledWith(
      1,
      "/worlds/world-football/mechanics/read-your-opponent/tutorial",
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      "/worlds/world-anime/mechanics/read-your-opponent/tutorial",
    );
  });

  it("uses the generic endpoint only when no World context is supplied", async () => {
    get.mockResolvedValueOnce({
      data: {
        data: { scenario: { kind: "ryo", prompt: "عام" } },
      },
    } as never);

    const { result } = renderHook(
      () => usePublishedTutorial("read-your-opponent"),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.data?.scenario.prompt).toBe("عام"),
    );
    expect(get).toHaveBeenCalledWith("/mechanics/read-your-opponent/tutorial");
  });

  it("invalidates only the matching World query", async () => {
    get
      .mockResolvedValueOnce({
        data: {
          data: {
            scenario: { kind: "ryo", prompt: "أنمي" },
          },
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          data: {
            scenario: { kind: "ryo", prompt: "أنمي — محدث" },
          },
        },
      } as never);

    const { result } = renderHook(
      () => usePublishedTutorial("read-your-opponent", "world-anime"),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.data?.scenario.prompt).toBe("أنمي"),
    );

    notifyPublishedTutorialInvalidation({
      mechanicKey: "read-your-opponent",
      worldId: "world-football",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(get).toHaveBeenCalledTimes(1);

    notifyPublishedTutorialInvalidation({
      mechanicKey: "read-your-opponent",
      worldId: "world-anime",
    });
    await waitFor(() =>
      expect(result.current.data?.scenario.prompt).toBe("أنمي — محدث"),
    );
    expect(get).toHaveBeenCalledTimes(2);
  });
});
