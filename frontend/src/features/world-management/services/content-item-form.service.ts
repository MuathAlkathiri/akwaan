import type {
  DistributedInformationMergeOption,
  DistributedInformationPayload,
  ChallengeAnswerMode,
  ContentAnswerPayload,
  ContentItem,
  ContentItemStatus,
  ContentMediaType,
  VoteConsensusRule,
  Top5Payload,
  OneCluePayload,
  ContentPattern,
} from "../types";

/**
 * Content Item form state and its payload builder.
 *
 * Structural validity per answer mode is decided by the backend compatibility
 * policy — the single source of truth. What lives here is only the shape of the
 * editor and the minimum presence checks needed to keep the form usable; the
 * server's issue list is what the admin ultimately sees.
 */

export interface ContentItemFormValues {
  scopeId: string;
  promptAr: string;
  promptEn: string;
  compatibleChallengeTypeIds: string[];
  mediaType: ContentMediaType;
  mediaUrls: string[];
  status: ContentItemStatus;
  isReusableAcrossSessions: boolean;
  notes: string;
  answer: AnswerFormState;
  top5: Top5FormState;
  distributed: DistributedFormState;
  oneClue: OneClueFormState;
  combo: ComboFormState;
  marhala: MarhalaFormState;
}

/** A ContentItem cannot carry two different mechanic-owned payload shapes. */
export function selectCompatibleContentPattern(
  currentIds: string[],
  nextId: string,
  patternById: Record<string, ContentPattern>,
): string[] {
  const nextPattern = patternById[nextId] ?? "generic";
  return [
    ...currentIds.filter(
      (id) => (patternById[id] ?? "generic") === nextPattern,
    ),
    nextId,
  ];
}

/**
 * "صعوبة السؤال" as an author picks it, and the stage it means.
 *
 * The label is authoring copy; `stage` is the canonical value that persists. A
 * Combo run rises through these four in order, so the stage *is* the question's
 * position in the run — which is why it is Combo's own metadata and not a shared
 * `difficulty` field other mechanics would inherit a meaning for.
 */
export const COMBO_DIFFICULTIES = [
  { stage: 1, label: "متوسط" },
  { stage: 2, label: "متوسط صعب" },
  { stage: 3, label: "صعب" },
  { stage: 4, label: "صعب جدًا" },
] as const;

export type ComboStageValue = (typeof COMBO_DIFFICULTIES)[number]["stage"];

export const COMBO_CHALLENGE_SLUG = "combo";

/**
 * Whether the author has selected الكومبو.
 *
 * By slug, deliberately: Combo answers in the generic `match` mode that every
 * typed-answer mechanic shares, so neither the answer mode nor its content
 * pattern can single it out.
 */
export function hasComboMechanic(
  selected: ReadonlyArray<{ challengeType: { slug: string } }>,
): boolean {
  return selected.some(
    (configuration) =>
      configuration.challengeType.slug === COMBO_CHALLENGE_SLUG,
  );
}

export interface ComboFormState {
  enabled: boolean;
  /** Empty until the author chooses; never defaulted to a stage on their behalf. */
  stage: ComboStageValue | "";
}

function emptyComboState(): ComboFormState {
  return { enabled: false, stage: "" };
}

/** The stage on a saved item, or empty when it carries none. */
export function toComboFormState(
  payload: { comboStage?: unknown } | undefined,
): ComboFormState {
  const stage = payload?.comboStage;
  const known = COMBO_DIFFICULTIES.find((entry) => entry.stage === stage);
  return known ? { enabled: true, stage: known.stage } : emptyComboState();
}

/**
 * "صعوبة السؤال" for المرحلة, and the band it means.
 *
 * The values are the backend's own vocabulary verbatim — a team elects one of
 * these *before* the question is drawn, and the band decides how far a correct
 * answer can move them. Deliberately not Combo's stage: a stage is a position in
 * a fixed progression, a band is a risk the players choose, and sharing one field
 * would let a rebalance of either silently change the other's gameplay.
 */
export const MARHALA_DIFFICULTIES = [
  { value: "easy", label: "سهل" },
  { value: "medium", label: "متوسط" },
  { value: "hard", label: "صعب" },
] as const;

export type MarhalaDifficultyValue =
  (typeof MARHALA_DIFFICULTIES)[number]["value"];

export const MARHALA_CHALLENGE_SLUG = "marhala";

