import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  refetchWorlds: vi.fn(),
  refetchChallengeTypes: vi.fn(),
}));

vi.mock("@/features/world-management/hooks/use-world-content", () => ({
  useWorlds: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    isFetching: false,
    refetch: hooks.refetchWorlds,
  }),
  useChallengeTypes: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    isFetching: false,
    refetch: hooks.refetchChallengeTypes,
  }),
  useChallengeTypeDeletionPreview: () => ({ mutate: vi.fn() }),
  useDeleteChallengeType: () => ({ isPending: false, mutate: vi.fn() }),
}));

import { ChallengeTypeCatalog } from "@/features/world-management/components/challenge-types/challenge-type-catalog";
import { WorldManagementWorkspace } from "@/features/world-management/components/layout/world-management-workspace";

describe("World Management query errors", () => {
  it("does not present a failed Worlds request as an empty catalog", () => {
    render(<WorldManagementWorkspace />);

    expect(screen.getByText("تعذر تحميل العوالم")).toBeInTheDocument();
    expect(screen.queryByText("لا توجد عوالم بعد")).not.toBeInTheDocument();
  });

  it("does not present a failed ChallengeTypes request as an empty catalog", () => {
    render(<ChallengeTypeCatalog />);

    expect(screen.getByText("تعذر تحميل الميكانيكا")).toBeInTheDocument();
    expect(screen.queryByText("لا توجد مكانيكا بعد")).not.toBeInTheDocument();
  });
});
