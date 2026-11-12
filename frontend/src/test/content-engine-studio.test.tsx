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
import { BATCH_INTENT_STORAGE_KEY } from "@/features/content-engine-review/batch-intent-storage";
import { BatchSubmissionPanel } from "@/features/content-engine-review/batch-submission-panel";
import {
  ContentEngineReviewWorkspace,
  STUDIO_STORAGE_KEY,
} from "@/features/content-engine-review/content-engine-review-workspace";
import { JobsHistoryPanel } from "@/features/content-engine-review/jobs-history-panel";
import type { ReviewCandidate } from "@/features/content-engine-review/types";

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
  totalEstimatedSar: 0.32,
  totalEstimatedMicros: 320_000,
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

    expect(Array.from(mechanicSelect.options).map((o) => o.value)).not.toContain("read-your-opponent");
    expect(screen.getByTestId("disabled-mechanics-diagnostics")).toHaveTextContent("CHALLENGE_TYPE_EXCLUDED_BY_SCOPE");

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
    const submitBtn = screen.getByTestId("button-submit-job") as HTMLButtonElement;

    // Entering 15 (exceeding maxTargetCount=10) keeps "15" in input (no silent truncation), shows error, and disables preflight
    fireEvent.change(countInput, { target: { value: "15" } });
    expect(countInput.value).toBe("15");
    expect(screen.getByTestId("target-count-error")).toHaveTextContent("15");
    expect(submitBtn).toBeDisabled();

    // Restore valid count
    fireEvent.change(countInput, { target: { value: "4" } });
    expect(screen.queryByTestId("target-count-error")).toBeNull();
    expect(submitBtn).toBeDisabled();

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
    expect(submitBtn).toBeDisabled();

    // Valid guidance with CRLF and surrounding whitespace is normalized on preflight request
    fireEvent.change(guidanceInput, {
      target: { value: "  سطر أول\r\nسطر ثانٍ  " },
    });
    expect(screen.queryByTestId("batch-guidance-error")).toBeNull();

    await waitFor(() => {
      expect(preflightSpy).toHaveBeenCalledWith({
        worldKey: "video-games",
        scopeKey: "overwatch",
        mechanicKey: "read-your-opponent",
        targetCount: 4,
        difficulty: "mixed",
        batchGuidance: "سطر أول\nسطر ثانٍ",
        batchIntentId: expect.any(String),
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

    const submitBtn = await screen.findByTestId("button-submit-job");
    expect(submitBtn).toBeDisabled();

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
    await screen.findByTestId("preflight-results");
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    fireEvent.click(screen.getByRole("button", { name: "تأكيد التوليد" }));
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

    fireEvent.change(screen.getByTestId("select-difficulty"), { target: { value: "medium" } });
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

    const submitBtn = await screen.findByTestId("button-submit-job");
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    fireEvent.click(submitBtn);
    const confirm = screen.getByRole("button", { name: "تأكيد التوليد" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(runSpy).toHaveBeenCalledTimes(1));
    expect(submitSpy).toHaveBeenCalledTimes(1);
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

    // The completed job is not run again automatically.
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(statusSpy).toHaveBeenCalledWith("671000000000000000000099");
  });

  it("debounces preflight and ignores out-of-order responses", async () => {
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(mockAuthoringOptions());
    const pending: Array<(value: api.EnginePreflight) => void> = [];
    const preflight = vi.spyOn(api, "preflightJob").mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    render(<WithQueryClient><BatchSubmissionPanel /></WithQueryClient>);
    await screen.findByTestId("input-target-count");
    await waitFor(() => expect(preflight).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId("input-target-count"), { target: { value: "3" } });
    fireEvent.change(screen.getByTestId("input-target-count"), { target: { value: "4" } });
    await waitFor(() => expect(preflight).toHaveBeenCalledTimes(2));
    await act(async () => pending[1](mockPreflightResponse({ totalEstimatedSar: 0.4, planDigest: "new-plan" })));
    expect(screen.getByTestId("button-submit-job")).toHaveTextContent("4 أسئلة");
    expect(screen.getByTestId("button-submit-job")).toHaveTextContent("0.4000");
    await act(async () => pending[0](mockPreflightResponse({ totalEstimatedSar: 0.9, planDigest: "old-plan" })));
    expect(screen.getByTestId("button-submit-job")).toHaveTextContent("0.4000");
  });

  it("requires a server cost and allows cancelling confirmation without a paid request", async () => {
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(mockAuthoringOptions());
    const preflight = vi.spyOn(api, "preflightJob").mockResolvedValueOnce(mockPreflightResponse({ totalEstimatedSar: undefined }));
    const submit = vi.spyOn(api, "submitJob");
    render(<WithQueryClient><BatchSubmissionPanel /></WithQueryClient>);
    await screen.findByText("تعذر تحديد الحد الأقصى للتكلفة من الخادم.");
    expect(screen.getByTestId("button-submit-job")).toBeDisabled();
    preflight.mockResolvedValue(mockPreflightResponse());
    fireEvent.change(screen.getByTestId("input-target-count"), { target: { value: "4" } });
    await waitFor(() => expect(screen.getByTestId("button-submit-job")).toBeEnabled());
    fireEvent.click(screen.getByTestId("button-submit-job"));
    fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not retry an ambiguous execution and reports unknown status", async () => {
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(mockAuthoringOptions());
    vi.spyOn(api, "preflightJob").mockResolvedValue(mockPreflightResponse());
    vi.spyOn(api, "submitJob").mockResolvedValue({ jobId: "job-exact", created: true, contextHash: "c" });
    const run = vi.spyOn(api, "runJob").mockRejectedValue(new Error("network timeout"));
    vi.spyOn(api, "getJobStatus").mockRejectedValue(new Error("offline"));
    render(<WithQueryClient><BatchSubmissionPanel /></WithQueryClient>);
    const button = await screen.findByTestId("button-submit-job");
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button); fireEvent.click(screen.getByRole("button", { name: "تأكيد التوليد" }));
    await screen.findByText(/تعذر التأكد من نتيجة التشغيل/);
    expect(run).toHaveBeenCalledTimes(1); expect(run).toHaveBeenCalledWith("job-exact");
  });

  it("distinguishes failed history loading from an empty list and retries", async () => {
    const list = vi.spyOn(api, "listJobs").mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ items: [], nextCursor: null });
    render(<WithQueryClient><JobsHistoryPanel selectedJobId={null} onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    await screen.findByTestId("jobs-load-error");
    expect(screen.queryByTestId("jobs-empty-state")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await screen.findByTestId("jobs-empty-state"); expect(list).toHaveBeenCalledTimes(2);
  });

  it("loads cursor pages without duplicating jobs, preserves the selected detail, and retries a failed page", async () => {
    const first = mockJobStatus({ jobId: "first" });
    const second = mockJobStatus({ jobId: "second", scopeKey: "second-scope" });
    let resolveFirst!: (value: api.EngineJobListResponse) => void;
    const list = vi.spyOn(api, "listJobs")
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockRejectedValueOnce(new Error("page unavailable"))
      .mockResolvedValueOnce({ items: [first, second], nextCursor: "cursor-2" })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    vi.spyOn(api, "getJobStatus").mockResolvedValue(first);
    render(<WithQueryClient><JobsHistoryPanel selectedJobId="first" onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    expect(screen.getByText("جاري تحميل سجل الدفعات...")).toBeInTheDocument();
    await act(async () => resolveFirst({ items: [first], nextCursor: "cursor-1" }));
    await screen.findByTestId("job-row-first");
    fireEvent.click(screen.getByTestId("button-load-more-jobs"));
    await screen.findByTestId("jobs-feedback-banner");
    expect(screen.getByTestId("job-row-first")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-load-more-jobs"));
    await screen.findByTestId("job-row-second");
    expect(screen.getAllByTestId("job-row-first")).toHaveLength(1);
    expect(list).toHaveBeenNthCalledWith(2, { limit: 20, cursor: "cursor-1", status: undefined });
    expect(list).toHaveBeenNthCalledWith(3, { limit: 20, cursor: "cursor-1", status: undefined });
    expect(screen.getByTestId("job-detail-inspector")).toHaveTextContent("overwatch");
    fireEvent.click(screen.getByTestId("button-load-more-jobs"));
    await waitFor(() => expect(screen.queryByTestId("button-load-more-jobs")).not.toBeInTheDocument());
    expect(list).toHaveBeenNthCalledWith(4, { limit: 20, cursor: "cursor-2", status: undefined });
    expect(screen.getByTestId("job-row-first")).toBeInTheDocument();
    expect(screen.getByTestId("job-row-second")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("input-search-jobs"), { target: { value: "second-scope" } });
    expect(screen.queryByTestId("job-row-first")).not.toBeInTheDocument();
    expect(screen.getByTestId("job-row-second")).toBeInTheDocument();
  });

  it("cancels only the chosen eligible job once and reflects the authoritative completed state", async () => {
    const queued = mockJobStatus({ jobId: "queued" });
    const done = mockJobStatus({ jobId: "done", status: "completed" });
    let finish!: (value: boolean) => void;
    const cancel = vi.spyOn(api, "cancelJob").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const run = vi.spyOn(api, "runJob");
    vi.spyOn(api, "listJobs").mockResolvedValue({ items: [queued, done], nextCursor: null });
    vi.spyOn(api, "getJobStatus").mockResolvedValueOnce(queued).mockResolvedValue({ ...queued, status: "completed" });
    render(<WithQueryClient><JobsHistoryPanel selectedJobId="queued" onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    const button = await screen.findByTestId("job-cancel-btn-queued");
    expect(screen.queryByTestId("job-cancel-btn-done")).not.toBeInTheDocument();
    fireEvent.click(button); fireEvent.click(button);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("queued");
    expect(button).toBeDisabled();
    await act(async () => finish(true));
    await waitFor(() => expect(screen.getByTestId("inspector-job-status")).toHaveTextContent("مكتملة"));
    expect(run).not.toHaveBeenCalled();
  });

  it("retains loaded pages after a first-page refresh", async () => {
    const first = mockJobStatus({ jobId: "first" });
    const second = mockJobStatus({ jobId: "second" });
    let refreshed = false;
    const list = vi.spyOn(api, "listJobs").mockImplementation(async (params) => {
      if (params?.cursor) return { items: [second], nextCursor: null };
      const item = refreshed ? { ...first, attempts: 1 } : first;
      refreshed = true;
      return { items: [item], nextCursor: "next" };
    });
    vi.spyOn(api, "getJobStatus").mockResolvedValue(first);
    render(<WithQueryClient><JobsHistoryPanel selectedJobId="first" onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    await screen.findByTestId("job-row-first");
    fireEvent.click(screen.getByTestId("button-load-more-jobs"));
    await screen.findByTestId("job-row-second");
    fireEvent.click(screen.getByTestId("button-refresh-jobs"));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(4));
    expect(screen.getByTestId("job-row-second")).toBeInTheDocument();
  });

  it("does not claim cancellation was recorded when the server returns false", async () => {
    const job = mockJobStatus({ jobId: "racing" });
    vi.spyOn(api, "listJobs").mockResolvedValue({ items: [job], nextCursor: null });
    vi.spyOn(api, "getJobStatus").mockResolvedValueOnce(job).mockResolvedValue({ ...job, status: "completed" });
    vi.spyOn(api, "cancelJob").mockResolvedValue(false);
    render(<WithQueryClient><JobsHistoryPanel selectedJobId="racing" onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    fireEvent.click(await screen.findByTestId("job-cancel-btn-racing"));
    const feedback = await screen.findByTestId("jobs-feedback-banner");
    expect(feedback).not.toHaveTextContent("تم تسجيل طلب إلغاء");
    expect(feedback).toHaveTextContent("لم يعد متاحاً");
  });

  it("rebuilds shifted cursor boundaries and resets pages on filter changes", async () => {
    const a = mockJobStatus({ jobId: "a" });
    const b = mockJobStatus({ jobId: "b" });
    const c = mockJobStatus({ jobId: "c" });
    let refreshed = false;
    const list = vi.spyOn(api, "listJobs").mockImplementation(async (params) => {
      if (params?.status) return { items: [c], nextCursor: null };
      if (params?.cursor === "old") return { items: [b], nextCursor: null };
      if (params?.cursor === "new") return { items: [a], nextCursor: "older" };
      if (params?.cursor === "older") return { items: [b], nextCursor: null };
      return refreshed ? { items: [c], nextCursor: "new" } : { items: [a], nextCursor: "old" };
    });
    vi.spyOn(api, "getJobStatus").mockResolvedValue(a);
    render(<WithQueryClient><JobsHistoryPanel selectedJobId="a" onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    await screen.findByTestId("job-row-a");
    fireEvent.click(screen.getByTestId("button-load-more-jobs"));
    await screen.findByTestId("job-row-b");
    refreshed = true;
    fireEvent.click(screen.getByTestId("button-refresh-jobs"));
    await screen.findByTestId("job-row-c");
    await waitFor(() => expect(list).toHaveBeenCalledWith({ limit: 20, cursor: "new", status: undefined }));
    expect(await screen.findByTestId("job-row-a")).toBeInTheDocument();
    await waitFor(() => expect(list).toHaveBeenCalledWith({ limit: 20, cursor: "older", status: undefined }));
    expect(screen.getByTestId("job-row-b")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("jobs-filter-status"), { target: { value: "completed" } });
    await waitFor(() => expect(list).toHaveBeenCalledWith({ limit: 20, status: "completed" }));
    await waitFor(() => expect(screen.queryByTestId("job-row-b")).not.toBeInTheDocument());
  });

  it("retains the previously loaded window if refreshing a shifted page fails", async () => {
    const a = mockJobStatus({ jobId: "a" });
    const b = mockJobStatus({ jobId: "b" });
    const c = mockJobStatus({ jobId: "c" });
    let refreshed = false;
    vi.spyOn(api, "listJobs").mockImplementation(async (params) => {
      if (params?.cursor === "old") return { items: [b], nextCursor: null };
      if (params?.cursor === "new") throw new Error("refresh page failed");
      return refreshed ? { items: [c], nextCursor: "new" } : { items: [a], nextCursor: "old" };
    });
    vi.spyOn(api, "getJobStatus").mockResolvedValue(a);
    render(<WithQueryClient><JobsHistoryPanel selectedJobId="a" onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    await screen.findByTestId("job-row-a");
    fireEvent.click(screen.getByTestId("button-load-more-jobs"));
    await screen.findByTestId("job-row-b");
    refreshed = true;
    fireEvent.click(screen.getByTestId("button-refresh-jobs"));
    await screen.findByTestId("jobs-feedback-banner");
    expect(screen.getByTestId("job-row-a")).toBeInTheDocument();
    expect(screen.getByTestId("job-row-b")).toBeInTheDocument();
    expect(screen.getByTestId("job-row-c")).toBeInTheDocument();
  });

  it("reports cancellation failures and permits a safe retry", async () => {
    const job = mockJobStatus({ jobId: "cancel-error" });
    vi.spyOn(api, "listJobs").mockResolvedValue({ items: [job], nextCursor: null });
    vi.spyOn(api, "getJobStatus").mockResolvedValue(job);
    const cancel = vi.spyOn(api, "cancelJob").mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(true);
    const run = vi.spyOn(api, "runJob");
    render(<WithQueryClient><JobsHistoryPanel selectedJobId={job.jobId} onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    const button = await screen.findByTestId("job-cancel-btn-cancel-error");
    fireEvent.click(button);
    expect(await screen.findByTestId("jobs-feedback-banner")).toHaveTextContent("offline");
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("jobs-feedback-banner")).toHaveTextContent("تم تسجيل طلب إلغاء"));
    expect(run).not.toHaveBeenCalled();
  });

  it("refreshes loaded cursor pages when an active job is polled", async () => {
    const active = mockJobStatus({ jobId: "active", status: "leased" });
    const older = mockJobStatus({ jobId: "older" });
    let olderReads = 0;
    const list = vi.spyOn(api, "listJobs").mockImplementation(async (params) => {
      if (params?.cursor) {
        olderReads += 1;
        return { items: [{ ...older, attempts: olderReads }], nextCursor: null };
      }
      return { items: [active], nextCursor: "next" };
    });
    vi.spyOn(api, "getJobStatus").mockResolvedValue(active);
    render(<WithQueryClient><JobsHistoryPanel selectedJobId="active" onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    await screen.findByTestId("job-row-active");
    fireEvent.click(screen.getByTestId("button-load-more-jobs"));
    await screen.findByTestId("job-row-older");
    await waitFor(() => expect(olderReads).toBeGreaterThanOrEqual(2), { timeout: 5000 });
    expect(list.mock.calls.filter(([params]) => !params?.cursor).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("job-row-older")).toHaveTextContent("محاولات: 2");
  });

  it("finishes a four-second page rebuild while the first page polls every 2.5 seconds", async () => {
    const active = mockJobStatus({ jobId: "active-slow-page", status: "leased" });
    const older = mockJobStatus({ jobId: "older-slow-page", status: "completed" });
    let pageReads = 0;
    vi.spyOn(api, "listJobs").mockImplementation(async (params) => {
      if (!params?.cursor) return { items: [active], nextCursor: "first-cursor" };
      pageReads += 1;
      if (pageReads > 1) await new Promise((resolve) => setTimeout(resolve, 4000));
      return { items: [older], nextCursor: "next-cursor" };
    });
    vi.spyOn(api, "getJobStatus").mockResolvedValue(active);
    render(<WithQueryClient><JobsHistoryPanel selectedJobId={active.jobId} onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    await screen.findByTestId("job-row-active-slow-page");
    fireEvent.click(screen.getByTestId("button-load-more-jobs"));
    await screen.findByTestId("job-row-older-slow-page");
    await waitFor(() => expect(pageReads).toBe(2), { timeout: 5000 });
    await waitFor(() => expect(screen.getByTestId("button-load-more-jobs")).toBeEnabled(), { timeout: 5500 });
    expect(screen.getByTestId("job-row-older-slow-page")).toBeInTheDocument();
    expect(pageReads).toBe(2);
  }, 12000);

  it("ignores a pending rebuild when the status filter changes", async () => {
    const active = mockJobStatus({ jobId: "before-filter", status: "leased" });
    const old = mockJobStatus({ jobId: "old-page", status: "completed" });
    const filtered = mockJobStatus({ jobId: "filtered", status: "completed" });
    let resolveRebuild!: (value: api.EngineJobListResponse) => void;
    let pageReads = 0;
    vi.spyOn(api, "listJobs").mockImplementation(async (params) => {
      if (params?.status) return { items: [filtered], nextCursor: null };
      if (!params?.cursor) return { items: [active], nextCursor: "cursor" };
      pageReads += 1;
      return pageReads === 1 ? { items: [old], nextCursor: null } : new Promise((resolve) => { resolveRebuild = resolve; });
    });
    vi.spyOn(api, "getJobStatus").mockResolvedValue(active);
    render(<WithQueryClient><JobsHistoryPanel selectedJobId={active.jobId} onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    await screen.findByTestId("job-row-before-filter");
    fireEvent.click(screen.getByTestId("button-load-more-jobs"));
    await screen.findByTestId("job-row-old-page");
    fireEvent.click(screen.getByTestId("button-refresh-jobs"));
    await waitFor(() => expect(resolveRebuild).toBeTypeOf("function"));
    fireEvent.change(screen.getByTestId("jobs-filter-status"), { target: { value: "completed" } });
    await screen.findByTestId("job-row-filtered");
    await act(async () => resolveRebuild({ items: [old], nextCursor: null }));
    expect(screen.queryByTestId("job-row-old-page")).not.toBeInTheDocument();
  });

  it("reconciles a changed first-page cursor after an older rebuild settles", async () => {
    const a = mockJobStatus({ jobId: "a" });
    const b = mockJobStatus({ jobId: "b" });
    const c = mockJobStatus({ jobId: "c" });
    const stale = mockJobStatus({ jobId: "stale" });
    let firstReads = 0;
    let oldPageReads = 0;
    let resolveOld!: (value: api.EngineJobListResponse) => void;
    const list = vi.spyOn(api, "listJobs").mockImplementation(async (params) => {
      if (params?.cursor === "old") {
        oldPageReads += 1;
        return oldPageReads === 1 ? { items: [b], nextCursor: null } : new Promise((resolve) => { resolveOld = resolve; });
      }
      if (params?.cursor === "new") return { items: [a, b], nextCursor: null };
      firstReads += 1;
      return firstReads < 3 ? { items: [a], nextCursor: "old" } : { items: [c], nextCursor: "new" };
    });
    vi.spyOn(api, "getJobStatus").mockResolvedValue(a);
    render(<WithQueryClient><JobsHistoryPanel selectedJobId="a" onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    await screen.findByTestId("job-row-a");
    fireEvent.click(screen.getByTestId("button-load-more-jobs"));
    await screen.findByTestId("job-row-b");
    fireEvent.click(screen.getByTestId("button-refresh-jobs"));
    await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
    fireEvent.click(screen.getByTestId("button-refresh-jobs"));
    await screen.findByTestId("job-row-c");
    await act(async () => resolveOld({ items: [stale], nextCursor: null }));
    await waitFor(() => expect(list).toHaveBeenCalledWith({ limit: 20, cursor: "new", status: undefined }));
    await screen.findByTestId("job-row-b");
    expect(screen.queryByTestId("job-row-stale")).not.toBeInTheDocument();
  });

  it.each([0.8, null, undefined])("renders temperature truthfully: %s", async (temperature) => {
    const job = mockJobStatus({ generationSpec: { ...mockPreflightResponse().generationSpec!, temperature: temperature as number | null } });
    vi.spyOn(api, "listJobs").mockResolvedValue({ items: [job], nextCursor: null });
    vi.spyOn(api, "getJobStatus").mockResolvedValue(job);
    render(<WithQueryClient><JobsHistoryPanel selectedJobId={job.jobId} onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    const spec = await screen.findByTestId("inspector-generation-spec");
    expect(spec).toHaveTextContent(temperature == null ? "لم تُحدد قيمة Temperature" : "temp=0.8");
  });

  it("reports a missing job separately from an empty history", async () => {
    vi.spyOn(api, "listJobs").mockResolvedValue({ items: [], nextCursor: null });
    vi.spyOn(api, "getJobStatus").mockRejectedValue({ response: { status: 404, data: { message: "not found" } } });
    render(<WithQueryClient><JobsHistoryPanel selectedJobId="missing" onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    expect(await screen.findByTestId("job-detail-load-error")).toHaveTextContent("لم يُعثر على الدفعة");
  });

  it("reconciles a completed list status and blocks actions until the latest detail arrives", async () => {
    const running = mockJobStatus({ jobId: "race", status: "leased" });
    const completed = { ...running, status: "completed" as const };
    let finish!: (value: api.EngineJobStatus) => void;
    let listCalls = 0;
    vi.spyOn(api, "listJobs").mockImplementation(async () => ({ items: [++listCalls === 1 ? running : completed], nextCursor: null }));
    const detail = vi.spyOn(api, "getJobStatus").mockResolvedValue(running);
    render(<WithQueryClient><JobsHistoryPanel selectedJobId="race" onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    await screen.findByTestId("job-detail-inspector");
    await waitFor(() => expect(screen.getByTestId("inspector-job-status")).toHaveTextContent("قيد التشغيل"));
    detail.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByTestId("button-refresh-jobs"));
    await waitFor(() => expect(screen.getByTestId("job-status-race")).toHaveTextContent("مكتملة"));
    expect(screen.queryByTestId("inspector-cancel-job-btn")).not.toBeInTheDocument();
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    await act(async () => finish(completed));
    await waitFor(() => expect(screen.getByTestId("inspector-job-status")).toHaveTextContent("مكتملة"));
    expect(screen.queryByTestId("inspector-run-job-btn")).not.toBeInTheDocument();
  });

  it("provides separate semantic selection and action controls", async () => {
    const first = mockJobStatus({ jobId: "one" });
    const second = mockJobStatus({ jobId: "two" });
    vi.spyOn(api, "listJobs").mockResolvedValue({ items: [first, second], nextCursor: null });
    vi.spyOn(api, "getJobStatus").mockResolvedValue(first);
    const select = vi.fn();
    const run = vi.spyOn(api, "runJob");
    const cancel = vi.spyOn(api, "cancelJob");
    render(<WithQueryClient><JobsHistoryPanel selectedJobId="one" onSelectJobId={select} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    const button = await screen.findByTestId("job-select-two");
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAccessibleName(/two/);
    expect(button).toHaveAttribute("aria-pressed", "false");
    button.focus(); expect(button).toHaveFocus(); fireEvent.click(button);
    expect(select).toHaveBeenCalledWith("two");
    expect(run).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
  });

  it("does not apply a late detail response to a newly selected job", async () => {
    const first = mockJobStatus({ jobId: "slow", scopeKey: "slow-scope" });
    const second = mockJobStatus({ jobId: "current", scopeKey: "current-scope" });
    let resolveSlow!: (value: api.EngineJobStatus) => void;
    vi.spyOn(api, "listJobs").mockResolvedValue({ items: [first, second], nextCursor: null });
    vi.spyOn(api, "getJobStatus").mockImplementation((id) => id === "slow" ? new Promise((resolve) => { resolveSlow = resolve; }) : Promise.resolve(second));
    const client = makeQueryClient();
    const view = render(<QueryClientProvider client={client}><JobsHistoryPanel selectedJobId="slow" onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></QueryClientProvider>);
    await waitFor(() => expect(resolveSlow).toBeTypeOf("function"));
    view.rerender(<QueryClientProvider client={client}><JobsHistoryPanel selectedJobId="current" onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("job-detail-inspector")).toHaveTextContent("current-scope"));
    await act(async () => resolveSlow(first));
    expect(screen.getByTestId("job-detail-inspector")).toHaveTextContent("current-scope");
  });

  it("ignores an older in-flight detail after list refresh starts reconciliation", async () => {
    const running = mockJobStatus({ jobId: "slow-refresh", status: "leased" });
    const completed = { ...running, status: "completed" as const };
    let resolveOld!: (value: api.EngineJobStatus) => void;
    let reads = 0;
    vi.spyOn(api, "listJobs").mockImplementation(async () => ({ items: [++reads === 1 ? running : completed], nextCursor: null }));
    const detail = vi.spyOn(api, "getJobStatus").mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue(completed);
    render(<WithQueryClient><JobsHistoryPanel selectedJobId={running.jobId} onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
    fireEvent.click(screen.getByTestId("button-refresh-jobs"));
    await waitFor(() => expect(screen.getByTestId("inspector-job-status")).toHaveTextContent("مكتملة"));
    await act(async () => resolveOld(running));
    await waitFor(() => expect(screen.getByTestId("inspector-job-status")).toHaveTextContent("مكتملة"));
    await waitFor(() => expect(detail).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("inspector-cancel-job-btn")).not.toBeInTheDocument();
  });

  it("does not restart a slow initial detail request on unchanged list refreshes", async () => {
    const running = mockJobStatus({ jobId: "slow-poll", status: "leased" });
    let resolveDetail!: (value: api.EngineJobStatus) => void;
    const detail = vi.spyOn(api, "getJobStatus").mockImplementation(() => new Promise((resolve) => { resolveDetail = resolve; }));
    let reads = 0;
    const list = vi.spyOn(api, "listJobs").mockImplementation(async () => ({ items: [{ ...running, attempts: ++reads }], nextCursor: null }));
    render(<WithQueryClient><JobsHistoryPanel selectedJobId={running.jobId} onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></WithQueryClient>);
    await waitFor(() => expect(resolveDetail).toBeTypeOf("function"));
    expect(screen.queryByTestId("inspector-cancel-job-btn")).not.toBeInTheDocument();
    for (let i = 2; i <= 4; i++) {
      fireEvent.click(screen.getByTestId("button-refresh-jobs"));
      await waitFor(() => expect(list).toHaveBeenCalledTimes(i));
    }
    expect(detail).toHaveBeenCalledTimes(1);
    await act(async () => resolveDetail(running));
    await waitFor(() => expect(screen.getByTestId("inspector-cancel-job-btn")).toBeInTheDocument());
    expect(detail).toHaveBeenCalledTimes(1);
  });

  it("keeps actions available during a matching background detail refresh", async () => {
    const running = mockJobStatus({ jobId: "background", status: "leased" });
    let finish!: (value: api.EngineJobStatus) => void;
    const detail = vi.spyOn(api, "getJobStatus").mockResolvedValueOnce(running).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    vi.spyOn(api, "listJobs").mockResolvedValue({ items: [running], nextCursor: null });
    const client = makeQueryClient();
    render(<QueryClientProvider client={client}><JobsHistoryPanel selectedJobId={running.jobId} onSelectJobId={vi.fn()} onHandoffToReview={vi.fn()} /></QueryClientProvider>);
    await screen.findByTestId("inspector-cancel-job-btn");
    act(() => { void client.invalidateQueries({ queryKey: ["content-engine-job-detail", running.jobId] }); });
    await waitFor(() => expect(detail).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("inspector-cancel-job-btn")).toBeEnabled();
    await act(async () => finish(running));
  });

  it("does not report Generate cancellation success when the server declines it", async () => {
    const job = mockJobStatus({ jobId: "cancel-generate" });
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(mockAuthoringOptions());
    vi.spyOn(api, "preflightJob").mockResolvedValue(mockPreflightResponse());
    vi.spyOn(api, "getJobStatus").mockResolvedValue(job);
    const cancel = vi.spyOn(api, "cancelJob").mockResolvedValue(false);
    const run = vi.spyOn(api, "runJob");
    render(<WithQueryClient><BatchSubmissionPanel initialJobId={job.jobId} /></WithQueryClient>);
    const button = await screen.findByTestId("button-cancel-job");
    fireEvent.click(button); fireEvent.click(button);
    await screen.findByText(/تعذر تسجيل طلب الإلغاء/);
    expect(cancel).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledWith(job.jobId);
    expect(run).not.toHaveBeenCalled();
  });

  it("keeps a newly unavailable mechanic selected and blocks generation", async () => {
    const options = mockAuthoringOptions();
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(options);
    vi.spyOn(api, "preflightJob").mockResolvedValue(mockPreflightResponse());
    const client = makeQueryClient();
    render(<QueryClientProvider client={client}><BatchSubmissionPanel /></QueryClientProvider>);
    const mechanic = await screen.findByTestId("select-mechanic") as HTMLSelectElement;
    await waitFor(() => expect(mechanic.value).toBe("read-your-opponent"));
    await waitFor(() => expect(screen.getByTestId("button-submit-job")).toBeEnabled());
    const updated = structuredClone(options);
    updated.worlds[0].scopes[0].mechanics[0].eligible = false;
    updated.worlds[0].scopes[0].mechanics[0].blockedReason = "الآلية غير متاحة";
    act(() => client.setQueryData(["content-engine-options"], updated));
    expect(mechanic.value).toBe("read-your-opponent");
    expect(await screen.findByTestId("selection-blocked-diagnostic")).toHaveTextContent("الآلية غير متاحة");
    expect(screen.getByTestId("button-submit-job")).toBeDisabled();
  });

  it("does not execute an existing already-running job", async () => {
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(mockAuthoringOptions());
    vi.spyOn(api, "preflightJob").mockResolvedValue(mockPreflightResponse());
    vi.spyOn(api, "submitJob").mockResolvedValue({ jobId: "existing", created: false, contextHash: "c" });
    vi.spyOn(api, "getJobStatus").mockResolvedValue(mockJobStatus({ jobId: "existing", status: "leased" }));
    const run = vi.spyOn(api, "runJob");
    render(<WithQueryClient><BatchSubmissionPanel /></WithQueryClient>);
    const button = await screen.findByTestId("button-submit-job");
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button); fireEvent.click(screen.getByRole("button", { name: "تأكيد التوليد" }));
    await screen.findByText(/تم العثور على دفعة مطابقة موجودة/);
    expect(run).not.toHaveBeenCalled();
  });

  it("blocks a server-declared over-budget preflight", async () => {
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(mockAuthoringOptions());
    vi.spyOn(api, "preflightJob").mockResolvedValue(mockPreflightResponse({ submissionReady: false, withinMonthlyBudget: false, blockedReason: "الميزانية غير كافية" }));
    render(<WithQueryClient><BatchSubmissionPanel /></WithQueryClient>);
    await screen.findByTestId("preflight-blocking-diagnostic");
    expect(screen.getByTestId("button-submit-job")).toBeDisabled();
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

  describe("C-7 regression: cross-batch review integrity and zero-candidate handoff guards", () => {
    it("disables handoff controls for zero-candidate jobs in JobsHistoryPanel and BatchSubmissionPanel", async () => {
      const emptyJob = mockJobStatus({
        jobId: "job-empty-001",
        status: "completed",
        pipelineStage: "completed",
        candidates: { awaiting_review: 0, approved: 0, screened_reject: 0 },
      });
      const populatedJob = mockJobStatus({
        jobId: "job-populated-002",
        status: "awaiting_review",
        pipelineStage: "awaiting_review",
        candidates: { awaiting_review: 2 },
      });

      vi.spyOn(api, "listJobs").mockResolvedValue({
        items: [emptyJob, populatedJob],
        nextCursor: null,
      });
      vi.spyOn(api, "getJobStatus").mockResolvedValue(emptyJob);
      vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(
        mockAuthoringOptions(),
      );
      vi.spyOn(api, "preflightJob").mockResolvedValue(mockPreflightResponse());

      const onHandoff = vi.fn();
      const onBatchReady = vi.fn();

      const { unmount } = render(
        <WithQueryClient>
          <JobsHistoryPanel
            selectedJobId={emptyJob.jobId}
            onSelectJobId={vi.fn()}
            onHandoffToReview={onHandoff}
          />
        </WithQueryClient>,
      );

      const emptyRowBtn = await screen.findByTestId(
        `job-handoff-btn-${emptyJob.jobId}`,
      );
      const populatedRowBtn = await screen.findByTestId(
        `job-handoff-btn-${populatedJob.jobId}`,
      );
      const inspectorBtn = await screen.findByTestId(
        "inspector-handoff-review-btn",
      );

      expect(emptyRowBtn).toBeDisabled();
      expect(inspectorBtn).toBeDisabled();
      expect(populatedRowBtn).toBeEnabled();

      fireEvent.click(emptyRowBtn);
      fireEvent.click(inspectorBtn);
      expect(onHandoff).not.toHaveBeenCalled();

      unmount();

      render(
        <WithQueryClient>
          <BatchSubmissionPanel
            initialJobId={emptyJob.jobId}
            onBatchReady={onBatchReady}
          />
        </WithQueryClient>,
      );

      const batchHandoffBtn = await screen.findByTestId(
        "button-handoff-candidates",
      );
      expect(batchHandoffBtn).toBeDisabled();
      fireEvent.click(batchHandoffBtn);
      expect(onBatchReady).not.toHaveBeenCalled();
    });

    it("clears stale candidate selection and URL parameter when switching from Job A to Job B", async () => {
      const jobA = mockJobStatus({
        jobId: "job-A",
        worldKey: "puzzles",
        scopeKey: "wordplay-letters",
        mechanicKey: "read-your-opponent",
        status: "awaiting_review",
        pipelineStage: "awaiting_review",
        candidates: { awaiting_review: 1 },
      });
      const jobB = mockJobStatus({
        jobId: "job-B",
        worldKey: "video-games",
        scopeKey: "overwatch",
        mechanicKey: "read-your-opponent",
        status: "awaiting_review",
        pipelineStage: "awaiting_review",
        candidates: { awaiting_review: 1 },
      });

      const candA: ReviewCandidate = {
        id: "id-cand-A",
        candidateId: "cand-A",
        jobId: "job-A",
        status: "awaiting_review",
        reviewStatus: "pending",
        reviewRevision: 1,
        draft: {
          prompt: { ar: "سؤال الدفعة الأولى أ" },
          answerPayload: {
            mode: "multiple_choice",
            options: [
              { id: "a", label: { ar: "خيار 1" } },
              { id: "b", label: { ar: "خيار 2" } },
            ],
            correctOptionId: "a",
          },
        },
        authoring: { concept: "مفهوم أ" },
        factualClaims: [],
        publishedContentItemId: null,
        findings: [],
        factVerification: { state: "SUPPORTED" },
        qualityEvaluation: null,
        compatibilityEvaluation: null,
        humanAssessment: null,
        reviewDecision: null,
        reviewEvents: [],
        canonicalTarget: {
          worldId: "w-pz",
          worldKey: "puzzles",
          scopeId: "s-wl",
          scopeKey: "wordplay-letters",
          challengeTypeId: "ct-ryo",
          mechanicKey: "read-your-opponent",
        },
        job: {
          id: "job-A",
          mechanicKey: "read-your-opponent",
          worldKey: "puzzles",
          scopeKey: "wordplay-letters",
          status: "awaiting_review",
          specVersion: "1",
        },
      };

      const candB: ReviewCandidate = {
        ...candA,
        id: "id-cand-B",
        candidateId: "cand-B",
        jobId: "job-B",
        draft: {
          ...candA.draft,
          prompt: { ar: "سؤال الدفعة الثانية ب" },
        },
        job: {
          id: "job-B",
          mechanicKey: "read-your-opponent",
          worldKey: "video-games",
          scopeKey: "overwatch",
          status: "awaiting_review",
          specVersion: "1",
        },
      };

      vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(
        mockAuthoringOptions(),
      );
      vi.spyOn(api, "listJobs").mockResolvedValue({
        items: [jobA, jobB],
        nextCursor: null,
      });
      vi.spyOn(api, "getJobStatus").mockImplementation(async (id) =>
        id === "job-B" ? jobB : jobA,
      );
      vi.spyOn(api, "getSpending").mockResolvedValue({
        jobId: "job-A",
        spentMicros: 0,
        spentSar: 0,
        reservedMicros: 0,
        reservedSar: 0,
        stages: [],
      });
      vi.spyOn(api, "listCandidates").mockImplementation(async (params) => {
        if (params?.jobId === "job-A") return [candA];
        if (params?.jobId === "job-B") return [candB];
        return [candA, candB];
      });
      vi.spyOn(api, "getCandidate").mockImplementation(async (id) =>
        id === "cand-B" ? candB : candA,
      );

      render(
        <WithQueryClient>
          <ContentEngineReviewWorkspace />
        </WithQueryClient>,
      );

      // Handoff Job A from Jobs surface
      fireEvent.click(await screen.findByTestId("surface-tab-jobs"));
      fireEvent.click(await screen.findByTestId("job-handoff-btn-job-A"));

      // Select Candidate A in Job A
      fireEvent.click(await screen.findByTestId("candidate-row-cand-A"));
      expect(await screen.findByTestId("decision-bar")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 2, name: "سؤال الدفعة الأولى أ" }),
      ).toBeInTheDocument();
      expect(new URLSearchParams(window.location.search).get("candidate")).toBe(
        "cand-A",
      );

      // Switch to Jobs surface and handoff Job B
      fireEvent.click(screen.getByTestId("surface-tab-jobs"));
      fireEvent.click(await screen.findByTestId("job-handoff-btn-job-B"));

      // Verify Candidate B is in the queue, Candidate A is NOT selected or displayed, and ?candidate= is cleared
      await screen.findByTestId("candidate-row-cand-B");
      expect(screen.getByTestId("candidate-detail-empty")).toBeInTheDocument();
      expect(screen.queryByTestId("decision-bar")).toBeNull();
      expect(
        screen.queryByRole("heading", {
          level: 2,
          name: "سؤال الدفعة الأولى أ",
        }),
      ).toBeNull();
      expect(new URLSearchParams(window.location.search).get("jobId")).toBe(
        "job-B",
      );
      expect(
        new URLSearchParams(window.location.search).get("candidate"),
      ).toBeNull();
    });

    it("never displays or mutates a candidate from Job A on direct URL navigation or late detail response under Job B filter", async () => {
      let resolveLateCandA!: (value: ReviewCandidate) => void;
      const candA: ReviewCandidate = {
        id: "id-cand-A",
        candidateId: "cand-A",
        jobId: "job-A",
        status: "awaiting_review",
        reviewStatus: "pending",
        reviewRevision: 1,
        draft: {
          prompt: { ar: "سؤال متأخر من دفعة أ" },
          answerPayload: {
            mode: "multiple_choice",
            options: [
              { id: "a", label: { ar: "1" } },
              { id: "b", label: { ar: "2" } },
            ],
            correctOptionId: "a",
          },
        },
        authoring: { concept: "مفهوم" },
        factualClaims: [],
        publishedContentItemId: null,
        findings: [],
        factVerification: { state: "SUPPORTED" },
        qualityEvaluation: null,
        compatibilityEvaluation: null,
        humanAssessment: null,
        reviewDecision: null,
        reviewEvents: [],
        job: null,
      };

      window.history.replaceState(
        null,
        "",
        "/admin/content-engine?surface=review&jobId=job-B&candidate=cand-A",
      );

      vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(
        mockAuthoringOptions(),
      );
      vi.spyOn(api, "listCandidates").mockResolvedValue([]);
      vi.spyOn(api, "getSpending").mockResolvedValue({
        jobId: "job-A",
        spentMicros: 0,
        spentSar: 0,
        reservedMicros: 0,
        reservedSar: 0,
        stages: [],
      });
      vi.spyOn(api, "getCandidate").mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLateCandA = resolve;
          }),
      );
      const approveSpy = vi.spyOn(api, "approveCandidate");
      const rejectSpy = vi.spyOn(api, "rejectCandidate");

      render(
        <WithQueryClient>
          <ContentEngineReviewWorkspace />
        </WithQueryClient>,
      );

      await waitFor(() => expect(resolveLateCandA).toBeTypeOf("function"));
      expect(screen.queryByTestId("decision-bar")).toBeNull();

      // Late detail response arrives for cand-A (which belongs to job-A, while active filter is job-B)
      await act(async () => {
        resolveLateCandA(candA);
      });

      await waitFor(() => {
        expect(screen.getByTestId("candidate-detail-empty")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("decision-bar")).toBeNull();
      expect(
        screen.queryByRole("heading", {
          level: 2,
          name: "سؤال متأخر من دفعة أ",
        }),
      ).toBeNull();
      expect(new URLSearchParams(window.location.search).get("jobId")).toBe(
        "job-B",
      );
      expect(
        new URLSearchParams(window.location.search).get("candidate"),
      ).toBeNull();
      expect(approveSpy).not.toHaveBeenCalled();
      expect(rejectSpy).not.toHaveBeenCalled();
    });
  });
});

describe("Review Studio — independent batch identity (batchIntentId)", () => {
  const INTENT_FORMAT = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/admin/content-engine");
    vi.restoreAllMocks();
    vi.spyOn(api, "getAuthoringOptions").mockResolvedValue(
      mockAuthoringOptions(),
    );
    vi.spyOn(api, "getJobStatus").mockImplementation(async (jobId) =>
      mockJobStatus({
        jobId,
        status: "awaiting_review",
        pipelineStage: "awaiting_review",
      }),
    );
    vi.spyOn(api, "runJob").mockImplementation(async (jobId) => ({
      jobId,
      alreadyRunning: false,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const intentsOf = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map(
      (call) => (call[0] as { batchIntentId?: string }).batchIntentId,
    );

  const generate = async () => {
    const button = screen.getByTestId("button-submit-job");
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "تأكيد التوليد" }));
  };

  it("sends one intent to Preflight and Submit, then mints a new intent for the next Generate of identical parameters", async () => {
    const preflight = vi
      .spyOn(api, "preflightJob")
      .mockResolvedValue(mockPreflightResponse());
    const submit = vi
      .spyOn(api, "submitJob")
      .mockResolvedValueOnce({
        jobId: "job-1",
        created: true,
        contextHash: "c",
      })
      .mockResolvedValueOnce({
        jobId: "job-2",
        created: true,
        contextHash: "c",
      });
    render(
      <WithQueryClient>
        <BatchSubmissionPanel />
      </WithQueryClient>,
    );
    await screen.findByTestId("button-submit-job");

    await generate();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const first = submit.mock.calls[0][0];
    expect(first.batchIntentId).toMatch(INTENT_FORMAT);
    // Submit used the intent its Preflight was priced with.
    expect(intentsOf(preflight)).toContain(first.batchIntentId);

    // Once the job is recorded, the panel re-preflights under a fresh intent.
    await waitFor(() =>
      expect(
        intentsOf(preflight).some(
          (intent) => intent && intent !== first.batchIntentId,
        ),
      ).toBe(true),
    );

    await generate();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    const second = submit.mock.calls[1][0];
    expect(second.batchIntentId).toMatch(INTENT_FORMAT);
    expect(second.batchIntentId).not.toBe(first.batchIntentId);
    expect(intentsOf(preflight)).toContain(second.batchIntentId);
    // Everything but the intent is the same request: an independent batch.
    const { batchIntentId: _a, ...firstRest } = first;
    const { batchIntentId: _b, ...secondRest } = second;
    expect(secondRest).toEqual(firstRest);
  });

  it("keeps the intent after an unknown Submit outcome, so the retry is the same batch", async () => {
    vi.spyOn(api, "preflightJob").mockResolvedValue(mockPreflightResponse());
    const submit = vi
      .spyOn(api, "submitJob")
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({
        jobId: "job-1",
        created: false,
        contextHash: "c",
      });
    render(
      <WithQueryClient>
        <BatchSubmissionPanel />
      </WithQueryClient>,
    );
    await screen.findByTestId("button-submit-job");

    await generate();
    await screen.findByText(/تعذر التأكد من تسجيل الدفعة/);
    await generate();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[1][0].batchIntentId).toBe(
      submit.mock.calls[0][0].batchIntentId,
    );
  });

  it("keeps the intent through a 409 PREFLIGHT_PLAN_DRIFT re-preflight", async () => {
    const preflight = vi
      .spyOn(api, "preflightJob")
      .mockResolvedValue(mockPreflightResponse());
    const submit = vi
      .spyOn(api, "submitJob")
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { code: "PREFLIGHT_PLAN_DRIFT", message: "drift" },
        },
      })
      .mockResolvedValueOnce({
        jobId: "job-1",
        created: true,
        contextHash: "c",
      });
    render(
      <WithQueryClient>
        <BatchSubmissionPanel />
      </WithQueryClient>,
    );
    await screen.findByTestId("button-submit-job");

    await generate();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const intent = submit.mock.calls[0][0].batchIntentId;
    await waitFor(() => expect(preflight.mock.calls.length).toBeGreaterThan(1));
    expect(new Set(intentsOf(preflight))).toEqual(new Set([intent]));

    await generate();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[1][0].batchIntentId).toBe(intent);
  });

  it("keeps the same intent while the batch parameters are edited before Generate", async () => {
    const preflight = vi
      .spyOn(api, "preflightJob")
      .mockResolvedValue(mockPreflightResponse());
    render(
      <WithQueryClient>
        <BatchSubmissionPanel />
      </WithQueryClient>,
    );
    await waitFor(() => expect(preflight).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId("input-target-count"), {
      target: { value: "4" },
    });
    await waitFor(() => expect(preflight).toHaveBeenCalledTimes(2));
    const [before, after] = intentsOf(preflight);
    expect(before).toMatch(INTENT_FORMAT);
    expect(after).toBe(before);
  });

  describe("same-tab reload and retry (sessionStorage)", () => {
    const stored = () =>
      JSON.parse(
        window.sessionStorage.getItem(BATCH_INTENT_STORAGE_KEY) ?? "null",
      ) as {
        version: number;
        intentId: string;
        pendingRequest: Record<string, unknown> | null;
      } | null;

    const renderPanel = () =>
      render(
        <WithQueryClient>
          <BatchSubmissionPanel />
        </WithQueryClient>,
      );

    const settleDebounce = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      });

    it("reuses the persisted intent for Preflight after a reload", async () => {
      const preflight = vi
        .spyOn(api, "preflightJob")
        .mockResolvedValue(mockPreflightResponse());
      const first = renderPanel();
      await waitFor(() => expect(preflight).toHaveBeenCalledTimes(1));
      const [intent] = intentsOf(preflight);
      expect(stored()).toEqual({
        version: 1,
        intentId: intent,
        pendingRequest: null,
      });

      first.unmount();
      renderPanel();
      await waitFor(() => expect(preflight).toHaveBeenCalledTimes(2));
      expect(intentsOf(preflight)[1]).toBe(intent);
    });

    it("after an unknown Submit outcome, a reload restores the request and the retry reuses the intent", async () => {
      const preflight = vi
        .spyOn(api, "preflightJob")
        .mockResolvedValue(mockPreflightResponse());
      const submit = vi
        .spyOn(api, "submitJob")
        .mockRejectedValueOnce(new Error("network timeout"))
        .mockResolvedValueOnce({
          jobId: "job-1",
          created: false,
          contextHash: "c",
        });
      const first = renderPanel();
      await screen.findByTestId("button-submit-job");
      fireEvent.change(screen.getByTestId("input-target-count"), {
        target: { value: "4" },
      });
      fireEvent.change(screen.getByTestId("textarea-batch-guidance"), {
        target: { value: "دفعة تجريبية" },
      });

      await generate();
      await screen.findByText(/تعذر التأكد من تسجيل الدفعة/);
      const intent = submit.mock.calls[0][0].batchIntentId;
      // Never minted after an unknown outcome: still held for that request.
      expect(stored()).toMatchObject({
        intentId: intent,
        pendingRequest: { targetCount: 4, batchGuidance: "دفعة تجريبية" },
      });

      first.unmount();
      preflight.mockClear();
      renderPanel();
      await waitFor(() =>
        expect(preflight).toHaveBeenCalledWith(
          expect.objectContaining({
            targetCount: 4,
            batchGuidance: "دفعة تجريبية",
            batchIntentId: intent,
          }),
        ),
      );
      expect(screen.getByTestId("input-target-count")).toHaveValue(4);
      expect(screen.getByTestId("pending-batch-intent-notice")).toHaveAttribute(
        "data-mismatch",
        "false",
      );

      await generate();
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
      expect(submit.mock.calls[1][0]).toMatchObject({
        targetCount: 4,
        batchGuidance: "دفعة تجريبية",
        batchIntentId: intent,
        planDigest: "d".repeat(64),
      });
      // Confirmed (the server found the job): only now is a new intent minted.
      await waitFor(() => expect(stored()?.intentId).not.toBe(intent));
      expect(stored()?.pendingRequest).toBeNull();
      expect(screen.queryByTestId("pending-batch-intent-notice")).toBeNull();
    });

    it("a reload while Submit is still in flight keeps the intent bound for the retry", async () => {
      vi.spyOn(api, "preflightJob").mockResolvedValue(mockPreflightResponse());
      const submit = vi
        .spyOn(api, "submitJob")
        .mockImplementationOnce(() => new Promise(() => undefined))
        .mockResolvedValueOnce({
          jobId: "job-1",
          created: false,
          contextHash: "c",
        });
      const first = renderPanel();
      await screen.findByTestId("button-submit-job");
      await generate();
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
      const intent = submit.mock.calls[0][0].batchIntentId;
      expect(stored()).toMatchObject({
        intentId: intent,
        pendingRequest: { targetCount: 5 },
      });

      first.unmount();
      renderPanel();
      await generate();
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
      expect(submit.mock.calls[1][0].batchIntentId).toBe(intent);
    });

    it("never reuses a pending intent for a different form: blocks until Restore or an explicit New Batch", async () => {
      const preflight = vi
        .spyOn(api, "preflightJob")
        .mockResolvedValue(mockPreflightResponse());
      const submit = vi
        .spyOn(api, "submitJob")
        .mockRejectedValueOnce(new Error("network timeout"));
      renderPanel();
      await screen.findByTestId("button-submit-job");
      await generate();
      await screen.findByText(/تعذر التأكد من تسجيل الدفعة/);
      const intent = submit.mock.calls[0][0].batchIntentId;

      preflight.mockClear();
      fireEvent.change(screen.getByTestId("input-target-count"), {
        target: { value: "6" },
      });
      await settleDebounce();
      expect(screen.getByTestId("pending-batch-intent-notice")).toHaveAttribute(
        "data-mismatch",
        "true",
      );
      expect(preflight).not.toHaveBeenCalled();
      expect(screen.getByTestId("button-submit-job")).toBeDisabled();
      expect(stored()?.intentId).toBe(intent);

      // Restore puts the unconfirmed request back, with its intent.
      fireEvent.click(screen.getByTestId("button-restore-pending-batch"));
      await waitFor(() =>
        expect(preflight).toHaveBeenCalledWith(
          expect.objectContaining({ targetCount: 5, batchIntentId: intent }),
        ),
      );

      // An explicit New Batch is the only other way to a fresh intent — and
      // only after the server confirms no job was recorded for the old one.
      const lookup = vi
        .spyOn(api, "listJobs")
        .mockResolvedValue({ items: [], nextCursor: null });
      fireEvent.change(screen.getByTestId("input-target-count"), {
        target: { value: "6" },
      });
      fireEvent.click(screen.getByTestId("button-new-batch"));
      await waitFor(() =>
        expect(preflight).toHaveBeenCalledWith(
          expect.objectContaining({ targetCount: 6 }),
        ),
      );
      expect(lookup).toHaveBeenCalledWith({ batchIntentId: intent, limit: 1 });
      const fresh = stored()!;
      expect(fresh.intentId).toMatch(INTENT_FORMAT);
      expect(fresh.intentId).not.toBe(intent);
      expect(fresh.pendingRequest).toBeNull();
      expect(intentsOf(preflight).at(-1)).toBe(fresh.intentId);
      expect(screen.queryByTestId("pending-batch-intent-notice")).toBeNull();
    });

    it("a definite refusal frees the intent from its request without minting a new one", async () => {
      const preflight = vi
        .spyOn(api, "preflightJob")
        .mockResolvedValue(mockPreflightResponse());
      const submit = vi.spyOn(api, "submitJob").mockRejectedValueOnce({
        response: {
          status: 400,
          data: { code: "BATCH_CAP_EXCEEDED", message: "cap exceeded" },
        },
      });
      renderPanel();
      await screen.findByTestId("button-submit-job");
      await generate();
      await screen.findByText("cap exceeded");
      const intent = submit.mock.calls[0][0].batchIntentId;
      expect(stored()).toMatchObject({ intentId: intent, pendingRequest: null });
      expect(screen.queryByTestId("pending-batch-intent-notice")).toBeNull();

      fireEvent.change(screen.getByTestId("input-target-count"), {
        target: { value: "3" },
      });
      await waitFor(() =>
        expect(preflight).toHaveBeenCalledWith(
          expect.objectContaining({ targetCount: 3, batchIntentId: intent }),
        ),
      );
    });

    it.each([
      ["unparsable JSON", "{not json"],
      ["an unknown version", JSON.stringify({ version: 2, intentId: "3f1c9a7e-2b4d-4c8e", pendingRequest: null })],
      ["a malformed intent", JSON.stringify({ version: 1, intentId: "bad intent", pendingRequest: null })],
      ["a malformed pending request", JSON.stringify({ version: 1, intentId: "3f1c9a7e-2b4d-4c8e", pendingRequest: { worldKey: 1 } })],
    ])("ignores %s in storage and starts a fresh, valid intent", async (_label, raw) => {
      window.sessionStorage.setItem(BATCH_INTENT_STORAGE_KEY, raw);
      const preflight = vi
        .spyOn(api, "preflightJob")
        .mockResolvedValue(mockPreflightResponse());
      renderPanel();
      await waitFor(() => expect(preflight).toHaveBeenCalledTimes(1));
      const [intent] = intentsOf(preflight);
      expect(intent).toMatch(INTENT_FORMAT);
      expect(intent).not.toBe("3f1c9a7e-2b4d-4c8e");
      expect(stored()).toEqual({ version: 1, intentId: intent, pendingRequest: null });
      expect(screen.queryByTestId("pending-batch-intent-notice")).toBeNull();
    });

    describe("New Batch reconciles an unconfirmed Submit first", () => {
      const failFirstSubmit = () =>
        vi
          .spyOn(api, "submitJob")
          .mockRejectedValueOnce(new Error("network timeout"))
          .mockResolvedValueOnce({
            jobId: "job-retried",
            created: false,
            contextHash: "c",
          });

      const reachUnknownOutcome = async () => {
        vi.spyOn(api, "preflightJob").mockResolvedValue(mockPreflightResponse());
        const submit = failFirstSubmit();
        renderPanel();
        await screen.findByTestId("button-submit-job");
        await generate();
        await screen.findByText(/تعذر التأكد من تسجيل الدفعة/);
        return { submit, intent: submit.mock.calls[0][0].batchIntentId! };
      };

      const recordedJob = (intent: string) =>
        mockJobStatus({
          jobId: "job-recorded",
          status: "queued",
          pipelineStage: "pending",
          generationSpec: {
            ...mockPreflightResponse().generationSpec!,
            batchIntentId: intent,
          },
        });

      it("shows the job the lost Submit created instead of starting another paid batch", async () => {
        const { submit, intent } = await reachUnknownOutcome();
        const lookup = vi
          .spyOn(api, "listJobs")
          .mockResolvedValue({ items: [recordedJob(intent)], nextCursor: null });

        fireEvent.click(screen.getByTestId("button-new-batch"));
        await screen.findByText(/الإرسال السابق سُجّل على الخادم/);

        expect(lookup).toHaveBeenCalledWith({ batchIntentId: intent, limit: 1 });
        expect(screen.getByTestId("active-job-status-badge")).toBeInTheDocument();
        // Nothing new was submitted, and the recorded job was not run.
        expect(submit).toHaveBeenCalledTimes(1);
        expect(api.runJob).not.toHaveBeenCalled();
        // The old intent is resolved: the next Generate is a new batch.
        expect(stored()?.intentId).not.toBe(intent);
        expect(stored()?.pendingRequest).toBeNull();
        expect(screen.queryByTestId("pending-batch-intent-notice")).toBeNull();
      });

      it("keeps the intent bound and blocks a new batch when the outcome cannot be determined; same-intent retry stays available", async () => {
        const { submit, intent } = await reachUnknownOutcome();
        const lookup = vi
          .spyOn(api, "listJobs")
          .mockRejectedValueOnce(new Error("offline"));

        fireEvent.click(screen.getByTestId("button-new-batch"));
        await screen.findByText(/تعذر التحقق من نتيجة الإرسال السابق/);
        expect(stored()).toMatchObject({
          intentId: intent,
          pendingRequest: { targetCount: 5 },
        });
        expect(screen.getByTestId("pending-batch-intent-notice")).toBeVisible();
        expect(submit).toHaveBeenCalledTimes(1);

        // Retrying the same batch is still possible and idempotent.
        await generate();
        await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
        expect(submit.mock.calls[1][0].batchIntentId).toBe(intent);
        expect(lookup).toHaveBeenCalledTimes(1);
      });

      it("does not treat a lookup that returns another intent's job as an answer", async () => {
        const { intent } = await reachUnknownOutcome();
        vi.spyOn(api, "listJobs").mockResolvedValue({
          items: [recordedJob("someone-elses-intent-0001")],
          nextCursor: null,
        });

        fireEvent.click(screen.getByTestId("button-new-batch"));
        await screen.findByText(/تعذر التحقق من نتيجة الإرسال السابق/);
        expect(stored()?.intentId).toBe(intent);
        expect(stored()?.pendingRequest).not.toBeNull();
        expect(api.runJob).not.toHaveBeenCalled();
      });

      it("starts a fresh intent only after the server confirms no job was recorded", async () => {
        const { submit, intent } = await reachUnknownOutcome();
        vi.spyOn(api, "listJobs")
          .mockRejectedValueOnce(new Error("offline"))
          .mockResolvedValueOnce({ items: [], nextCursor: null });

        fireEvent.click(screen.getByTestId("button-new-batch"));
        await screen.findByText(/تعذر التحقق من نتيجة الإرسال السابق/);
        expect(stored()?.intentId).toBe(intent);

        fireEvent.click(screen.getByTestId("button-new-batch"));
        await waitFor(() => expect(stored()?.intentId).not.toBe(intent));
        expect(stored()?.pendingRequest).toBeNull();
        expect(submit).toHaveBeenCalledTimes(1);
      });
    });
  });
});
