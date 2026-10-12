import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_TUTORIAL_SCENARIO } from "@/features/challenge-explainer";

/**
 * The published tutorial the mechanic serves. `null` is the real no-content
 * state, which the Preflight must handle by keeping its authored instructions.
 */
let publishedTutorial: {
  mechanicKey: string;
  revision: number;
  scenario: typeof SAMPLE_TUTORIAL_SCENARIO;
} | null = null;

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
  challengeKey: index === 0 ? "rakkibha" : `mechanic-${index}`,
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
  challengeKey: "rakkibha",
  challengeName: "ركّبها",
  description: "لا أحد يملك المعلومة كاملة",
  instructions: "اجمعوا المقاطع ثم أجيبوا",
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
      { teamId: "team-a", name: "أسود الشمال", signedTotal: 0, displayTotal: 0 },
      { teamId: "team-b", name: "صقور الرياض", signedTotal: 0, displayTotal: 0 },
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
  publishedTutorial = {
    mechanicKey: "read-your-opponent",
    revision: 1,
    scenario: SAMPLE_TUTORIAL_SCENARIO,
  };
  mocks.prepare.mockResolvedValue({ sessionId: "session-1" });
  mocks.launch.mockResolvedValue({ sessionId: "session-1" });
  mocks.cancel.mockResolvedValue({ sessionId: "session-1" });
});

