import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentUser } from "@/features/auth/hooks/use-auth-session";
import { authStorage } from "@/features/auth/storage/auth-storage";

/**
 * The authenticated-route hydration mismatch, pinned.
 *
 * The server renders every route signed-out — it has no access to the browser's
 * token. The client used to seed the current user from localStorage during its
 * *first* render, so the hydration pass produced a signed-in header and a
 * signed-in layout over signed-out server markup, and React reported a mismatch
 * on every authenticated route.
 *
 * The rule that fixes it: nothing derived from browser storage may reach the
 * first render. `useCurrentUser(false)` is that first render, and it must look
 * exactly like the server.
 */
vi.mock("@/api/generated/auth/auth", () => ({
  authGetCurrentUser: vi.fn(),
  useAuthLogin: () => ({ mutateAsync: vi.fn() }),
  useAuthRegister: () => ({ mutateAsync: vi.fn() }),
}));

const STORED = {
  id: "user-1",
  email: "player@example.test",
  fullName: "مُعاذ",
  role: "user" as const,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("current user never differs between server and hydration", () => {
  it("renders signed-out on the first client render even with a stored session", () => {
    authStorage.setToken("stored-token");
    authStorage.setUser(STORED as never);

    const { result } = renderHook(() => useCurrentUser(false), { wrapper });

    // Exactly what the server rendered. Anything else is a mismatch.
    expect(result.current.data).toBeUndefined();
  });

  it("adopts the stored session once the client has hydrated", () => {
    authStorage.setToken("stored-token");
    authStorage.setUser(STORED as never);

    const { result } = renderHook(() => useCurrentUser(true), { wrapper });

    expect(result.current.data).toMatchObject({ id: "user-1" });
  });

  it("stays signed out when there is no token, hydrated or not", () => {
    authStorage.setUser(STORED as never);

    expect(renderHook(() => useCurrentUser(false), { wrapper }).result.current.data).toBeUndefined();
    expect(renderHook(() => useCurrentUser(true), { wrapper }).result.current.data).toBeUndefined();
  });
});