/**
 * Whether the author has selected المرحلة.
 *
 * By slug, like Combo and for the same reason: Marhala answers in the generic
 * `match` mode every typed-answer mechanic shares, so neither the answer mode nor
 * the content pattern can single it out.
 */
export function hasMarhalaMechanic(
  selected: ReadonlyArray<{ challengeType: { slug: string } }>,
): boolean {
  return selected.some(
    (configuration) =>
      configuration.challengeType.slug === MARHALA_CHALLENGE_SLUG,
  );
}

export interface MarhalaFormState {
  enabled: boolean;
  /** Empty until the author chooses; never defaulted to a band on their behalf. */
  difficulty: MarhalaDifficultyValue | "";
  /**
   * Set when the saved item carries a difficulty this contract does not define.
   *
   * Such an item is unplayable — the runtime draw reads the same predicate the
   * form does — so the author is told the stored value is unusable and asked to
   * choose. Nothing is guessed on their behalf: inventing سهل for a broken value
   * would silently change what the item does in a race.
   */
  unknownStored?: string;
}

function emptyMarhalaState(): MarhalaFormState {
  return { enabled: false, difficulty: "" };
}

/** The band on a saved item, empty when it carries none, flagged when unusable. */
export function toMarhalaFormState(
  payload: { marhalaDifficulty?: unknown } | undefined,
): MarhalaFormState {
  const raw = payload?.marhalaDifficulty;
  const known = MARHALA_DIFFICULTIES.find((entry) => entry.value === raw);
  if (known) return { enabled: true, difficulty: known.value };
  if (raw === undefined || raw === null) return emptyMarhalaState();
  return { enabled: true, difficulty: "", unknownStored: String(raw) };
}

export const ONE_CLUE_VALUES = [5, 4, 3, 2, 1] as const;
export const ONE_CLUE_PROMPT_AR = "اكتشف الإجابة المستهدفة من الأدلة";

export interface OneClueFormState {
  enabled: boolean;
  targetAnswer: string;
  clues: string[];
}

function emptyOneClueState(): OneClueFormState {
  return {
    enabled: false,
    targetAnswer: "",
    clues: ONE_CLUE_VALUES.map(() => ""),
  };
}

/** One of the three fixed private segments of a "ركّبها" item. */
export interface DistributedSegmentFormState {
  id: "A" | "B" | "C";
  contentAr: string;
  contentEn: string;
  imageUrl: string;
}

export type DistributedMergeKey = "AB_C" | "AC_B" | "BC_A";

export interface DistributedFormState {
  /** Set when a selected mechanic is the ركّبها wrapper. */
  enabled: boolean;
  publicPromptAr: string;
  publicPromptEn: string;
  segments: DistributedSegmentFormState[];
  /** The author-approved two-player splits, at least one. */
  mergeKeys: DistributedMergeKey[];
  safetyConfirmed: boolean;
  explanation: string;
}

/** Each split gives one player two segments and the other the remaining one. */
export const DISTRIBUTED_MERGES: Record<
  DistributedMergeKey,
  {
    label: string;
    first: Array<"A" | "B" | "C">;
    second: Array<"A" | "B" | "C">;
  }
> = {
  AB_C: { label: "A+B | C", first: ["A", "B"], second: ["C"] },
  AC_B: { label: "A+C | B", first: ["A", "C"], second: ["B"] },
  BC_A: { label: "B+C | A", first: ["B", "C"], second: ["A"] },
};

function emptyDistributedState(): DistributedFormState {
  return {
    enabled: false,
    publicPromptAr: "",
    publicPromptEn: "",
    segments: (["A", "B", "C"] as const).map((id) => ({
      id,
      contentAr: "",
      contentEn: "",
      imageUrl: "",
    })),
    mergeKeys: [],
    safetyConfirmed: false,
    explanation: "",
  };
}

/** Exactly ten entries per Top 5 item: five ranked 1..5 and five traps. */
export const TOP5_ENTRY_COUNT = 10;
export const TOP5_RANKED_COUNT = 5;

export interface Top5EntryFormState {
  id: string;
  label: string;
  shortLabel: string;
  imageUrl: string;
  /** `"trap"`, or the rank as a string. There is no third state. */
  classification: "trap" | `${number}`;
}

export interface Top5FormState {
  title: string;
  instruction: string;
  rankingBasis: string;
  sourceLabel: string;
  sourceUrl: string;
  asOfDate: string;
  explanation: string;
  entries: Top5EntryFormState[];
}