describe("challenge preflight", () => {
  it("prepares a phone-required tile instead of launching it", async () => {
    const user = userEvent.setup();
    renderRouter(match());

    // No QR anywhere on the board.
    expect(screen.queryByTestId("preflight-join-code")).toBeNull();
    await user.click(
      screen.getByTestId("unified-position-2#slot_1"),
    );

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

  it("shows the QR, join code and both team counters", () => {
    renderRouter(match({ stage: "preflight", preflight: preflight() }));

    const view = screen.getByTestId("challenge-preflight");
    expect(view.textContent).toContain("ركّبها");
    expect(view.textContent).toContain("العالم الثالث");
    expect(view.textContent).not.toContain("اجمعوا المقاطع ثم أجيبوا");
    expect(view.textContent).not.toContain("نطاق أول");
    expect(screen.getByTestId("preflight-join-code").textContent).toBe(
      "ABC123",
    );
    // A real QR, carrying the absolute join URL for this origin.
    const qr = view.querySelector("svg[height]");
    expect(qr).toBeTruthy();
    expect(view.textContent).not.toContain("/join/live-session/ABC123");
    // The QR is now the tap-to-enlarge trigger, with its conversational hint.
    expect(screen.getByTestId("qr-enlarge-trigger")).toBeInTheDocument();
    expect(view.textContent).toContain("اضغط على الكود عشان تكبّره");
    // Both teams, with their counts and their chips.
    expect(screen.getByTestId("preflight-team-team-a").textContent).toContain(
      "1/3",
    );
    expect(screen.getByTestId("preflight-team-team-b").textContent).toContain(
      "3/3",
    );
    expect(screen.getByTestId("preflight-team-team-b").textContent).toContain(
      "سارة",
    );
    expect(
      screen.getByTestId("preflight-team-team-a").dataset.ready,
    ).toBe("false");
    expect(screen.getByTestId("preflight-team-team-b").dataset.ready).toBe(
      "true",
    );
    expect(screen.getByTestId("preflight-turn-chip").textContent).toBe(
      "أسود الشمال يبدأ",
    );
    // The QR leads the joining card and readiness sits beneath it: the code has
    // to stay scannable while the explainer plays, and "who has arrived" is the
    // answer to the question this card asks, not a separate card above it.
    expect(
      screen.getByTestId("preflight-join-toggle").compareDocumentPosition(
        screen.getByTestId("preflight-readiness"),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("enlarges the join QR to the same payload, and closes again", () => {
    renderRouter(match({ stage: "preflight", preflight: preflight() }));
    const view = screen.getByTestId("challenge-preflight");
    const inline = view
      .querySelector('[data-testid="qr-enlarge-trigger"] svg path[d]')
      ?.getAttribute("d");

    fireEvent.click(screen.getByTestId("qr-enlarge-trigger"));
    const dialog = screen.getByRole("dialog");
    const enlarged = dialog
      .querySelector('[data-testid="qr-enlarged-image"] path[d]')
      ?.getAttribute("d");
    // Same code, bigger — never a re-encoded or different join URL.
    expect(inline).toBeTruthy();
    expect(enlarged).toBe(inline);

    // The join code and copy control the room relies on are still there.
    expect(screen.getByTestId("preflight-join-code").textContent).toBe("ABC123");

    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps Start disabled until the server says ready", () => {
    renderRouter(match({ stage: "preflight", preflight: preflight() }));

    const start = screen.getByTestId("preflight-start");
    expect(start.hasAttribute("disabled")).toBe(true);
    // And says who it is waiting for.
    expect(screen.getByTestId("challenge-preflight").textContent).toContain(
      "بانتظار أسود الشمال",
    );
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
    // The dropped phone is still listed, marked as not connected.
    expect(
      within(screen.getByTestId("preflight-team-team-a")).getByLabelText(
        "غير متصل",
      ),
    ).toBeTruthy();
  });

  it("steps the QR back when the players are already paired", async () => {
    const user = userEvent.setup();
    renderRouter(match({ stage: "preflight", preflight: readyPreflight() }));

    expect(screen.getByTestId("preflight-players-paired").textContent).toContain(
      "اللاعبين متصلين وجاهزين",
    );
    // No QR taking over the screen, but the code is one tap away.
    expect(screen.queryByTestId("preflight-join-code")).toBeNull();
    await user.click(screen.getByTestId("preflight-join-toggle"));
    expect(screen.getByTestId("preflight-join-code").textContent).toBe(
      "ABC123",
    );
  });

  it("keeps the QR milestone scoped to the current Match session", () => {
    window.sessionStorage.setItem(
      "akwaan:preflight-join-complete:session-1",
      "true",
    );
    const first = renderRouter(
      match({ stage: "preflight", preflight: preflight() }),
    );

    expect(screen.getByTestId("preflight-join-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByTestId("preflight-join-code")).toBeNull();

    // A different Match gets its own first-join presentation state.
    first.unmount();
    window.sessionStorage.clear();
    const view = renderRouter(
      match({ stage: "preflight", preflight: preflight() }),
      "controller",
      "session-2",
    );
    expect(screen.getByTestId("preflight-join-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    view.unmount();
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
    expect(screen.getByTestId("preflight-join-code").textContent).toBe(
      "ABC123",
    );
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
          message: 'أسود الشمال: 1 connected, 2 required',
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
    expect(screen.queryByTestId("preflight-join-code")).toBeNull();
    // It still says what is happening.
    const waiting = screen.getByTestId("preflight-waiting");
    expect(waiting.textContent).toContain("ركّبها");
    expect(waiting.textContent).toContain("هذا التحدي يحتاج جوالات اللاعبين");
    // The shared screen still names the team and its count; the counter itself is
    // rendered as a tabular numeral so it reads left-to-right inside Arabic copy.
    expect(waiting.textContent).toContain("أسود الشمال");
    expect(waiting.textContent).toContain("1/3");
  });

  it("shows no pairing panel for a mechanic that needs no phones", () => {
    renderRouter(
      match({
        stage: "preflight",
        preflight: preflight({
          requiresPhones: false,
          join: undefined,
          teams: [],
          requirement: undefined,
          allTeamsReady: true,
          readyToLaunch: true,
          blockingReasons: [],
        }),
      }),
    );

    expect(screen.queryByTestId("preflight-join-code")).toBeNull();
    expect(screen.getByTestId("challenge-preflight").textContent).toContain(
      "يُلعب هذا التحدي من الشاشة المشتركة",
    );
    expect(screen.getByTestId("preflight-start").hasAttribute("disabled")).toBe(
      false,
    );
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

  describe("player instructions", () => {
    const withInstructions = () =>
      preflight({
        playerInstructions: {
          summary: "اقرأ خصمك قبل ما يقرأك.",
          steps: ["اختر توقعك بسرية", "اكشفوا في نفس اللحظة", "قارنوا النتيجة"],
          highlights: ["لا تكشف توقعك بدري"],
        },
      });

    it("offers the demo for اقرأ خصمك instead of occupying the screen with it", () => {
      // Phase 1 of the education strategy: the Preflight is for starting a
      // challenge, so the authored steps are the default surface for every
      // mechanic and the demonstration is one action away.
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
            challengeKey: "read-your-opponent",
            challengeName: "اقرأ خصمك",
            playerInstructions: {
              summary: "اقرأ خصمك قبل ما يقرأك.",
              steps: ["اختر توقعك بسرية", "اكشفوا في نفس اللحظة"],
              highlights: [],
            },
          }),
        }),
      );
      const block = screen.getByTestId("preflight-explainer");
      expect(block.textContent).toContain("شرح التحدي");
      expect(block).toHaveAttribute("data-animated", "true");
      // The authored steps are what a host reads by default.
      expect(
        screen.getByTestId("preflight-player-instructions"),
      ).toBeInTheDocument();
      // The demo and its playback strip are offered, not mounted.
      expect(screen.getByTestId("preflight-how-to-play")).toBeInTheDocument();
      expect(screen.queryByTestId("ryo-explainer")).not.toBeInTheDocument();
      expect(screen.queryByTestId("explainer-controls")).not.toBeInTheDocument();
      // And the rest of the card is untouched.
      expect(screen.getByTestId("preflight-start")).toBeInTheDocument();
      expect(screen.getByTestId("preflight-turn-chip")).toBeInTheDocument();
    });

    it("opens the real GSAP demo on «كيف تلعب؟» and unmounts it on close", async () => {
      const user = userEvent.setup();
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
            challengeKey: "read-your-opponent",
            challengeName: "اقرأ خصمك",
          }),
        }),
      );

      await user.click(screen.getByTestId("preflight-how-to-play"));
      const dialog = await screen.findByTestId("explainer-dialog");
      // The real explainer, not a second implementation of it.
      expect(within(dialog).getByTestId("ryo-explainer")).toHaveAttribute(
        "data-variant",
        "compact",
      );
      // The host-facing dialog is the demonstration alone: narration yes,
      // transport no. A 16-second loop that comes round by itself does not
      // need a play button.
      expect(within(dialog).getByTestId("explainer-caption")).toBeInTheDocument();
      expect(
        within(dialog).queryByTestId("explainer-controls"),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByTestId("explainer-progress"),
      ).not.toBeInTheDocument();
      // And no counter describing a sequence of questions that does not exist.
      expect(dialog.textContent).not.toContain("السؤال 1 من 3");
      // Said plainly to be a teaching example, never the Match's own question.
      expect(dialog.textContent).toContain("مو سؤال المباراة");

      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByTestId("explainer-dialog")).not.toBeInTheDocument(),
      );
      // Closing tears the demo down rather than leaving a timeline running.
      expect(screen.queryByTestId("ryo-explainer")).not.toBeInTheDocument();
      // And the Preflight is still there behind it.
      expect(screen.getByTestId("preflight-start")).toBeInTheDocument();
      expect(screen.getByTestId("preflight-join-code")).toBeInTheDocument();
    });

    it("closes the explanation when the real challenge starts", async () => {
      const user = userEvent.setup();
      mocks.launch.mockImplementation(() => new Promise(() => {}));
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
            challengeKey: "read-your-opponent",
            challengeName: "اقرأ خصمك",
            readyToLaunch: true,
            allTeamsReady: true,
            blockingReasons: [],
          }),
        }),
      );
      await user.click(screen.getByTestId("preflight-how-to-play"));
      expect(await screen.findByTestId("explainer-dialog")).toBeInTheDocument();

      // Escape first, because the dialog is modal — then launch for real.
      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByTestId("explainer-dialog")).not.toBeInTheDocument(),
      );
      await user.click(screen.getByTestId("preflight-start"));
      await waitFor(() => expect(mocks.launch).toHaveBeenCalledTimes(1));

      // A launch in flight leaves no explanation open over it, and offers none.
      expect(screen.queryByTestId("explainer-dialog")).toBeNull();
      expect(screen.getByTestId("preflight-how-to-play")).toBeDisabled();
    });

    it("keeps the explanation, joining and launch as three distinct regions", () => {
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
            challengeKey: "read-your-opponent",
            challengeName: "اقرأ خصمك",
            playerInstructions: { summary: "س", steps: ["خطوة"], highlights: [] },
          }),
        }),
      );
      const ordered = [
        screen.getByTestId("preflight-identity"),
        screen.getByTestId("preflight-explainer"),
        screen.getByTestId("preflight-start-section"),
      ];
      for (const [index, element] of ordered.entries()) {
        for (const following of ordered.slice(index + 1)) {
          expect(element.compareDocumentPosition(following)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
          );
        }
      }
      // Joining stays available beside the demo, never behind it.
      expect(screen.getByTestId("preflight-join-code")).toBeInTheDocument();
      expect(screen.getByTestId("preflight-readiness")).toBeInTheDocument();
    });

    it("never lets the explainer decide whether Start is enabled", () => {
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
            challengeKey: "read-your-opponent",
            challengeName: "اقرأ خصمك",
            readyToLaunch: true,
            allTeamsReady: true,
          }),
        }),
      );
      // Start reads only the server's `readyToLaunch` — the explanation, open
      // or closed, has no say in it.
      expect(screen.getByTestId("preflight-how-to-play")).toBeInTheDocument();
      expect(screen.getByTestId("preflight-start")).toBeEnabled();
      expect(screen.getByTestId("preflight-explainer")).toHaveAttribute(
        "data-launching",
        "false",
      );
    });

    it("keeps the explainer above the start button and below the chips", () => {
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
            challengeKey: "read-your-opponent",
            challengeName: "اقرأ خصمك",
            playerInstructions: { summary: "س", steps: ["خطوة"], highlights: [] },
          }),
        }),
      );
      const ordered = [
        screen.getByRole("heading", { name: "اقرأ خصمك" }),
        screen.getByTestId("preflight-turn-chip"),
        screen.getByTestId("preflight-explainer"),
        screen.getByTestId("preflight-start"),
      ];
      for (const [index, element] of ordered.entries()) {
        for (const following of ordered.slice(index + 1)) {
          expect(element.compareDocumentPosition(following)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
          );
        }
      }
    });

    it("drives no gameplay command while the demo plays", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
            challengeKey: "read-your-opponent",
            challengeName: "اقرأ خصمك",
            readyToLaunch: true,
            allTeamsReady: true,
          }),
        }),
      );
      await act(async () => {
        await Promise.resolve();
      });
      await userEvent.setup().click(screen.getByTestId("preflight-how-to-play"));
      expect(await screen.findByTestId("ryo-explainer")).toBeInTheDocument();

      // The demo is a picture of a round, not a round. Nothing it does may reach
      // the session: no launch, no prepare, no cancel, no request at all.
      expect(mocks.launch).not.toHaveBeenCalled();
      expect(mocks.prepare).not.toHaveBeenCalled();
      expect(mocks.cancel).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("falls back to the authored steps when no tutorial is published", async () => {
      // The content-safety outcome: with nothing approved to show, the Preflight
      // teaches from the canonical instructions rather than an unapproved
      // fixture. The action stays visible but inert, so the absence reads as
      // "nothing to show yet" rather than a missing feature.
      publishedTutorial = null;
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
            challengeKey: "read-your-opponent",
            challengeName: "اقرأ خصمك",
            playerInstructions: {
              summary: "فريق يجاوب بالسر، والفريق الثاني يحاول يقرأه.",
              steps: [
                "فريق الدور يختار إجابته بالسر.",
                "بنفس الوقت، الفريق الثاني يقرر: يثق أو يسرق.",
                "تنكشف الإجابة والقرار مع بعض.",
              ],
              highlights: [],
            },
          }),
        }),
      );

      expect(
        screen.getByTestId("preflight-player-instructions"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("preflight-how-to-play")).toBeDisabled();
      expect(screen.queryByTestId("ryo-explainer")).not.toBeInTheDocument();

      // And nothing of a tutorial leaks into the page.
      expect(document.body.textContent).not.toContain(
        SAMPLE_TUTORIAL_SCENARIO.prompt,
      );
    });

    it("teaches whatever scenario the mechanic publishes", async () => {
      // Mechanic-keyed, not World-keyed: the same Match World would show a
      // different demonstration if the mechanic published a different one.
      const user = userEvent.setup();
      publishedTutorial = {
        mechanicKey: "read-your-opponent",
        revision: 7,
        scenario: { ...SAMPLE_TUTORIAL_SCENARIO, prompt: "سؤال تعليمي آخر؟" },
      };
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
            challengeKey: "read-your-opponent",
            challengeName: "اقرأ خصمك",
          }),
        }),
      );
      await user.click(screen.getByTestId("preflight-how-to-play"));
      const dialog = await screen.findByTestId("explainer-dialog");
      expect(dialog.textContent).toContain("سؤال تعليمي آخر؟");
    });

    it("leaves every other mechanic on its authored numbered steps", () => {
      renderRouter(
        match({ stage: "preflight", preflight: withInstructions() }),
      );
      expect(
        screen.getByTestId("preflight-player-instructions"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("ryo-explainer")).not.toBeInTheDocument();
      // No mechanic without an authored demonstration offers one.
      expect(screen.queryByTestId("preflight-how-to-play")).not.toBeInTheDocument();
      expect(screen.getByTestId("preflight-explainer")).toHaveAttribute(
        "data-animated",
        "false",
      );
    });

    it("renders the authored summary, ordered steps and highlights", () => {
      renderRouter(
        match({ stage: "preflight", preflight: withInstructions() }),
      );
      const block = screen.getByTestId("preflight-player-instructions");
      expect(screen.getByRole("heading", { name: "ركّبها" })).toBeInTheDocument();
      expect(screen.getByText("اقرأ خصمك قبل ما يقرأك.")).toBeInTheDocument();
      // One title for the region — on the card — and no second near-identical
      // heading repeating it inside the steps list.
      expect(block.textContent).not.toContain("كيف نلعب؟");
      expect(
        screen.getByTestId("preflight-explainer").textContent,
      ).toContain("شرح التحدي");
      const orderedElements = [
        screen.getByRole("heading", { name: "ركّبها" }),
        screen.getByText("اقرأ خصمك قبل ما يقرأك."),
        screen.getByTestId("preflight-turn-chip"),
        block,
        screen.getByTestId("preflight-highlight"),
        screen.getByTestId("preflight-start"),
      ];
      for (const [index, element] of orderedElements.entries()) {
        for (const following of orderedElements.slice(index + 1)) {
          expect(element.compareDocumentPosition(following)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
          );
        }
      }

      // The steps read top to bottom in exactly the authored order.
      const steps = within(block)
        .getAllByRole("listitem")
        .map((node) => node.lastElementChild?.textContent);
      expect(steps).toEqual([
        "اختر توقعك بسرية",
        "اكشفوا في نفس اللحظة",
        "قارنوا النتيجة",
      ]);
      expect(screen.getByTestId("preflight-highlight").textContent).toContain(
        "لا تكشف توقعك بدري",
      );
      // The honest placeholder is only for records with none.
      expect(
        screen.queryByTestId("preflight-instructions-fallback"),
      ).toBeNull();
    });

    it("shows a short honest placeholder when a mechanic authored none", () => {
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({ playerInstructions: undefined }),
        }),
      );
      expect(
        screen.getByTestId("preflight-instructions-fallback").textContent,
      ).toContain("شرح التحدي بيتضاف قريب");
      expect(
        screen.queryByTestId("preflight-player-instructions"),
      ).toBeNull();
    });

    it("renders instructions without disturbing the QR, scopes, or launch", () => {
      renderRouter(
        match({ stage: "preflight", preflight: withInstructions() }),
      );
      const view = screen.getByTestId("challenge-preflight");
      // The join flow is untouched by the new block.
      expect(screen.getByTestId("preflight-join-code").textContent).toBe(
        "ABC123",
      );
      expect(view.querySelectorAll(".preflight-secondary-surface")).toHaveLength(
        4,
      );
      expect(screen.getByTestId("qr-enlarge-trigger")).toBeInTheDocument();
      expect(view.textContent).not.toContain("/join/live-session/ABC123");
      // Low-value Scope metadata is intentionally not part of the briefing.
      expect(view.textContent).not.toContain("نطاق أول");
      expect(view.textContent).toContain("العالم الثالث");
      // Launch is still governed only by the server's readiness.
      expect(
        screen.getByTestId("preflight-start").hasAttribute("disabled"),
      ).toBe(true);
    });

    it("does not present the verbose World override in the briefing", () => {
      renderRouter(
        match({ stage: "preflight", preflight: withInstructions() }),
      );
      const view = screen.getByTestId("challenge-preflight");
      expect(view.textContent).not.toContain("اجمعوا المقاطع ثم أجيبوا");
      expect(view.textContent).toContain("اقرأ خصمك قبل ما يقرأك.");
    });
  });

  describe("readiness roster", () => {
    it("is one clean roster card with authoritative counts and human status", () => {
      renderRouter(match({ stage: "preflight", preflight: preflight() }));
      const readiness = screen.getByTestId("preflight-readiness");
      expect(readiness.textContent).toContain("جاهزية اللاعبين");
      // Counts come straight from the snapshot, per team.
      expect(screen.getByTestId("preflight-team-team-a").textContent).toContain(
        "1/3",
      );
      expect(screen.getByTestId("preflight-team-team-b").textContent).toContain(
        "3/3",
      );
      // The ready team says so in the semantic green status; the waiting team
      // gets a human phrase, never a technical "ناقص" badge.
      expect(
        screen.getByTestId("preflight-team-status-team-b").textContent,
      ).toContain("جاهز");
      const waiting =
        screen.getByTestId("preflight-team-status-team-a").textContent ?? "";
      expect(waiting).toMatch(/باقي|بانتظار/);
      expect(waiting).not.toContain("ناقص");
    });

    it("keeps a public player's name reachable and marks a dropped phone offline", () => {
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
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
                  { participantId: "p2", displayName: "منى", connected: false },
                ],
              },
            ],
          }),
        }),
      );
      const teamA = screen.getByTestId("preflight-team-team-a");
      // The connected player's real (public) name is still reachable…
      expect(within(teamA).getByText("أحمد")).toBeTruthy();
      // …and the dropped phone is labelled as not connected.
      expect(within(teamA).getByLabelText("غير متصل")).toBeTruthy();
    });
  });

  describe("feedback states", () => {
    it("toasts once on a successful join-link copy (invisible success)", async () => {
      const user = userEvent.setup();
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
      renderRouter(match({ stage: "preflight", preflight: preflight() }));

      await user.click(screen.getByRole("button", { name: /نسخ الرابط/ }));
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith("تم نسخ الرابط"),
      );
      expect(toast.success).toHaveBeenCalledTimes(1);
    });

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
