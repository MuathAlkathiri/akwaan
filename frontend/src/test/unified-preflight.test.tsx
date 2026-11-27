import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedTutorial } from "@/features/challenge-explainer/tutorial-scenario";
let publishedTutorial: PublishedTutorial | null = null;
vi.mock("@/features/challenge-explainer/use-published-tutorial", () => ({
  usePublishedTutorial: () => ({ data: publishedTutorial }),
}));
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchStageRouter } from "@/features/live-game-session/match/match-stage-router";
import type {
  LiveSessionMatchSnapshot,
  MatchSlotKey,
  UnifiedBoardPosition,
  UnifiedPreflight,
} from "@/features/live-game-session/match/types";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";
import { toast } from "sonner";

/**
 * Choosing a phone-required tile, gathering the phones, and starting.
 *
 * The load-bearing assertions: a tile click *prepares* rather than launching, the
 * QR only exists at preflight, Start is driven by the server's own `readyToLaunch`,
 * and a refresh lands back on the same preflight.
 */

const WORLD = "world-anime";
const SLOTS: MatchSlotKey[] = ["slot_1", "slot_2", "slot_3", "slot_4"];

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  launch: vi.fn(),
  cancel: vi.fn(),
  resync: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/features/match-setup", () => ({
  prepareUnifiedChallenge: mocks.prepare,
  launchUnifiedChallenge: mocks.launch,
  cancelUnifiedPreflight: mocks.cancel,
  occurrenceLabel: (index: number) =>
    ["العالم الأول", "العالم الثاني", "العالم الثالث"][index],
}));

const position = (
  occurrenceIndex: number,
  slotKey: MatchSlotKey,
  index: number,
): UnifiedBoardPosition => ({
  positionKey: `${occurrenceIndex}#${slotKey}`,
  occurrenceIndex,
  worldId: WORLD,
  worldName: "انمي",
  slotKey,
  challengeTypeId: `type-${index}`,
  challengeKey: index === 0 ? "closest" : `mechanic-${index}`,
  challengeName: `تحدي ${occurrenceIndex}-${index}`,
  requiresPhones: true,
  launchability: index === 0 ? "launchable" : "configured_but_unimplemented",
  ...(index === 0
    ? {}
    : { unavailableReason: "launcher_not_implemented" as const }),
  status: "available",
});

const preflight = (
  overrides: Partial<UnifiedPreflight> = {},
): UnifiedPreflight => ({
  positionKey: "2#slot_1",
  occurrenceIndex: 2,
  slotKey: "slot_1",
  worldId: WORLD,
  worldName: "انمي",
  challengeTypeId: "type-0",
  challengeKey: "closest",
  challengeName: "مين أقرب",
  description: "كل فريق يرسل تقديره",
  requiresPhones: true,
  selectedScopes: [
    { scopeId: "s0", name: "نطاق أول" },
    { scopeId: "s1", name: "نطاق ثانٍ" },
    { scopeId: "s2", name: "نطاق ثالث" },
    { scopeId: "s3", name: "نطاق رابع" },
  ],
  join: {
    joinCode: "ABC123",
    joinPath: "/join/live-session/ABC123",
  },
  requirement: {
    minParticipantsPerTeam: 2,
    maxParticipantsPerTeam: 3,
    requiresBothTeams: true,
  },
  teams: [
    {
      teamId: "team-a",
      teamName: "أسود الشمال",
      connectedCount: 1,
      minimum: 2,
      maximum: 3,
      ready: false,
      participants: [
        { participantId: "p1", displayName: "أحمد", connected: true },
      ],
    },
    {
      teamId: "team-b",
      teamName: "صقور الرياض",
      connectedCount: 3,
      minimum: 2,
      maximum: 3,
      ready: true,
      participants: [
        { participantId: "p3", displayName: "سارة", connected: true },
        { participantId: "p4", displayName: "خالد", connected: true },
        { participantId: "p5", displayName: "ليان", connected: true },
      ],
    },
  ],
  allTeamsReady: false,
  readyToLaunch: false,
  blockingReasons: [
    {
      code: "TEAM_NEEDS_MORE_PLAYERS",
      teamId: "team-a",
      teamName: "أسود الشمال",
      connectedCount: 1,
      required: 2,
    },
  ],
  selectingTeamId: "team-a",
  preparedAt: "2026-08-06T00:00:00.000Z",
  ...overrides,
});

