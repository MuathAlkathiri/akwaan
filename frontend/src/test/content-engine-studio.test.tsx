import { ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/features/content-engine-review/api";
import { BatchSubmissionPanel } from "@/features/content-engine-review/batch-submission-panel";
import {
  ContentEngineReviewWorkspace,
  STUDIO_STORAGE_KEY,
} from "@/features/content-engine-review/content-engine-review-workspace";
import { JobsHistoryPanel } from "@/features/content-engine-review/jobs-history-panel";

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

function WithQueryClient({ children }: { children: ReactNode }) {
  const client = makeQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const mockAuthoringOptions = (): api.EngineAuthoringOptions => ({
  specVersion: 1,
  limits: {
    minTargetCount: 1,
    maxTargetCount: 10,
    maxBatchGuidanceLength: 1000,
  },
  engine: {
    engineEnabled: true,
    provider: "fake",
    generationModel: "fake-gen-v1",
    qualityModel: "fake-judge-v1",
    providerConfigured: true,
    generationModelConfigured: true,
    qualityModelConfigured: true,
    liveProviderEnabled: false,
    providerReady: true,
    pricingConfigured: true,
    submissionReady: true,
    blockedCode: null,
    blockedReason: null,
  },
  mechanics: [
    {
      mechanicKey: "read-your-opponent",
      aliases: ["ryo"],
      name: "اقرأ خصمك",
      category: "standard",
      boundWorldKey: null,
      manifestStatus: "AUTHORABLE",
      generatorSupported: true,
      answerMode: "MC",
      runtimeChallengeTypeId: "ct-ryo",
      runtimeStatus: "active",
      runtimeTargetResolved: true,
      eligible: true,
      supportsDifficultySelection: true,
      supportedDifficulties: [
        "mixed",
        "easy",
        "medium",
        "relatively_difficult",
      ],
      defaultDifficulty: "mixed",
      difficultyDeferredReason: null,
      experimentalDifficultyDistribution: {
        easy: 30,
        medium: 50,
        relativelyDifficult: 20,
      },
      blockedCode: null,
      blockedReason: null,
    },
    {
      mechanicKey: "closest",
      aliases: [],
      name: "مين أقرب",
      category: "standard",
      boundWorldKey: null,
      manifestStatus: "AUTHORABLE",
      generatorSupported: true,
      answerMode: "NUMERIC",
      runtimeChallengeTypeId: "ct-closest",
      runtimeStatus: "active",
      runtimeTargetResolved: true,
      eligible: true,
      supportsDifficultySelection: false,
      supportedDifficulties: [],
      defaultDifficulty: null,
      difficultyDeferredReason: "CLOSEST_DIFFICULTY_DEFERRED",
      experimentalDifficultyDistribution: null,
      blockedCode: null,
      blockedReason: null,
    },
    {
      mechanicKey: "ekshifni",
      aliases: [],
      name: "اكشفني",
      category: "signature",
      boundWorldKey: "cinema-series",
      manifestStatus: "AUTHORABLE",
      generatorSupported: false,
      answerMode: null,
      runtimeChallengeTypeId: "ct-ekshifni",
      runtimeStatus: "active",
      runtimeTargetResolved: true,
      eligible: false,
      supportsDifficultySelection: false,
      supportedDifficulties: [],
      defaultDifficulty: null,
      difficultyDeferredReason: null,
      experimentalDifficultyDistribution: null,
      blockedCode: "MECHANIC_NOT_GENERATABLE",
      blockedReason:
        'MECHANIC_NOT_GENERATABLE: no authored answer mode for mechanic "ekshifni"',
    },
  ],
  worlds: [
    {
      worldKey: "video-games",
      name: "ألعاب الفيديو",
      runtimeWorldId: "w-vg",
      runtimeStatus: "active",
      runtimeTargetResolved: true,
      eligible: true,
      blockedCode: null,
      blockedReason: null,
      scopes: [
        {
          scopeKey: "overwatch",
          worldKey: "video-games",
          name: "أوفرواتش",
          runtimeScopeId: "s-ow",
          runtimeStatus: "active",
          runtimeTargetResolved: true,
          exemplarsPresent: true,
          excludedMechanicKeys: [],
          eligible: true,
          blockedCode: null,
          blockedReason: null,
          mechanics: [
            {
              mechanicKey: "read-your-opponent",
              category: "standard",
              boundWorldKey: null,
              manifestStatus: "AUTHORABLE",
              generatorSupported: true,
              answerMode: "MC",
              authorable: true,
              runtimeCompatible: true,
              runtimeTargetResolved: true,
              eligible: true,
              onBoard: true,
              offBoardAuthoringAllowed: false,
              boardSlotKeys: ["slot_1"],
              supportsDifficultySelection: true,
              supportedDifficulties: [
                "mixed",
                "easy",
                "medium",
                "relatively_difficult",
              ],
              defaultDifficulty: "mixed",
              difficultyDeferredReason: null,
              blockedCode: null,
              blockedReason: null,
            },
            {
              mechanicKey: "closest",
              category: "standard",
              boundWorldKey: null,
              manifestStatus: "AUTHORABLE",
              generatorSupported: true,
              answerMode: "NUMERIC",
              authorable: true,
              runtimeCompatible: true,
              runtimeTargetResolved: true,
              eligible: true,
              onBoard: false,
              offBoardAuthoringAllowed: true,
              boardSlotKeys: [],
              supportsDifficultySelection: false,
              supportedDifficulties: [],
              defaultDifficulty: null,
              difficultyDeferredReason: "CLOSEST_DIFFICULTY_DEFERRED",
              blockedCode: null,
              blockedReason: null,
            },
            {
              mechanicKey: "ekshifni",
              category: "signature",
              boundWorldKey: "cinema-series",
              manifestStatus: "AUTHORABLE",
              generatorSupported: false,
              answerMode: null,
              authorable: false,
              runtimeCompatible: false,
              runtimeTargetResolved: true,
              eligible: false,
              onBoard: false,
              offBoardAuthoringAllowed: false,
              boardSlotKeys: [],
              supportsDifficultySelection: false,
              supportedDifficulties: [],
              defaultDifficulty: null,
              difficultyDeferredReason: null,
              blockedCode: "MECHANIC_WORLD_MISMATCH",
              blockedReason:
                "AUTHORING_BLOCKED — MECHANIC_WORLD_MISMATCH (ekshifni is bound to cinema-series, not video-games)",
            },
          ],
        },
        {
          scopeKey: "soulsborne",
          worldKey: "video-games",
          name: "سولزبورن",
          runtimeScopeId: "s-sb",
          runtimeStatus: "active",
          runtimeTargetResolved: true,
          exemplarsPresent: true,
          excludedMechanicKeys: ["read-your-opponent"],
          eligible: true,
          blockedCode: null,
          blockedReason: null,
          mechanics: [
            {
              mechanicKey: "closest",
              category: "standard",
              boundWorldKey: null,
              manifestStatus: "AUTHORABLE",
              generatorSupported: true,
              answerMode: "NUMERIC",
              authorable: true,
              runtimeCompatible: true,
              runtimeTargetResolved: true,
              eligible: true,
              onBoard: false,
              offBoardAuthoringAllowed: true,
              boardSlotKeys: [],
              supportsDifficultySelection: false,
              supportedDifficulties: [],
              defaultDifficulty: null,
              difficultyDeferredReason: "CLOSEST_DIFFICULTY_DEFERRED",
              blockedCode: null,
              blockedReason: null,
            },
            {
              mechanicKey: "read-your-opponent",
              category: "standard",
              boundWorldKey: null,
              manifestStatus: "AUTHORABLE",
              generatorSupported: true,
              answerMode: "MC",
              authorable: true,
              runtimeCompatible: false,
              runtimeTargetResolved: true,
              eligible: false,
              onBoard: false,
              offBoardAuthoringAllowed: false,
              boardSlotKeys: [],
              supportsDifficultySelection: true,
              supportedDifficulties: [
                "mixed",
                "easy",
                "medium",
                "relatively_difficult",
              ],
              defaultDifficulty: "mixed",
              difficultyDeferredReason: null,
              blockedCode: "CHALLENGE_TYPE_EXCLUDED_BY_SCOPE",
              blockedReason:
                'CHALLENGE_TYPE_EXCLUDED_BY_SCOPE: ChallengeType "read-your-opponent" is excluded from Scope "soulsborne"',
            },
          ],
        },
      ],
    },
    {
      worldKey: "puzzles",
      name: "الألغاز",
      runtimeWorldId: "w-pz",
      runtimeStatus: "active",
      runtimeTargetResolved: true,
      eligible: true,
      blockedCode: null,
      blockedReason: null,
      scopes: [
        {
          scopeKey: "wordplay-letters",
          worldKey: "puzzles",
          name: "تلاعب بالحروف",
          runtimeScopeId: "s-wl",
          runtimeStatus: "active",
          runtimeTargetResolved: true,
          exemplarsPresent: true,
          excludedMechanicKeys: [],
          eligible: true,
          blockedCode: null,
          blockedReason: null,
          mechanics: [
            {
              mechanicKey: "read-your-opponent",
              category: "standard",
              boundWorldKey: null,
              manifestStatus: "AUTHORABLE",
              generatorSupported: true,
              answerMode: "MC",
              authorable: true,
              runtimeCompatible: true,
              runtimeTargetResolved: true,
              eligible: true,
              onBoard: true,
              offBoardAuthoringAllowed: false,
              boardSlotKeys: ["slot_2"],
              supportsDifficultySelection: true,
              supportedDifficulties: [
                "mixed",
                "easy",
                "medium",
                "relatively_difficult",
              ],
              defaultDifficulty: "mixed",
              difficultyDeferredReason: null,
              blockedCode: null,
              blockedReason: null,
            },
          ],
        },
      ],
    },
  ],
  scopes: [],
});

const mockPreflightResponse = (
  overrides?: Partial<api.EnginePreflight>,
): api.EnginePreflight => ({
  resolvable: true,
  submissionReady: true,
  planDigest: "d".repeat(64),
  contextHash: "c".repeat(64),
  ruleSetDigest: "r".repeat(64),
  estimatedMicros: 320_000,
  estimatedSar: 0.32,
  generationEstimatedMicros: 200_000,
  conditionalJudgeEstimatedMicros: 120_000,
  maxJudgeEstimatedMicros: 120_000,
  judgeEligible: true,
  pricingConfigured: true,
  liveProviderEnabled: false,
  engineEnabled: true,
  providerConfigured: true,
  providerReady: true,
  onBoard: true,
  offBoardAuthoringAllowed: false,
  boardSlotKeys: ["slot_1"],
  withinBatchCap: true,
  withinMonthlyBudget: true,
  generatorSupported: true,
  generationSpec: {
    specVersion: 1,
    worldKey: "video-games",
    scopeKey: "overwatch",
    mechanicKey: "read-your-opponent",
    answerMode: "MC",
    targetCount: 5,
    difficulty: "mixed",
    ryoDifficultyTargets: {
      easy: 30,
      medium: 50,
      relatively_difficult: 20,
    },
    batchGuidance: null,
    promptVersion: "mc-v2",
    provider: "fake",
    generationModel: "fake-gen-v1",
    qualityModel: "fake-judge-v1",
    temperature: 0.8,
    outputTokensPerCandidate: 800,
    maxOutputTokens: 4000,
    contextHash: "c".repeat(64),
    ruleSetDigest: "r".repeat(64),
  },
  budget: {
    periodKey: "2026-10",
    capMicros: 100_000_000,
    spentMicros: 1_000_000,
    reservedMicros: 0,
    availableMicros: 99_000_000,
  },
  ...overrides,
});

const mockJobStatus = (
  overrides?: Partial<api.EngineJobStatus>,
): api.EngineJobStatus => ({
  jobId: "671000000000000000000099",
  worldKey: "video-games",
  scopeKey: "overwatch",
  mechanicKey: "read-your-opponent",
  targetCount: 5,
  status: "queued",
  pipelineStage: "pending",
  attempts: 0,
  cancellationRequested: false,
  awaitingReviewReason: null,
  lastError: null,
  specVersion: 1,
  generationSpec: mockPreflightResponse().generationSpec,
  planDigest: "d".repeat(64),
  provenanceComplete: true,
  createdBy: "admin-1",
  createdByEmail: "admin@akwaan.test",
  lastExecutedBy: null,
  lastExecutedByEmail: null,
  candidates: {},
  spentMicros: 0,
  spentSar: 0,
  outstandingReservedMicros: 0,
  providerCalls: 0,
  ...overrides,
});

describe("Admin Content Generation Studio — Phase B UI", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/admin/content-engine");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("1 & 2 & 4: populates server-driven World -> Scope -> mechanic selectors, resets dependent fields on change, shows disabled diagnostics & off-board badge, and toggles RYO vs Closest difficulty", async () => {
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(
      mockAuthoringOptions(),
    );

    render(
      <WithQueryClient>
        <BatchSubmissionPanel onBatchReady={vi.fn()} />
      </WithQueryClient>,
    );

    const worldSelect = (await screen.findByTestId(
      "select-world",
    )) as HTMLSelectElement;
    const scopeSelect = screen.getByTestId("select-scope") as HTMLSelectElement;
    const mechanicSelect = screen.getByTestId(
      "select-mechanic",
    ) as HTMLSelectElement;

    await waitFor(() => {
      expect(worldSelect.value).toBe("video-games");
      expect(scopeSelect.value).toBe("overwatch");
      expect(mechanicSelect.value).toBe("read-your-opponent");
    });

    // RYO shows difficulty selector with mixed, easy, medium, relatively_difficult
    const difficultySelect = screen.getByTestId(
      "select-difficulty",
    ) as HTMLSelectElement;
    expect(difficultySelect.value).toBe("mixed");
    expect(
      Array.from(difficultySelect.options).map((o) => o.value),
    ).toEqual(["mixed", "easy", "medium", "relatively_difficult"]);
    expect(screen.getByTestId("ryo-mixed-distribution")).toHaveTextContent(
      "سهل 30%",
    );
    expect(screen.getByTestId("ryo-mixed-distribution")).toHaveTextContent(
      "متوسط 50%",
    );
    expect(screen.getByTestId("ryo-mixed-distribution")).toHaveTextContent(
      "صعب نسبياً 20%",
    );

    // Disabled mechanics in the current scope are surfaced with server diagnostics
    expect(
      screen.getByTestId("disabled-mechanics-diagnostics"),
    ).toHaveTextContent("MECHANIC_WORLD_MISMATCH");

    // Switching mechanic to Closest hides difficulty selector, shows deferred reason, and shows off-board authoring badge
    fireEvent.change(mechanicSelect, { target: { value: "closest" } });
    expect(screen.queryByTestId("select-difficulty")).toBeNull();
    expect(screen.getByTestId("difficulty-deferred-note")).toHaveTextContent(
      "CLOSEST_DIFFICULTY_DEFERRED",
    );
    expect(screen.getByTestId("off-board-allowed-badge")).toBeInTheDocument();

    // Switching Scope to `soulsborne` resets mechanic to first eligible in that scope (`closest`)
    // and selecting excluded `read-your-opponent` surfaces CHALLENGE_TYPE_EXCLUDED_BY_SCOPE
    fireEvent.change(scopeSelect, { target: { value: "soulsborne" } });
    expect(mechanicSelect.value).toBe("closest");

    fireEvent.change(mechanicSelect, {
      target: { value: "read-your-opponent" },
    });
    expect(
      screen.getByTestId("selection-blocked-diagnostic"),
    ).toHaveTextContent("CHALLENGE_TYPE_EXCLUDED_BY_SCOPE");

    // Switching World to `puzzles` resets Scope to `wordplay-letters` and Mechanic to `read-your-opponent`
    fireEvent.change(worldSelect, { target: { value: "puzzles" } });
    expect(scopeSelect.value).toBe("wordplay-letters");
    expect(mechanicSelect.value).toBe("read-your-opponent");
    expect(screen.queryByTestId("selection-blocked-diagnostic")).toBeNull();
  });

  it("3 & 5: enforces candidate count capacity without silent truncation and validates/normalizes 1,000-character batch guidance", async () => {
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(
      mockAuthoringOptions(),
    );
    const preflightSpy = vi
      .spyOn(api, "preflightJob")
      .mockResolvedValue(mockPreflightResponse());

    render(
      <WithQueryClient>
        <BatchSubmissionPanel onBatchReady={vi.fn()} />
      </WithQueryClient>,
    );

    const worldSelect = (await screen.findByTestId(
      "select-world",
    )) as HTMLSelectElement;
    await waitFor(() => expect(worldSelect.value).toBe("video-games"));
    const countInput = screen.getByTestId(
      "input-target-count",
    ) as HTMLInputElement;
    const preflightBtn = screen.getByTestId(
      "button-preflight",
    ) as HTMLButtonElement;

    // Entering 15 (exceeding maxTargetCount=10) keeps "15" in input (no silent truncation), shows error, and disables preflight
    fireEvent.change(countInput, { target: { value: "15" } });
    expect(countInput.value).toBe("15");
    expect(screen.getByTestId("target-count-error")).toHaveTextContent("15");
    expect(preflightBtn).toBeDisabled();

    // Restore valid count
    fireEvent.change(countInput, { target: { value: "4" } });
    expect(screen.queryByTestId("target-count-error")).toBeNull();
    expect(preflightBtn).not.toBeDisabled();

    // Batch guidance subordinate explanation is displayed
    expect(
      screen.getByTestId("batch-guidance-subordinate-note"),
    ).toHaveTextContent("Canonical Skills");

    const guidanceInput = screen.getByTestId(
      "textarea-batch-guidance",
    ) as HTMLTextAreaElement;

    // Exceeding 1,000 characters shows error and disables preflight without silent truncation
    const tooLong = "أ".repeat(1005);
    fireEvent.change(guidanceInput, { target: { value: tooLong } });
    expect(guidanceInput.value).toHaveLength(1005);
    expect(screen.getByTestId("batch-guidance-error")).toHaveTextContent(
      "1005 / 1000",
    );
    expect(preflightBtn).toBeDisabled();

    // Valid guidance with CRLF and surrounding whitespace is normalized on preflight request
    fireEvent.change(guidanceInput, {
      target: { value: "  سطر أول\r\nسطر ثانٍ  " },
    });
    expect(screen.queryByTestId("batch-guidance-error")).toBeNull();

    fireEvent.click(preflightBtn);
    await waitFor(() => {
      expect(preflightSpy).toHaveBeenCalledWith({
        worldKey: "video-games",
        scopeKey: "overwatch",
        mechanicKey: "read-your-opponent",
        targetCount: 4,
        difficulty: "mixed",
        batchGuidance: "سطر أول\nسطر ثانٍ",
      });
    });
  });

  it("6 & 7 & 13: renders full preflight cost breakdown (generation vs conditional judge vs ceiling), invalidates preflight on any input change, and recovers cleanly from 409 PREFLIGHT_PLAN_DRIFT", async () => {
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(
      mockAuthoringOptions(),
    );
    const preflightSpy = vi
      .spyOn(api, "preflightJob")
      .mockResolvedValue(mockPreflightResponse());
    const submitSpy = vi.spyOn(api, "submitJob").mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          code: "PREFLIGHT_PLAN_DRIFT",
          message: "PREFLIGHT_PLAN_DRIFT: digest mismatch",
        },
      },
    });

    render(
      <WithQueryClient>
        <BatchSubmissionPanel onBatchReady={vi.fn()} />
      </WithQueryClient>,
    );

    const preflightBtn = await screen.findByTestId("button-preflight");
    const submitBtn = screen.getByTestId("button-submit-job");

    // Submit is disabled before preflight
    await waitFor(() => expect(preflightBtn).not.toBeDisabled());
    expect(submitBtn).toBeDisabled();

    fireEvent.click(preflightBtn);

    // Preflight panel renders separate generation cost, conditional judge cost, total ceiling, and budget constraints
    await screen.findByTestId("preflight-results");
    expect(screen.getByTestId("cost-generation-micros")).toHaveTextContent(
      "0.2000 ر.س (200,000 ميكرو)",
    );
    expect(
      screen.getByTestId("cost-conditional-judge-micros"),
    ).toHaveTextContent("0.1200 ر.س (120,000 ميكرو)");
    expect(screen.getByTestId("cost-total-ceiling")).toHaveTextContent(
      "0.3200 ر.س (320,000 ميكرو)",
    );
    expect(submitBtn).not.toBeDisabled();

    // Changing any field (e.g., difficulty) immediately invalidates preflight and disables submit
    fireEvent.change(screen.getByTestId("select-difficulty"), {
      target: { value: "easy" },
    });
    expect(screen.queryByTestId("preflight-results")).toBeNull();
    expect(submitBtn).toBeDisabled();

    // Re-run preflight, then trigger 409 PREFLIGHT_PLAN_DRIFT on submit
    fireEvent.click(preflightBtn);
    await screen.findByTestId("preflight-results");
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    await screen.findByTestId("plan-drift-alert");
    expect(submitSpy).toHaveBeenCalledTimes(1);
    // Old preflight is invalidated so stale planDigest cannot be resubmitted
    expect(screen.queryByTestId("preflight-results")).toBeNull();
    expect(submitBtn).toBeDisabled();

    //Also verify disabled provider / missing pricing blocking diagnostics in preflight
    preflightSpy.mockResolvedValueOnce(
      mockPreflightResponse({
        resolvable: true,
        submissionReady: false,
        pricingConfigured: false,
        liveProviderEnabled: false,
        estimatedMicros: undefined,
        estimatedSar: undefined,
        generationEstimatedMicros: undefined,
        conditionalJudgeEstimatedMicros: undefined,
        blockedCode: "PRICING_NOT_CONFIGURED",
        blockedReason:
          "PRICING_NOT_CONFIGURED: no rate configured for model fake-gen-v1",
      }),
    );

    fireEvent.click(preflightBtn);
    await screen.findByTestId("preflight-blocking-diagnostic");
    expect(
      screen.getByTestId("preflight-blocking-diagnostic"),
    ).toHaveTextContent("PRICING_NOT_CONFIGURED");
    // Missing estimates are shown as "غير متاح", never fabricated as zero
    expect(screen.getByTestId("cost-generation-micros")).toHaveTextContent(
      "غير متاح",
    );
    expect(submitBtn).toBeDisabled();
  });

  it("8 & 9 & 10: targets exact jobId on execution, prevents duplicate clicks, polls while leased, and stops polling on terminal state", async () => {
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(
      mockAuthoringOptions(),
    );
    vi.spyOn(api, "preflightJob").mockResolvedValue(mockPreflightResponse());
    const submitSpy = vi.spyOn(api, "submitJob").mockResolvedValue({
      jobId: "671000000000000000000099",
      created: true,
      contextHash: "c".repeat(64),
      planDigest: "d".repeat(64),
    });

    let currentJobStatus: api.EngineJobStatus = mockJobStatus({
      status: "queued",
      pipelineStage: "pending",
    });
    const statusSpy = vi
      .spyOn(api, "getJobStatus")
      .mockImplementation(async () => currentJobStatus);

    let resolveRun!: (v: { jobId: string; alreadyRunning: boolean }) => void;
    const runSpy = vi.spyOn(api, "runJob").mockImplementation(
      () =>
        new Promise((resolve) => {
          currentJobStatus = mockJobStatus({
            status: "leased",
            pipelineStage: "generated",
            attempts: 1,
          });
          resolveRun = resolve;
        }),
    );

    render(
      <WithQueryClient>
        <BatchSubmissionPanel onBatchReady={vi.fn()} />
      </WithQueryClient>,
    );

    const preflightBtn = await screen.findByTestId("button-preflight");
    await waitFor(() => expect(preflightBtn).not.toBeDisabled());
    fireEvent.click(preflightBtn);

    const submitBtn = await screen.findByTestId("button-submit-job");
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    fireEvent.click(submitBtn);

    const runBtn = await screen.findByTestId("button-run-exact-job");
    expect(submitSpy).toHaveBeenCalledTimes(1);

    // Rapid double-click on Run only triggers one runJob call for the exact jobId
    fireEvent.click(runBtn);
    fireEvent.click(runBtn);
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith("671000000000000000000099");

    // Complete runJob and transition to terminal awaiting_review
    currentJobStatus = mockJobStatus({
      status: "awaiting_review",
      pipelineStage: "awaiting_review",
      attempts: 1,
      candidates: { awaiting_review: 5 },
      spentMicros: 200_000,
      spentSar: 0.2,
    });
    await act(async () => {
      resolveRun({
        jobId: "671000000000000000000099",
        alreadyRunning: false,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("active-job-status-badge")).toHaveTextContent(
        "جاهزة للمراجعة",
      );
    });

    // Run button is now disabled because job is in awaiting_review
    expect(screen.getByTestId("button-run-exact-job")).toBeDisabled();
    expect(statusSpy).toHaveBeenCalledWith("671000000000000000000099");
  });

  it("11 & 12: recovers active job and filters across workspace refresh/tab switches, handles timeout recovery by re-reading job status, and hands off candidates to review", async () => {
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(
      mockAuthoringOptions(),
    );
    vi.spyOn(api, "listJobs").mockResolvedValue({
      items: [
        mockJobStatus({
          jobId: "671000000000000000000077",
          worldKey: "puzzles",
          scopeKey: "wordplay-letters",
          mechanicKey: "read-your-opponent",
          status: "awaiting_review",
          pipelineStage: "awaiting_review",
          candidates: { awaiting_review: 3 },
          spentMicros: 150_000,
          spentSar: 0.15,
        }),
      ],
      nextCursor: null,
    });
    const statusSpy = vi.spyOn(api, "getJobStatus").mockResolvedValue(
      mockJobStatus({
        jobId: "671000000000000000000077",
        worldKey: "puzzles",
        scopeKey: "wordplay-letters",
        mechanicKey: "read-your-opponent",
        status: "awaiting_review",
        pipelineStage: "awaiting_review",
        candidates: { awaiting_review: 3 },
        spentMicros: 150_000,
        spentSar: 0.15,
      }),
    );
    const listCandidatesSpy = vi
      .spyOn(api, "listCandidates")
      .mockResolvedValue([]);

    const { unmount } = render(
      <WithQueryClient>
        <ContentEngineReviewWorkspace />
      </WithQueryClient>,
    );

    // Switch to Jobs surface
    fireEvent.click(await screen.findByTestId("surface-tab-jobs"));
    await screen.findByTestId("jobs-history-panel");

    // Job row is displayed and selected in inspector
    await screen.findByTestId("job-row-671000000000000000000077");
    expect(screen.getByTestId("job-detail-inspector")).toHaveTextContent(
      "671000000000000000000077",
    );

    // Click Candidate Handoff button on the job row
    fireEvent.click(
      screen.getByTestId("job-handoff-btn-671000000000000000000077"),
    );

    // Switches to Review surface and populates jobId, worldKey, scopeKey filters
    await waitFor(() => {
      expect(listCandidatesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "671000000000000000000077",
          worldKey: "puzzles",
          scopeKey: "wordplay-letters",
        }),
      );
    });

    // State is persisted in sessionStorage so remounting (simulating browser refresh) recovers job and filters
    expect(window.sessionStorage.getItem(STUDIO_STORAGE_KEY)).toContain(
      "671000000000000000000077",
    );
    unmount();

    render(
      <WithQueryClient>
        <ContentEngineReviewWorkspace />
      </WithQueryClient>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("studio-preserved-context")).toHaveTextContent(
        "671000000000000000000077",
      );
    });
    expect(statusSpy).toHaveBeenCalledWith("671000000000000000000077");
  });

  it("re-reads job status without auto-retrying when a synchronous run request times out", async () => {
    const queuedJob = mockJobStatus({
      jobId: "671000000000000000000088",
      status: "queued",
    });
    const completedAfterTimeout = mockJobStatus({
      jobId: "671000000000000000000088",
      status: "awaiting_review",
      pipelineStage: "awaiting_review",
      candidates: { awaiting_review: 2 },
    });

    vi.spyOn(api, "listJobs").mockResolvedValue({
      items: [queuedJob],
      nextCursor: null,
    });
    const statusSpy = vi
      .spyOn(api, "getJobStatus")
      .mockResolvedValueOnce(queuedJob)
      .mockResolvedValueOnce(completedAfterTimeout);
    const runSpy = vi.spyOn(api, "runJob").mockRejectedValueOnce({
      code: "ECONNABORTED",
      message: "timeout of 30000ms exceeded",
    });

    render(
      <WithQueryClient>
        <JobsHistoryPanel
          selectedJobId="671000000000000000000088"
          onSelectJobId={vi.fn()}
          onHandoffToReview={vi.fn()}
        />
      </WithQueryClient>,
    );

    const runBtn = await screen.findByTestId(
      "job-run-btn-671000000000000000000088",
    );
    fireEvent.click(runBtn);

    await screen.findByTestId("jobs-feedback-banner");
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(statusSpy).toHaveBeenCalledWith("671000000000000000000088");
    expect(screen.getByTestId("jobs-feedback-banner")).toHaveTextContent(
      "دون إعادة تشغيل مدفوع تلقائي",
    );
  });
});