function emptyTop5State(): Top5FormState {
  return {
    title: "",
    instruction: "",
    rankingBasis: "",
    sourceLabel: "",
    sourceUrl: "",
    asOfDate: "",
    explanation: "",
    entries: Array.from({ length: TOP5_ENTRY_COUNT }, (_, index) => ({
      id: `entry-${index + 1}`,
      label: "",
      shortLabel: "",
      imageUrl: "",
      classification: (index < TOP5_RANKED_COUNT
        ? String(index + 1)
        : "trap") as Top5EntryFormState["classification"],
    })),
  };
}

export interface AnswerFormState {
  mode: ChallengeAnswerMode;
  options: Array<{ id: string; label: string }>;
  correctOptionId: string;
  correctValue: string;
  acceptedTolerance: string;
  acceptedAnswers: string;
  consensusRule: VoteConsensusRule;
  fragments: Array<{ seat: number; clue: string }>;
}

export function emptyAnswerState(
  mode: ChallengeAnswerMode = "multiple_choice",
): AnswerFormState {
  return {
    mode,
    options: [
      { id: "option-1", label: "" },
      { id: "option-2", label: "" },
    ],
    correctOptionId: "option-1",
    correctValue: "",
    acceptedTolerance: "",
    acceptedAnswers: "",
    consensusRule: "majority",
    fragments: [
      { seat: 1, clue: "" },
      { seat: 2, clue: "" },
    ],
  };
}

export function emptyContentItemForm(scopeId: string): ContentItemFormValues {
  return {
    scopeId,
    promptAr: "",
    promptEn: "",
    compatibleChallengeTypeIds: [],
    mediaType: "none",
    mediaUrls: [],
    status: "draft",
    isReusableAcrossSessions: false,
    notes: "",
    answer: emptyAnswerState(),
    top5: emptyTop5State(),
    distributed: emptyDistributedState(),
    oneClue: emptyOneClueState(),
    combo: emptyComboState(),
    marhala: emptyMarhalaState(),
  };
}

function mergeKeyOf(option: {
  firstParticipantSegmentIds?: string[];
  secondParticipantSegmentIds?: string[];
}): DistributedMergeKey | undefined {
  const pair = [...(option.firstParticipantSegmentIds ?? [])].sort().join("");
  const single = (option.secondParticipantSegmentIds ?? []).join("");
  const entry = Object.entries(DISTRIBUTED_MERGES).find(
    ([, value]) =>
      value.first.slice().sort().join("") === pair &&
      value.second.join("") === single,
  );
  return entry?.[0] as DistributedMergeKey | undefined;
}

export function toDistributedFormState(
  payload: DistributedInformationPayload | undefined,
): DistributedFormState {
  if (payload?.variant !== "three-segment-race") return emptyDistributedState();
  const base = emptyDistributedState();
  return {
    enabled: true,
    publicPromptAr: payload.publicPrompt?.ar ?? "",
    publicPromptEn: payload.publicPrompt?.en ?? "",
    segments: base.segments.map((segment) => {
      const authored = payload.segments?.find(
        (candidate: { id: string }) => candidate.id === segment.id,
      );
      return {
        ...segment,
        contentAr: authored?.content?.ar ?? "",
        contentEn: authored?.content?.en ?? "",
        imageUrl: authored?.media?.assets?.[0]?.url ?? "",
      };
    }),
    mergeKeys: (payload.twoPlayerMergeOptions ?? [])
      .map((option: DistributedInformationMergeOption) => mergeKeyOf(option))
      .filter((key): key is DistributedMergeKey => Boolean(key)),
    safetyConfirmed: payload.authorSafetyConfirmation === true,
    explanation: payload.explanation ?? "",
  };
}

