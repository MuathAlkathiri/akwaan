import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/api/client", () => ({
  default: {
    get: http.get,
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  fetchChallengeTypes,
  fetchWorlds,
} from "@/features/world-management/api/world-content.api";
import { ChallengeTypeCatalog } from "@/features/world-management/components/challenge-types/challenge-type-catalog";
import { WorldManagementWorkspace } from "@/features/world-management/components/layout/world-management-workspace";
import {
  useChallengeTypes,
  useWorlds,
} from "@/features/world-management/hooks/use-world-content";

const emptyBoard = {
  worldId: "world-1",
  slots: [],
  blockers: [],
  warnings: [],
};
const worldReadiness = {
  worldId: "world-1",
  readiness: "not_ready",
  blockers: [],
  warnings: [],
  board: emptyBoard,
  scopeCompatibility: [],
  boardReady: false,
  hasRelationalChallenge: false,
};
const worlds = [
  {
    id: "world-1",
    name: "كرة قدم",
    slug: "football",
    status: "active",
    sortOrder: 1,
    scopeCount: 0,
    challengeConfigurationCount: 0,
    contentItemCount: 0,
    readiness: worldReadiness,
  },
  {
    id: "world-2",
    name: "انمي",
    slug: "anime",
    status: "active",
    sortOrder: 2,
    scopeCount: 0,
    challengeConfigurationCount: 0,
    contentItemCount: 0,
    readiness: { ...worldReadiness, worldId: "world-2" },
  },
];

const challengeTypes = [
  {
    id: "challenge-1",
    name: "اقرأ خصمك",
    slug: "read-your-opponent",
    family: "ryo",
    status: "active",
    itemStructure: "discrete_triple",
    answerMode: "ryo",
    scoringRuleId: "ryo.payoff-matrix",
    isExclusive: false,
    sortOrder: 1,
    worldConfigurationCount: 0,
    contentItemCount: 0,
    readiness: { readiness: "ready", blockers: [], warnings: [] },
    defaultPresentation: { inputType: "phone", timerSeconds: 10 },
  },
  {
    id: "challenge-2",
    name: "أفضل 5",
    slug: "top-5",
    family: "signature",
    status: "active",
    itemStructure: "continuous",
    answerMode: "top_5",
    scoringRuleId: "top-5.keep-or-give",
    isExclusive: true,
    sortOrder: 2,
    worldConfigurationCount: 0,
    contentItemCount: 0,
    readiness: { readiness: "ready", blockers: [], warnings: [] },
    defaultPresentation: { inputType: "phone", timerSeconds: null },
  },
];

function TestProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      {children}
    </QueryClientProvider>
  );
}

function QueryCountProbe() {
  const worldsQuery = useWorlds();
  const challengeTypesQuery = useChallengeTypes();
  return (
    <output>
      worlds:{worldsQuery.data?.length ?? "pending"};challengeTypes:
      {challengeTypesQuery.data?.length ?? "pending"}
    </output>
  );
}

describe("World Management response pipeline", () => {
  it("unwraps the real backend envelope exactly once", async () => {
    http.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: {
          data: path === "/admin/worlds" ? worlds : challengeTypes,
        },
      }),
    );

    await expect(fetchWorlds()).resolves.toEqual(worlds);
    await expect(fetchChallengeTypes()).resolves.toEqual(challengeTypes);
  });

  it("carries successful arrays through React Query", async () => {
    http.get.mockImplementation((path: string) =>
      Promise.resolve({
        data: {
          data: path === "/admin/worlds" ? worlds : challengeTypes,
        },
      }),
    );

    render(<QueryCountProbe />, { wrapper: TestProviders });

    await waitFor(() =>
      expect(
        screen.getByText("worlds:2;challengeTypes:2"),
      ).toBeInTheDocument(),
    );
  });

  it("renders successful Worlds and ChallengeTypes instead of empty states", async () => {
    http.get.mockImplementation((path: string) => {
      const data =
        path === "/admin/worlds"
          ? worlds
          : path === "/admin/challenge-types"
            ? challengeTypes
            : [];
      return Promise.resolve({ data: { data } });
    });

    const worldRender = render(<WorldManagementWorkspace />, {
      wrapper: TestProviders,
    });
    expect(await screen.findByText("كرة قدم")).toBeInTheDocument();
    expect(screen.getByText("انمي")).toBeInTheDocument();
    expect(screen.queryByText("لا توجد عوالم بعد")).not.toBeInTheDocument();
    worldRender.unmount();

    render(<ChallengeTypeCatalog />, { wrapper: TestProviders });
    expect((await screen.findAllByText("اقرأ خصمك")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("أفضل 5").length).toBeGreaterThan(0);
    expect(screen.queryByText("لا توجد مكانيكا بعد")).not.toBeInTheDocument();
  });
});
