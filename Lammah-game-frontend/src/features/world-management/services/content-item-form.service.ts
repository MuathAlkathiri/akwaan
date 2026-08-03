import type {
  ChallengeAnswerMode,
  ContentAnswerPayload,
  ContentItem,
  ContentItemStatus,
  ContentMediaType,
  VoteConsensusRule,
  Top10PoisonDeckPayload,
  Top10Variant,
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
  top10: Top10FormState;
}

export interface Top10CardFormState {
  id: string;
  label: string;
  shortLabel: string;
  imageUrl: string;
  classification: "decoy" | `${number}`;
}

export interface Top10FormState {
  variant: Top10Variant;
  title: string;
  instruction: string;
  rankingBasis: string;
  sourceLabel: string;
  asOfDate: string;
  explanation: string;
  cards: Top10CardFormState[];
}

function emptyTop10State(): Top10FormState {
  return {
    variant: "classic",
    title: "",
    instruction: "",
    rankingBasis: "",
    sourceLabel: "",
    asOfDate: "",
    explanation: "",
    cards: Array.from({ length: 14 }, (_, index) => ({
      id: `card-${index + 1}`,
      label: "",
      shortLabel: "",
      imageUrl: "",
      classification: (index < 10
        ? String(index + 1)
        : "decoy") as Top10CardFormState["classification"],
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
    top10: emptyTop10State(),
  };
}

export function toContentItemForm(item: ContentItem): ContentItemFormValues {
  const payload = item.answerPayload;
  const top10Payload = item.mechanicPayload as
    Partial<Top10PoisonDeckPayload> | undefined;
  const emptyTop10 = emptyTop10State();
  const rankByCandidate = new Map(
    (top10Payload?.rankedAnswer ?? []).map((answer) => [
      answer.candidateId,
      String(answer.rank),
    ]),
  );
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
      acceptedAnswers: (payload.acceptedAnswers ?? []).join("\n"),
      consensusRule: payload.consensusRule ?? "majority",
      fragments: (payload.splitPayload?.fragments ?? []).map((fragment) => ({
        seat: fragment.seat,
        clue: fragment.clue.ar,
      })),
    },
    top10:
      top10Payload?.variant === "poison-deck"
        ? {
            variant: "poison-deck",
            title: top10Payload.title ?? "",
            instruction: top10Payload.instruction ?? "",
            rankingBasis: top10Payload.rankingBasis ?? "",
            sourceLabel: top10Payload.sourceLabel ?? "",
            asOfDate: top10Payload.asOfDate ?? "",
            explanation: top10Payload.explanation ?? "",
            cards: Array.from({ length: 14 }, (_, index) => {
              const candidate = top10Payload.candidates?.[index];
              return {
                id: candidate?.id ?? `card-${index + 1}`,
                label: candidate?.label ?? "",
                shortLabel: candidate?.shortLabel ?? "",
                imageUrl: candidate?.media?.url ?? "",
                classification: (candidate && rankByCandidate.get(candidate.id)
                  ? rankByCandidate.get(candidate.id)
                  : "decoy") as "decoy" | `${number}`,
              };
            }),
          }
        : emptyTop10,
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
    case "top_10":
      return { mode: "top_10" };
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
  const top10MechanicPayload =
    values.answer.mode === "top_10"
      ? values.top10.variant === "classic"
        ? { variant: "classic" }
        : {
            variant: "poison-deck",
            title: values.top10.title.trim(),
            instruction: values.top10.instruction.trim(),
            rankingBasis: values.top10.rankingBasis.trim(),
            sourceLabel: values.top10.sourceLabel.trim(),
            ...(values.top10.asOfDate
              ? { asOfDate: values.top10.asOfDate }
              : {}),
            candidates: values.top10.cards.map((card) => ({
              id: card.id,
              label: card.label.trim(),
              ...(card.shortLabel.trim()
                ? { shortLabel: card.shortLabel.trim() }
                : {}),
              ...(card.imageUrl.trim()
                ? { media: { url: card.imageUrl.trim() } }
                : {}),
            })),
            rankedAnswer: values.top10.cards
              .filter((card) => card.classification !== "decoy")
              .map((card) => ({
                candidateId: card.id,
                rank: Number(card.classification),
              })),
            decoyCandidateIds: values.top10.cards
              .filter((card) => card.classification === "decoy")
              .map((card) => card.id),
            ...(values.top10.explanation.trim()
              ? { explanation: values.top10.explanation.trim() }
              : {}),
          }
      : undefined;
  return {
    scopeId: values.scopeId,
    prompt: {
      ar: values.promptAr.trim(),
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
    answerPayload: buildAnswerPayload(values.answer),
    ...(top10MechanicPayload ? { mechanicPayload: top10MechanicPayload } : {}),
    isReusableAcrossSessions: values.isReusableAcrossSessions,
    status: values.status,
    ...(values.notes.trim()
      ? { metadata: { notes: values.notes.trim() } }
      : {}),
  };
}

/** Presence-only checks that keep the form usable before the server replies. */
export function findLocalFormProblems(values: ContentItemFormValues): string[] {
  const problems: string[] = [];
  if (!values.promptAr.trim()) problems.push("نص السؤال بالعربية مطلوب.");
  if (!values.compatibleChallengeTypeIds.length) {
    problems.push("اختر نوع تحدٍ واحداً متوافقاً على الأقل.");
  }
  return problems;
}