export function toContentItemForm(item: ContentItem): ContentItemFormValues {
  const payload = item.answerPayload;
  const top5Payload = item.mechanicPayload as Partial<Top5Payload> | undefined;
  const emptyTop5 = emptyTop5State();
  const oneCluePayload = item.mechanicPayload as
    Partial<OneCluePayload> | undefined;
  const acceptedAnswers = payload.acceptedAnswers ?? [];
  return {
    scopeId: item.scopeId,
    promptAr: item.prompt.ar,
    promptEn: item.prompt.en ?? "",
    compatibleChallengeTypeIds: [...item.compatibleChallengeTypeIds],
    mediaType: item.media?.type ?? "none",
    mediaUrls: (item.media?.assets ?? []).map((asset) => asset.url),
    status: item.status,
    isReusableAcrossSessions: item.isReusableAcrossSessions,
    notes: item.metadata?.notes ?? "",
    combo: toComboFormState(
      item.mechanicPayload as { comboStage?: unknown } | undefined,
    ),
    marhala: toMarhalaFormState(
      item.mechanicPayload as { marhalaDifficulty?: unknown } | undefined,
    ),
    answer: {
      ...emptyAnswerState(payload.mode),
      mode: payload.mode,
      options: (payload.options ?? []).map((option) => ({
        id: option.id,
        label: option.label.ar,
      })),
      correctOptionId: payload.correctOptionId ?? "",
      correctValue:
        payload.correctValue === undefined ? "" : String(payload.correctValue),
      acceptedTolerance:
        payload.acceptedTolerance === undefined
          ? ""
          : String(payload.acceptedTolerance),
      acceptedAnswers: acceptedAnswers
        .slice(oneCluePayload?.clues ? 1 : 0)
        .join("\n"),
      consensusRule: payload.consensusRule ?? "majority",
      fragments: (payload.splitPayload?.fragments ?? []).map((fragment) => ({
        seat: fragment.seat,
        clue: fragment.clue.ar,
      })),
    },
    distributed: toDistributedFormState(
      item.mechanicPayload as DistributedInformationPayload | undefined,
    ),
    oneClue: oneCluePayload?.clues
      ? {
          enabled: true,
          targetAnswer: acceptedAnswers[0] ?? "",
          clues: ONE_CLUE_VALUES.map(
            (_value, index) => oneCluePayload.clues?.[index]?.text?.ar ?? "",
          ),
        }
      : emptyOneClueState(),
    top5:
      top5Payload?.variant === "keep-or-give"
        ? {
            title: top5Payload.title ?? "",
            instruction: top5Payload.instruction ?? "",
            rankingBasis: top5Payload.rankingBasis ?? "",
            sourceLabel: top5Payload.sourceLabel ?? "",
            sourceUrl: top5Payload.sourceUrl ?? "",
            asOfDate: top5Payload.asOfDate ?? "",
            explanation: top5Payload.explanation ?? "",
            entries: Array.from({ length: TOP5_ENTRY_COUNT }, (_, index) => {
              const entry = top5Payload.entries?.[index];
              return {
                id: entry?.id ?? `entry-${index + 1}`,
                label: entry?.label ?? "",
                shortLabel: entry?.shortLabel ?? "",
                imageUrl: entry?.media?.url ?? "",
                // A stored `null` means the author said "trap"; a missing entry
                // gets the same default the empty form does.
                classification: (entry && entry.rank != null
                  ? String(entry.rank)
                  : "trap") as "trap" | `${number}`,
              };
            }),
          }
        : emptyTop5,
  };
}

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildAnswerPayload(
  answer: AnswerFormState,
): ContentAnswerPayload {
  const options = answer.options
    .filter((option) => option.label.trim())
    .map((option) => ({ id: option.id, label: { ar: option.label.trim() } }));

  switch (answer.mode) {
    case "multiple_choice":
      return {
        mode: "multiple_choice",
        options,
        correctOptionId: answer.correctOptionId,
      };
    case "closest":
      return {
        mode: "closest",
        correctValue: toNumber(answer.correctValue) as number,
        ...(toNumber(answer.acceptedTolerance) === undefined
          ? {}
          : { acceptedTolerance: toNumber(answer.acceptedTolerance) }),
      };
    case "match":
      return {
        mode: "match",
        acceptedAnswers: toLines(answer.acceptedAnswers),
      };
    case "vote":
      return {
        mode: "vote",
        ...(options.length ? { options } : {}),
        consensusRule: answer.consensusRule,
      };
    case "split":
      return {
        mode: "split",
        splitPayload: {
          fragments: answer.fragments
            .filter((fragment) => fragment.clue.trim())
            .map((fragment) => ({
              seat: fragment.seat,
              clue: { ar: fragment.clue.trim() },
            })),
        },
        acceptedAnswers: toLines(answer.acceptedAnswers),
      };
    case "top_5":
      return { mode: "top_5" };
    case "ryo":
    default:
      // Roadmap 6.1: an RYO prompt is multiple choice or a numeric estimate,
      // never open text.
      return options.length
        ? {
            mode: "ryo",
            options,
            correctOptionId: answer.correctOptionId,
          }
        : {
            mode: "ryo",
            options: null,
            correctValue: toNumber(answer.correctValue),
            ...(toNumber(answer.acceptedTolerance) === undefined
              ? {}
              : { acceptedTolerance: toNumber(answer.acceptedTolerance) }),
          };
  }
}