/** Both teams inside the two-or-three range, so the server says ready. */
const readyPreflight = () =>
  preflight({
    teams: [
      {
        teamId: "team-a",
        teamName: "أسود الشمال",
        connectedCount: 2,
        minimum: 2,
        maximum: 3,
        ready: true,
        participants: [
          { participantId: "p1", displayName: "أحمد", connected: true },
          { participantId: "p2", displayName: "منى", connected: true },
        ],
      },
      {
        teamId: "team-b",
        teamName: "صقور الرياض",
        connectedCount: 2,
        minimum: 2,
        maximum: 3,
        ready: true,
        participants: [
          { participantId: "p3", displayName: "سارة", connected: true },
          { participantId: "p4", displayName: "خالد", connected: true },
        ],
      },
    ],
    allTeamsReady: true,
    readyToLaunch: true,
    blockingReasons: [],
  });

function match(
  overrides: {
    stage?: string;
    preflight?: UnifiedPreflight;
  } = {},
): LiveSessionMatchSnapshot {
  return {
    id: "match-1",
    revision: 9,
    status: "active",
    stage: {
      key: overrides.stage ?? "board",
      enteredAt: "2026-08-06T00:00:00.000Z",
      minimumDisplayDurationMs: 0,
      audioCue: null,
      animationCue: null,
    },
    unified: {
      occurrences: [0, 1, 2].map((occurrenceIndex) => ({
        occurrenceIndex,
        worldId: WORLD,
        worldName: "انمي",
        selectedScopeIds: ["s0", "s1", "s2", "s3"],
        selectedScopes: [
          { scopeId: "s0", name: "نطاق أول" },
          { scopeId: "s1", name: "نطاق ثانٍ" },
          { scopeId: "s2", name: "نطاق ثالث" },
          { scopeId: "s3", name: "نطاق رابع" },
        ],
        subtotals: [],
      })),
      board: {
        positions: [0, 1, 2].flatMap((occurrenceIndex) =>
          SLOTS.map((slotKey, index) =>
            position(occurrenceIndex, slotKey, index),
          ),
        ),
        totalPositionCount: 12,
        completedPositionCount: 0,
      },
      selectingTeamId: "team-a",
      ...(overrides.preflight ? { preflight: overrides.preflight } : {}),
    },
    scoring: {
      matchTotals: [
        { teamId: "team-a", signedTotal: 0, displayTotal: 0 },
        { teamId: "team-b", signedTotal: 0, displayTotal: 0 },
      ],
      worldSubtotals: [],
    },
    standings: [
      {
        teamId: "team-a",
        name: "أسود الشمال",
        signedTotal: 0,
        displayTotal: 0,
      },
      {
        teamId: "team-b",
        name: "صقور الرياض",
        signedTotal: 0,
        displayTotal: 0,
      },
    ],
    availableActions: ["match:launch-challenge", "match:cancel"],
  } as LiveSessionMatchSnapshot;
}

function renderRouter(
  value: LiveSessionMatchSnapshot,
  actor: "controller" | "shared-screen" = "controller",
  sessionId = "session-1",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const snapshot = {
    sessionId,
    mode: { key: "core-timed-turns", version: 1 },
    status: "active",
    revision: 4,
    serverTimestamp: "2026-08-06T00:00:00.000Z",
    round: { number: 1 },
    teams: [
      { id: "team-a", name: "أسود الشمال", active: true },
      { id: "team-b", name: "صقور الرياض", active: true },
    ],
    participants: [],
    availableActions: [],
    match: value,
  } as unknown as LiveSessionSnapshot;
  return render(
    <QueryClientProvider client={client}>
      <LiveSessionContext.Provider
        value={
          {
            snapshot,
            connection: "connected",
            error: undefined,
            resync: mocks.resync,
            sessionId: "session-1",
          } as never
        }
      >
        <MatchStageRouter actor={actor} />
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  window.sessionStorage.clear();
  publishedTutorial = null;
  mocks.prepare.mockResolvedValue({ sessionId: "session-1" });
  mocks.launch.mockResolvedValue({ sessionId: "session-1" });
  mocks.cancel.mockResolvedValue({ sessionId: "session-1" });
});

