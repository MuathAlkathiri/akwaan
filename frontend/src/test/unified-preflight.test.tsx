import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SAMPLE_TUTORIAL_SCENARIO,
  type TutorialScenario,
} from "@/features/challenge-explainer";
import { SAMPLE_BOMB_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/bomb-demo-scenario";
import { SAMPLE_CLOSEST_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/closest-demo-scenario";
import { SAMPLE_TOP5_TUTORIAL_SCENARIO } from "@/features/challenge-explainer/top5-demo-scenario";

/**
 * The published tutorial the mechanic serves. `null` is the real no-content
 * state, which the Preflight must handle with an explicit unavailable message.
 */
let publishedTutorial: {
  mechanicKey: string;
  revision: number;
  scenario: TutorialScenario;
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
    expect(screen.getByTestId("preflight-team-team-a").dataset.ready).toBe(
      "false",
    );
    expect(screen.getByTestId("preflight-team-team-b").dataset.ready).toBe(
      "true",
    );
    expect(screen.getByTestId("preflight-turn-chip").textContent).toBe(
      "أسود الشمال يبدأ",
    );
    // V6 Launch rail: readiness leads the rail and the collapsible join card
    // sits directly beneath it so hosts immediately see who has arrived.
    expect(
      screen
        .getByTestId("preflight-readiness")
        .compareDocumentPosition(screen.getByTestId("preflight-join-toggle")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
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
    expect(screen.getByTestId("preflight-join-code").textContent).toBe(
      "ABC123",
    );

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

    expect(
      screen.getByTestId("preflight-players-paired").textContent,
    ).toContain("اللاعبين متصلين وجاهزين");
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

  describe("GSAP-only explanation", () => {
    it("renders the published V6 integrated dual-iPhone RYO tutorial with intro and 4 stages", async () => {
      const user = userEvent.setup();
      publishedTutorial = {
        mechanicKey: "read-your-opponent",
        revision: 1,
        scenario: SAMPLE_TUTORIAL_SCENARIO,
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

      const explainer = screen.getByTestId("preflight-explainer");
      expect(explainer).toHaveAttribute("data-animated", "true");
      expect(
        screen.getByTestId("preflight-inline-tutorial"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tablist", { name: "خطوات الشرح التوضيحي" }),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("preflight-inline-tutorial-caption"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("preflight-how-to-play")).toBeNull();
      expect(screen.queryByTestId("preflight-player-instructions")).toBeNull();
      expect(screen.queryByTestId("preflight-highlight")).toBeNull();

      // Opens on the V6 intro card before advancing into stage 1.
      const ryo = screen.getByTestId("ryo-explainer");
      expect(ryo).toHaveAttribute("data-variant", "integrated");
      expect(ryo).toHaveAttribute("data-step", "-1");
      expect(ryo.textContent).toContain("بطاقة البداية");
      expect(
        screen.getByTestId("preflight-inline-tutorial-play"),
      ).toHaveAttribute("data-playing", "false");

      // Play/Start advances from intro into Stage 1 ("السؤال والإجابة") where
      // the answering phone acts and reveal is still hidden.
      const playToggle = screen.getByTestId("preflight-inline-tutorial-play");
      await user.click(playToggle);
      expect(playToggle).toHaveAttribute("data-playing", "true");
      expect(
        screen.getByRole("tab", { name: /السؤال والإجابة/ }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByTestId("explainer-phone-answering"),
      ).toHaveAttribute("data-acting", "true");
      expect(screen.queryByTestId("explainer-reveal")).toBeNull();

      // Step Next into Stage 2 ("قرار الخصم") where the opposing phone acts.
      await user.click(screen.getByTestId("preflight-inline-tutorial-next"));
      expect(screen.getByRole("tab", { name: /قرار الخصم/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        screen.getByTestId("explainer-phone-opposing"),
      ).toHaveAttribute("data-acting", "true");
      expect(screen.queryByTestId("explainer-reveal")).toBeNull();

      // Direct step into Stage 3 ("تثبيت القرار") locks both phones with zero answer leakage.
      await user.click(screen.getByRole("tab", { name: /تثبيت القرار/ }));
      expect(
        screen.getByTestId("explainer-lock-answering"),
      ).toHaveAttribute("data-locked", "true");
      expect(
        screen.getByTestId("explainer-lock-opposing"),
      ).toHaveAttribute("data-locked", "true");
      expect(screen.queryByTestId("explainer-reveal")).toBeNull();

      // Direct step into Stage 4 ("الكشف والنتيجة") reveals answer + opposing decision + payoff.
      await user.click(screen.getByRole("tab", { name: /الكشف والنتيجة/ }));
      expect(screen.getByTestId("explainer-reveal")).toBeInTheDocument();

      // Replay returns cleanly to the intro card.
      await user.click(screen.getByTestId("preflight-inline-tutorial-replay"));
      expect(screen.getByTestId("ryo-explainer")).toHaveAttribute(
        "data-step",
        "-1",
      );
    });

    it("renders all four RYO options and highlights selection of the fourth option without pre-reveal leakage", async () => {
      const user = userEvent.setup();
      publishedTutorial = {
        mechanicKey: "read-your-opponent",
        revision: 1,
        scenario: {
          ...SAMPLE_TUTORIAL_SCENARIO,
          options: [
            { id: "a", label: "خمسة" },
            { id: "b", label: "ستة" },
            { id: "c", label: "سبعة" },
            { id: "d", label: "ثمانية" },
          ],
          correctOptionId: "d",
          answeringSelectionOptionId: "d",
        },
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

      await user.click(screen.getByRole("tab", { name: /السؤال والإجابة/ }));
      const controls = screen.getByTestId("explainer-phone-answer-controls");
      for (const label of ["خمسة", "ستة", "سبعة", "ثمانية"]) {
        expect(within(controls).getByText(new RegExp(label))).toBeInTheDocument();
      }
      const fourth = controls.querySelectorAll('[data-selected]')[3];
      expect(fourth).toHaveAttribute("data-selected", "true");
      expect(fourth.textContent).toContain("ثمانية");
      expect(
        screen.getByTestId("explainer-phone-opposing").textContent,
      ).not.toContain("ثمانية");
      expect(screen.queryByTestId("explainer-reveal")).toBeNull();

      await user.click(screen.getByRole("tab", { name: /الكشف والنتيجة/ }));
      expect(screen.getByTestId("explainer-reveal").textContent).toContain(
        "ثمانية",
      );
    });

    it("shows an explicit unavailable state when no tutorial is published", () => {
      publishedTutorial = null;
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
            challengeKey: "closest",
            challengeName: "مين أقرب",
          }),
        }),
      );

      expect(
        screen.getByTestId("preflight-inline-tutorial-fallback"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("preflight-how-to-play")).toBeNull();
      expect(
        screen.getByTestId("preflight-inline-tutorial").textContent,
      ).toContain("لا يوجد شرح منشور لهذا التحدي بعد");
      expect(screen.queryByTestId("preflight-player-instructions")).toBeNull();
      expect(screen.queryByTestId("preflight-highlight")).toBeNull();
    });

    it("shows both team phones and the shared stage in one integrated RYO frame without view switcher tabs", () => {
      publishedTutorial = {
        mechanicKey: "read-your-opponent",
        revision: 1,
        scenario: SAMPLE_TUTORIAL_SCENARIO,
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

      expect(screen.getAllByTestId("ryo-explainer")).toHaveLength(1);
      expect(screen.getByTestId("ryo-explainer")).toHaveAttribute(
        "data-variant",
        "integrated",
      );
      expect(screen.getByTestId("explainer-phone-opposing")).toBeInTheDocument();
      expect(screen.getByTestId("explainer-phone-answering")).toBeInTheDocument();
      expect(
        screen.queryByRole("tab", { name: "جوالات اللاعبين" }),
      ).toBeNull();
    });

    it("preserves non-RYO mechanics inside MechanicTutorialRenderer with their own stage counts and labels", async () => {
      const user = userEvent.setup();
      publishedTutorial = {
        mechanicKey: "closest",
        revision: 1,
        scenario: SAMPLE_CLOSEST_TUTORIAL_SCENARIO,
      };
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
            challengeKey: "closest",
            challengeName: "مين أقرب",
          }),
        }),
      );

      expect(screen.getByTestId("closest-explainer")).toBeInTheDocument();
      expect(screen.queryByTestId("ryo-explainer")).toBeNull();
      const tabs = within(
        screen.getByRole("tablist", { name: "خطوات الشرح التوضيحي" }),
      ).getAllByRole("tab");
      expect(tabs).toHaveLength(4);
      await user.click(screen.getByRole("tab", { name: /تقديرات الفريقين/ }));
      expect(
        screen.getByRole("tab", { name: /تقديرات الفريقين/ }),
      ).toHaveAttribute("aria-selected", "true");
    });

    it("plays Closest, Bomb, and Top 5 continuously through intermediate GSAP scenes without unexpected pauses and preserves V6 embedded chrome", async () => {
      vi.useRealTimers();
      const gsap = (await import("gsap")).default;
      const user = userEvent.setup();

      const cases = [
        {
          mechanicKey: "closest",
          challengeName: "مين أقرب",
          scenario: SAMPLE_CLOSEST_TUTORIAL_SCENARIO,
          intermediateScene: "2",
          intermediateTabName: /تقديرات الفريقين/,
          finalTabName: /النتيجة/,
        },
        {
          mechanicKey: "bomb",
          challengeName: "القنبلة",
          scenario: SAMPLE_BOMB_TUTORIAL_SCENARIO,
          intermediateScene: "1",
          intermediateTabName: /بداية القنبلة/,
          finalTabName: /انتهاء الوقت/,
        },
        {
          mechanicKey: "top-5",
          challengeName: "أفضل 5",
          scenario: SAMPLE_TOP5_TUTORIAL_SCENARIO,
          intermediateScene: "1",
          intermediateTabName: /اختيار البطاقة/,
          finalTabName: /النقاط/,
        },
      ] as const;

      try {
        gsap.globalTimeline.timeScale(35);

        for (const item of cases) {
          publishedTutorial = {
            mechanicKey: item.mechanicKey,
            revision: 1,
            scenario: item.scenario,
          };
          const view = renderRouter(
            match({
              stage: "preflight",
              preflight: preflight({
                challengeKey: item.mechanicKey,
                challengeName: item.challengeName,
              }),
            }),
          );

          // Starts on V6 intro card with embedded stage (no nested TV stand) and V6 iPhones.
          expect(
            screen.getByTestId("preflight-inline-tutorial-intro"),
          ).toBeInTheDocument();
          expect(
            document.querySelector(
              '[data-tutorial-surface="shared"][data-variant="v6-embedded"]',
            ),
          ).not.toBeNull();
          expect(
            screen.getByTestId("v6-dynamic-island-team-a"),
          ).toBeInTheDocument();
          expect(
            screen.getByTestId("v6-dynamic-island-team-b"),
          ).toBeInTheDocument();
          // Live match team names bind into the explainer stage.
          expect(
            screen.getByTestId("preflight-inline-tutorial").textContent,
          ).toContain("أسود الشمال");
          expect(
            screen.getByTestId("preflight-inline-tutorial").textContent,
          ).toContain("صقور الرياض");

          const playToggle = screen.getByTestId(
            "preflight-inline-tutorial-play",
          );
          await user.click(playToggle);
          expect(playToggle).toHaveAttribute("data-playing", "true");

          // Verify continuous progression through intermediate scenes without pausing!
          await waitFor(
            () => {
              const wrapper = document.querySelector("[data-tutorial-scene]");
              expect(
                Number(wrapper?.getAttribute("data-tutorial-scene") ?? "0"),
              ).toBeGreaterThanOrEqual(Number(item.intermediateScene));
              expect(playToggle).toHaveAttribute("data-playing", "true");
            },
            { timeout: 3000 },
          );

          // Pause preserves exact current scene, Resume continues from it.
          await user.click(playToggle);
          expect(playToggle).toHaveAttribute("data-playing", "false");
          const pausedScene = document
            .querySelector("[data-tutorial-scene]")
            ?.getAttribute("data-tutorial-scene");
          expect(Number(pausedScene ?? "0")).toBeGreaterThanOrEqual(1);
          await user.click(playToggle);
          expect(playToggle).toHaveAttribute("data-playing", "true");

          // User tab click seeks to the exact group boundary and pauses.
          await user.click(
            screen.getByRole("tab", { name: item.finalTabName }),
          );
          expect(playToggle).toHaveAttribute("data-playing", "false");
          expect(
            screen.getByRole("tab", { name: item.finalTabName }),
          ).toHaveAttribute("aria-selected", "true");

          // Replay returns cleanly to the V6 intro card.
          await user.click(
            screen.getByTestId("preflight-inline-tutorial-replay"),
          );
          expect(
            screen.getByTestId("preflight-inline-tutorial-intro"),
          ).toBeInTheDocument();

          view.unmount();
        }
      } finally {
        gsap.globalTimeline.timeScale(1);
      }
    });

    it("keeps Closest estimates private on the shared screen until the canonical reveal stage", async () => {
      const user = userEvent.setup();
      publishedTutorial = {
        mechanicKey: "closest",
        revision: 1,
        scenario: SAMPLE_CLOSEST_TUTORIAL_SCENARIO,
      };
      renderRouter(
        match({
          stage: "preflight",
          preflight: preflight({
            challengeKey: "closest",
            challengeName: "مين أقرب",
          }),
        }),
      );

      // Step into Stage 2 ("تقديرات الفريقين"): Team A phone shows its locked estimate,
      // but the shared screen lock card keeps the numeric value secret until Reveal.
      await user.click(
        screen.getByRole("tab", { name: /تقديرات الفريقين/ }),
      );
      expect(
        screen.getByTestId("closest-shared-screen").textContent,
      ).not.toContain("١١٠");
      expect(
        screen.getByTestId("closest-shared-screen").textContent,
      ).not.toContain("١٢٠");
      expect(screen.queryByTestId("closest-tutorial-reveal")).toBeNull();

      // Step into Stage 3 ("الكشف"): the target value and comparative distances appear.
      await user.click(screen.getByRole("tab", { name: /الكشف/ }));
      expect(
        screen.getByTestId("closest-tutorial-reveal"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("closest-tutorial-reveal").textContent,
      ).toContain("١٢٠");
    });

    it("shows a compact recap on repeated encounters and lets the host expand without delaying launch", async () => {
      const user = userEvent.setup();
      publishedTutorial = {
        mechanicKey: "read-your-opponent",
        revision: 1,
        scenario: SAMPLE_TUTORIAL_SCENARIO,
      };
      const base = match({
        stage: "preflight",
        preflight: preflight({
          ...readyPreflight(),
          challengeKey: "read-your-opponent",
          challengeName: "اقرأ خصمك",
        }),
      });
      // Mark an earlier occurrence of read-your-opponent as already completed.
      base.unified!.board.positions[0] = {
        ...base.unified!.board.positions[0],
        challengeKey: "read-your-opponent",
        status: "completed",
      };
      renderRouter(base);

      expect(
        screen.getByTestId("preflight-inline-tutorial-recap"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("ryo-explainer")).toBeNull();
      // Start stays enabled immediately on repeat encounters.
      expect(screen.getByTestId("preflight-start")).not.toBeDisabled();

      await user.click(screen.getByTestId("preflight-inline-tutorial-expand"));
      expect(screen.getByTestId("ryo-explainer")).toBeInTheDocument();
    });

    it("places the joining panel before the tutorial in the preflight document order", () => {
      publishedTutorial = {
        mechanicKey: "read-your-opponent",
        revision: 1,
        scenario: SAMPLE_TUTORIAL_SCENARIO,
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

      const joiningRegion = screen.getByTestId("preflight-joining-region");
      const tutorialRegion = screen.getByTestId("preflight-explainer");
      expect(joiningRegion).toHaveClass("order-1", "lg:order-2");
      expect(tutorialRegion).toHaveClass("order-2", "lg:order-1");
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

    it("renders participant character avatars from the live session snapshot when chosen", () => {
      const state = match({ stage: "preflight", preflight: readyPreflight() });
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <LiveSessionContext.Provider
            value={
              {
                snapshot: {
                  sessionId: "session-1",
                  mode: { key: "core-timed-turns", version: 1 },
                  status: "active",
                  revision: 4,
                  serverTimestamp: "2026-08-06T00:00:00.000Z",
                  round: { number: 1 },
                  teams: [
                    { id: "team-a", name: "أسود الشمال", active: true },
                    { id: "team-b", name: "صقور الرياض", active: true },
                  ],
                  participants: [
                    {
                      id: "p1",
                      displayName: "أحمد",
                      role: "team-player",
                      teamId: "team-a",
                      ready: true,
                      joinedAt: "2026-08-06T00:00:00.000Z",
                      connected: true,
                      connectedDeviceCount: 1,
                      lastSeenAt: "2026-08-06T00:00:00.000Z",
                      presence: "connected",
                      avatarKey: "astronaut",
                    },
                  ],
                  availableActions: [],
                  match: state,
                },
                connection: "connected",
                command: vi.fn(),
                gameplayCommand: vi.fn(),
                resync: vi.fn(),
              } as unknown as React.ContextType<typeof LiveSessionContext>
            }
          >
            <MatchStageRouter actor="controller" />
          </LiveSessionContext.Provider>
        </QueryClientProvider>,
      );

      const teamA = screen.getByTestId("preflight-team-team-a");
      expect(
        teamA.querySelector('[data-character="astronaut"]'),
      ).toBeInTheDocument();
      // Connected state is exposed for assistive tech & E2E alongside visible name and character identity.
      expect(within(teamA).getAllByLabelText("متصل")).toHaveLength(2);
      expect(within(teamA).getByText("أحمد")).toBeInTheDocument();
      expect(within(teamA).getByText("منى")).toBeInTheDocument();
      // Back-to-board control trails the tutorial stage so mobile order stays clean.
      expect(
        screen
          .getByTestId("preflight-explainer")
          .compareDocumentPosition(
            screen.getByRole("button", { name: "ارجع للوحة" }),
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
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