export function buildContentItemPayload(values: ContentItemFormValues) {
  const mediaUrls = values.mediaUrls.map((url) => url.trim()).filter(Boolean);
  const top5MechanicPayload =
    values.answer.mode === "top_5"
      ? {
          variant: "keep-or-give",
          title: values.top5.title.trim(),
          instruction: values.top5.instruction.trim(),
          rankingBasis: values.top5.rankingBasis.trim(),
          sourceLabel: values.top5.sourceLabel.trim(),
          sourceUrl: values.top5.sourceUrl.trim(),
          ...(values.top5.asOfDate ? { asOfDate: values.top5.asOfDate } : {}),
          // One list with the rank on the entry: there is no second array that
          // could disagree with it about which entries are real.
          entries: values.top5.entries.map((entry) => ({
            id: entry.id,
            label: entry.label.trim(),
            ...(entry.shortLabel.trim()
              ? { shortLabel: entry.shortLabel.trim() }
              : {}),
            ...(entry.imageUrl.trim()
              ? { media: { url: entry.imageUrl.trim() } }
              : {}),
            rank:
              entry.classification === "trap"
                ? null
                : Number(entry.classification),
          })),
          ...(values.top5.explanation.trim()
            ? { explanation: values.top5.explanation.trim() }
            : {}),
        }
      : undefined;
  // "ركّبها" carries only the distributed parts; the answer stays in
  // answerPayload, the one validated home every mechanic already uses.
  const distributedMechanicPayload = values.distributed.enabled
    ? {
        variant: "three-segment-race",
        publicPrompt: {
          ar: values.distributed.publicPromptAr.trim(),
          ...(values.distributed.publicPromptEn.trim()
            ? { en: values.distributed.publicPromptEn.trim() }
            : {}),
        },
        segments: values.distributed.segments.map((segment) => ({
          id: segment.id,
          content: {
            ar: segment.contentAr.trim(),
            ...(segment.contentEn.trim()
              ? { en: segment.contentEn.trim() }
              : {}),
          },
          ...(segment.imageUrl.trim()
            ? {
                media: {
                  type: "image",
                  assets: [{ url: segment.imageUrl.trim() }],
                },
              }
            : {}),
        })),
        twoPlayerMergeOptions: values.distributed.mergeKeys.map((key) => ({
          firstParticipantSegmentIds: DISTRIBUTED_MERGES[key].first,
          secondParticipantSegmentIds: DISTRIBUTED_MERGES[key].second,
        })),
        supportedTeamSizes: [2, 3],
        authorSafetyConfirmation: values.distributed.safetyConfirmed,
        ...(values.distributed.explanation.trim()
          ? { explanation: values.distributed.explanation.trim() }
          : {}),
      }
    : undefined;
  const oneClueMechanicPayload = values.oneClue.enabled
    ? {
        clues: ONE_CLUE_VALUES.map((value, index) => ({
          order: index + 1,
          value,
          text: { ar: values.oneClue.clues[index]?.trim() ?? "" },
        })),
      }
    : undefined;
  // Only the canonical stage is persisted — never the Arabic label.
  const comboMechanicPayload =
    values.combo.enabled && values.combo.stage !== ""
      ? { comboStage: values.combo.stage }
      : undefined;
  // Same rule for المرحلة: the canonical band, never its Arabic label.
  const marhalaMechanicPayload =
    values.marhala.enabled && values.marhala.difficulty !== ""
      ? { marhalaDifficulty: values.marhala.difficulty }
      : undefined;
  /**
   * One payload holding every selected mechanic's own keys.
   *
   * An item may be compatible with more than one mechanic, and each owns a
   * different part of this object — الكومبو its stage, المرحلة its band, ركّبها its
   * segments. Merging rather than overwriting is what lets that be true: a
   * mechanic contributes its keys or contributes nothing, and no mechanic can
   * silently erase another's. The wrapper payloads remain mutually exclusive by
   * content pattern, so they never actually meet.
   */
  const mechanicPayload =
    (top5MechanicPayload ??
    distributedMechanicPayload ??
    oneClueMechanicPayload ??
    comboMechanicPayload ??
    marhalaMechanicPayload)
      ? {
          ...top5MechanicPayload,
          ...distributedMechanicPayload,
          ...oneClueMechanicPayload,
          ...comboMechanicPayload,
          ...marhalaMechanicPayload,
        }
      : undefined;
  const answerPayload = values.oneClue.enabled
    ? {
        mode: "match" as const,
        acceptedAnswers: [
          values.oneClue.targetAnswer.trim(),
          ...toLines(values.answer.acceptedAnswers),
        ].filter(Boolean),
      }
    : buildAnswerPayload(values.answer);
  return {
    scopeId: values.scopeId,
    prompt: {
      ar:
        values.promptAr.trim() ||
        (values.oneClue.enabled ? ONE_CLUE_PROMPT_AR : ""),
      ...(values.promptEn.trim() ? { en: values.promptEn.trim() } : {}),
    },
    compatibleChallengeTypeIds: values.compatibleChallengeTypeIds,
    ...(values.mediaType === "none"
      ? {}
      : {
          media: {
            type: values.mediaType,
            assets: mediaUrls.map((url) => ({ url })),
          },
        }),
    answerPayload,
    ...(mechanicPayload ? { mechanicPayload } : {}),
    isReusableAcrossSessions: values.isReusableAcrossSessions,
    status: values.status,
    ...(values.notes.trim()
      ? { metadata: { notes: values.notes.trim() } }
      : {}),
  };
}