describe("challenge preflight", () => {
  it("prepares a phone-required tile instead of launching it", async () => {
    const user = userEvent.setup();
    renderRouter(match());

    // No QR anywhere on the board.
    expect(screen.queryByTestId("preflight-join-qr")).toBeNull();
    await user.click(screen.getByTestId("unified-position-2#slot_1"));

    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1));
    // The runtime is not started by a tile click.
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.prepare.mock.calls[0][0]).toMatchObject({
      sessionId: "session-1",
      expectedMatchRevision: 9,
      occurrenceIndex: 2,
      slotKey: "slot_1",
      selectingTeamId: "team-a",
    });
    expect(JSON.stringify(mocks.prepare.mock.calls[0][0])).not.toContain(
      "contentItem",
    );
    expect(mocks.resync).toHaveBeenCalled();
  });

  it("opens the join QR on demand and shows both fixed team names", async () => {
    renderRouter(match({ stage: "preflight", preflight: preflight() }));
    expect(
      screen.getByTestId("preflight-team-status-team-a"),
    ).toHaveTextContent("الفريق الأول");
    expect(
      screen.getByTestId("preflight-team-status-team-b"),
    ).toHaveTextContent("الفريق الثاني");
    const join = screen.getByRole("button", { name: "انضمام" });
    expect(join).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(join);
    expect(join).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("preflight-join-qr")).toHaveAttribute(
      "data-join-code",
      "ABC123",
    );
    expect(screen.getByTestId("preflight-join-code")).toHaveTextContent(
      "ABC123",
    );
    expect(
      screen.getByRole("button", { name: "نسخ الرابط" }),
    ).toBeInTheDocument();
    fireEvent.click(join);
    expect(screen.queryByTestId("preflight-join-qr")).toBeNull();
  });

  it("opens a team side panel listing players, captain, readiness and host-start note", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const snapshot = {
      sessionId: "session-1",
      mode: { key: "core-timed-turns", version: 1 },
      status: "active",
      revision: 4,
      serverTimestamp: "2026-08-06T00:00:00.000Z",
      round: { number: 1 },
      teams: [
        {
          id: "team-a",
          name: "الفريق الأول",
          active: true,
          captainParticipantId: "p1",
        },
        { id: "team-b", name: "الفريق الثاني", active: true },
      ],
      participants: [
        {
          id: "p1",
          teamId: "team-a",
          displayName: "أحمد",
          role: "team-player",
          ready: true,
          connected: true,
          presence: "connected",
        },
        {
          id: "p2",
          teamId: "team-a",
          displayName: "منى",
          role: "team-player",
          ready: false,
          connected: true,
          presence: "connected",
        },
      ],
      availableActions: [],
      match: match({ stage: "preflight", preflight: preflight() }),
    } as unknown as LiveSessionSnapshot;

    render(
      <QueryClientProvider client={client}>
        <LiveSessionContext.Provider
          value={
            {
              snapshot,
              connection: "connected",
              error: undefined,
              resync: mocks.resync,
              sessionId: "session-1",
            } as never
          }
        >
          <MatchStageRouter actor="controller" />
        </LiveSessionContext.Provider>
      </QueryClientProvider>,
    );

    const pillButton = screen.getByTestId("preflight-team-status-team-a");
    fireEvent.click(pillButton);

    const panel = screen.getByTestId("preflight-team-panel");
    expect(panel).toHaveTextContent("أحمد");
    expect(panel).toHaveTextContent("قائد الفريق");
    expect(panel).toHaveTextContent("منى");
    expect(panel).toHaveTextContent("مو جاهز");
    expect(panel).toHaveTextContent(
      "التحدي يبدأ بالضغط على «ابدأ التحدي» من الشاشة الرئيسية، مو من الجوال.",
    );

    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    expect(screen.queryByTestId("preflight-team-panel")).toBeNull();
  });
  it("keeps Start disabled until the server says ready", () => {
    renderRouter(match({ stage: "preflight", preflight: preflight() }));

    const start = screen.getByTestId("preflight-start");
    expect(start.hasAttribute("disabled")).toBe(true);
  });

  it("enables Start once both teams are ready", async () => {
    const user = userEvent.setup();
    renderRouter(match({ stage: "preflight", preflight: readyPreflight() }));

    const start = screen.getByTestId("preflight-start");
    expect(start.hasAttribute("disabled")).toBe(false);
    await user.click(start);

    await waitFor(() => expect(mocks.launch).toHaveBeenCalledTimes(1));
    expect(mocks.launch.mock.calls[0][0]).toMatchObject({
      sessionId: "session-1",
      occurrenceIndex: 2,
      slotKey: "slot_1",
    });
    expect(JSON.stringify(mocks.launch.mock.calls[0][0])).not.toContain(
      "contentItem",
    );
  });

  it("disables Start again when a required phone drops", () => {
    const dropped = readyPreflight();
    const view = renderRouter(
      match({ stage: "preflight", preflight: dropped }),
    );
    expect(screen.getByTestId("preflight-start").hasAttribute("disabled")).toBe(
      false,
    );
    view.unmount();

    // The same preflight after one phone disconnected, exactly as the server
    // would report it.
    renderRouter(
      match({
        stage: "preflight",
        preflight: preflight({
          teams: [
            {
              ...dropped.teams[0],
              connectedCount: 1,
              ready: false,
              participants: [
                { participantId: "p1", displayName: "أحمد", connected: true },
                { participantId: "p2", displayName: "منى", connected: false },
              ],
            },
            dropped.teams[1],
          ],
          allTeamsReady: false,
          readyToLaunch: false,
        }),
      }),
    );

    expect(screen.getByTestId("preflight-start").hasAttribute("disabled")).toBe(
      true,
    );
    expect(
      screen.getByTestId("preflight-team-status-team-a"),
    ).toHaveTextContent("1 / 3");
  });

  it("cancels back to the board", async () => {
    const user = userEvent.setup();
    renderRouter(match({ stage: "preflight", preflight: preflight() }));

    await user.click(screen.getByRole("button", { name: "ارجع للوحة" }));

    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledTimes(1));
    expect(mocks.cancel.mock.calls[0][0]).toMatchObject({
      sessionId: "session-1",
      expectedMatchRevision: 9,
    });
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.resync).toHaveBeenCalled();
  });

  it("restores the same preflight on a refresh", () => {
    // A fresh mount with the same server state is exactly what a refresh is.
    const state = match({ stage: "preflight", preflight: preflight() });
    const first = renderRouter(state);
    const before = screen.getByTestId("challenge-preflight").textContent;
    first.unmount();

    renderRouter(state);
    expect(screen.getByTestId("challenge-preflight").textContent).toBe(before);
    expect(screen.getByRole("button", { name: "انضمام" })).toBeVisible();
    // Nothing was re-requested to get back here.
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("reports a launch the server refused, staying on the preflight", async () => {
    const user = userEvent.setup();
    mocks.launch.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          code: "MATCH_CHALLENGE_NOT_READY",
          message: "أسود الشمال: 1 connected, 2 required",
        },
      },
    });
    renderRouter(match({ stage: "preflight", preflight: readyPreflight() }));

    await user.click(screen.getByTestId("preflight-start"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByTestId("challenge-preflight")).toBeTruthy();
    expect(mocks.resync).not.toHaveBeenCalled();
  });

  it("gives a shared screen no preflight controls", () => {
    renderRouter(
      match({ stage: "preflight", preflight: preflight() }),
      "shared-screen",
    );

    expect(screen.queryByTestId("challenge-preflight")).toBeNull();
    expect(screen.queryByTestId("preflight-start")).toBeNull();
    expect(screen.queryByTestId("preflight-join-qr")).toBeNull();
    // It still says what is happening.
    const waiting = screen.getByTestId("preflight-waiting");
    expect(waiting.textContent).toContain("مين أقرب");
    expect(waiting.textContent).toContain("هذا التحدي يحتاج جوالات اللاعبين");
    // The shared screen still names the team and its count; the counter itself is
    // rendered as a tabular numeral so it reads left-to-right inside Arabic copy.
    expect(waiting.textContent).toContain("أسود الشمال");
    expect(waiting.textContent).toContain("1/3");
  });

  it("never renders the old session management panel", () => {
    renderRouter(match({ stage: "preflight", preflight: preflight() }));

    for (const legacy of [
      "أدوات التطوير",
      "إعدادات الجلسة",
      "Mark ready",
      "Start session",
      "إبطال",
    ]) {
      expect(screen.queryByText(legacy)).toBeNull();
    }
  });

  it("recovers rather than guessing when a preflight stage carries no preflight", () => {
    renderRouter(match({ stage: "preflight" }));

    expect(screen.queryByTestId("challenge-preflight")).toBeNull();
    expect(screen.queryByTestId("unified-board")).toBeNull();
    expect(screen.getByTestId("match-stage-recovery")).toBeTruthy();
  });

  it("recovers on a stage this client does not know", () => {
    for (const stage of ["world_selection", "coin_toss", "lobby", ""]) {
      const view = renderRouter(match({ stage }));
      expect(screen.getByTestId("match-stage-recovery")).toBeTruthy();
      // Never quietly resolved to the board.
      expect(screen.queryByTestId("unified-board")).toBeNull();
      view.unmount();
    }
  });

  it("names the missing published example and keeps launch available", () => {
    renderRouter(match({ stage: "preflight", preflight: readyPreflight() }));
    expect(screen.getByTestId("explainer-closed")).toHaveTextContent(
      "ما فيه مثال منشور",
    );
    expect(screen.getByTestId("preflight-start")).toBeEnabled();
  });
  it("offers a reminder on a repeated encounter in this match", () => {
    const value = match({ stage: "preflight", preflight: readyPreflight() });
    value.unified.board.positions[0].status = "completed";
    renderRouter(value);
    fireEvent.click(screen.getByRole("button", { name: "ذكّرني بالقواعد" }));
    expect(screen.getByTestId("explainer-closed")).toHaveTextContent(
      "ما فيه مثال منشور",
    );
  });
  describe("launch feedback", () => {
    it("cannot re-fire the launch while one is already pending", async () => {
      const user = userEvent.setup();
      // A launch that never resolves keeps the pending state active.
      mocks.launch.mockReturnValue(new Promise(() => {}));
      renderRouter(match({ stage: "preflight", preflight: readyPreflight() }));

      const start = screen.getByTestId("preflight-start");
      await user.click(start);
      // Now pending: the CTA is busy and disabled, so a second click is inert.
      await waitFor(() => expect(start).toHaveAttribute("aria-busy", "true"));
      expect(start.hasAttribute("disabled")).toBe(true);
      await user.click(start);
      expect(mocks.launch).toHaveBeenCalledTimes(1);
    });

    it("clears the pending state when the launch is rejected", async () => {
      const user = userEvent.setup();
      mocks.launch.mockRejectedValue({
        isAxiosError: true,
        response: { status: 400, data: { code: "MATCH_CHALLENGE_NOT_READY" } },
      });
      renderRouter(match({ stage: "preflight", preflight: readyPreflight() }));

      const start = screen.getByTestId("preflight-start");
      await user.click(start);
      // After the rejection the CTA is usable again — not stuck pending.
      await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
      expect(start).not.toHaveAttribute("aria-busy", "true");
      expect(start.hasAttribute("disabled")).toBe(false);
    });
  });
});