/** Presence-only checks that keep the form usable before the server replies. */
/**
 * The machine-checkable half of the "ركّبها" contract, mirrored from the backend
 * policy so an author sees the problem before saving rather than after.
 */
export function findDistributedProblems(
  values: ContentItemFormValues,
): string[] {
  const problems: string[] = [];
  const { distributed } = values;
  if (!distributed.publicPromptAr.trim()) {
    problems.push("السؤال العام مطلوب، ويراه كل أفراد الفريق.");
  }
  if (distributed.segments.some((segment) => !segment.contentAr.trim())) {
    problems.push("اكتب محتوى المعلومات الثلاث (أ، ب، ج).");
  }
  if (!distributed.mergeKeys.length) {
    problems.push("اختر توزيعاً آمناً واحداً على الأقل لفريق من لاعبين.");
  }
  if (!["match", "closest", "multiple_choice"].includes(values.answer.mode)) {
    problems.push(
      "طريقة الإجابة يجب أن تكون نصاً قصيراً أو رقماً أو اختياراً من متعدد.",
    );
  }
  if (values.status === "ready" && !distributed.safetyConfirmed) {
    problems.push("أكّد أنك راجعت التوزيع قبل جعل العنصر جاهزاً.");
  }
  return problems;
}

export function findLocalFormProblems(values: ContentItemFormValues): string[] {
  const problems: string[] = [];
  if (!values.promptAr.trim() && !values.oneClue.enabled)
    problems.push("نص السؤال بالعربية مطلوب.");
  if (!values.compatibleChallengeTypeIds.length) {
    problems.push("اختر نوع تحدٍ واحداً متوافقاً على الأقل.");
  }
  if (values.distributed.enabled) {
    problems.push(...findDistributedProblems(values));
  }
  if (values.combo.enabled && values.combo.stage === "") {
    problems.push("اختر صعوبة السؤال.");
  }
  if (values.marhala.enabled && values.marhala.difficulty === "") {
    // Also the path a saved-but-unusable value takes: the author must choose one,
    // and nothing is filled in for them.
    problems.push("اختر صعوبة السؤال.");
  }
  if (values.oneClue.enabled) {
    if (!values.oneClue.targetAnswer.trim())
      problems.push("الإجابة المستهدفة مطلوبة.");
    if (
      values.oneClue.clues.length !== ONE_CLUE_VALUES.length ||
      values.oneClue.clues.some((clue) => !clue.trim())
    )
      problems.push("اكتب الأدلة الخمسة كاملة.");
    const clues = values.oneClue.clues
      .map((clue) => clue.trim())
      .filter(Boolean);
    if (new Set(clues).size !== clues.length)
      problems.push("لا يمكن تكرار نص الدليل نفسه.");
  }
  // Two mechanics can ask the author for the same thing — both take a صعوبة —
  // and saying it twice reads as two different problems.
  return [...new Set(problems)];
}
