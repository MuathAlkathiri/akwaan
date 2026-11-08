import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/features/content-engine-review/api";
import { DeduplicationPanel } from "@/features/content-engine-review/deduplication-panel";
import type { OverlapRequirement } from "@/features/content-engine-review/deduplication-findings";
import type { ReviewCandidate } from "@/features/content-engine-review/types";

const candidate = {
  candidateId: "candidate-1",
  reviewStatus: "pending",
  findings: [],
  publishedContentItemId: null,
  draft: {
    prompt: { ar: "سؤال جديد" },
    answerPayload: {
      mode: "multiple_choice",
      options: [{ id: "a", label: { ar: "الإجابة الجديدة" } }],
      correctOptionId: "a",
    },
  },
  canonicalTarget: {
    scopeName: "الدوري الإنجليزي",
    challengeTypeName: "اقرأ خصمك",
  },
} as unknown as ReviewCandidate;
const requirement = (id: string): OverlapRequirement => ({
  fingerprint: `ovl1:${id.padEnd(64, "a")}`,
  code: "POTENTIAL_OVERLAP_HISTORICAL_CONTENT",
  reasonCode: "UNSUPPORTED_MECHANIC_COMPARISON",
  referenceKind: "CANONICAL_READY",
  referenceId: id,
  sourceLabelAr: "سؤال جاهز",
});

describe("human-readable overlap comparison", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "getOverlapScope").mockResolvedValue({
      name: "الدوري الإنجليزي",
    } as never);
    vi.spyOn(api, "getOverlapMechanic").mockResolvedValue({
      name: "التصويت",
    } as never);
  });

  it("renders each reference and its acknowledgment with inconclusive VOTE explanation", async () => {
    vi.spyOn(api, "getOverlapContentItem").mockImplementation(
      async (id) =>
        ({
          id,
          scopeId: "scope",
          compatibleChallengeTypeIds: ["vote"],
          status: "ready",
          prompt: { ar: `سؤال مرجعي ${id}` },
          answerPayload: {
            mode: "vote",
            options: [{ id: "a", label: { ar: "خيار التصويت" } }],
          },
        }) as never,
    );
    render(
      <DeduplicationPanel
        candidate={candidate}
        onRescreen={async () => {}}
        isRescreening={false}
        overlapRequirements={[requirement("one"), requirement("two")]}
        onToggleAcknowledgment={vi.fn()}
      />,
    );
    const first = screen.getByTestId("overlap-requirement-one");
    expect(await within(first).findByText("سؤال مرجعي one")).toBeVisible();
    expect(await screen.findByText("سؤال مرجعي two")).toBeVisible();
    expect(within(first).getAllByText("الإجابة الجديدة")[0]).toBeVisible();
    expect(
      within(first).getByText("تصويت: لا توجد إجابة صحيحة محددة"),
    ).toBeVisible();
    expect(within(first).getByText("خيار التصويت")).toBeVisible();
    expect(within(first).getByText(/المقارنة الآلية غير حاسمة/)).toBeVisible();
    expect(within(first).getByRole("checkbox")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(within(first).getByTestId("overlap-comparison")).toHaveClass(
      "md:grid-cols-2",
    );
    expect(
      within(first).getByText("التفاصيل التقنية").closest("details"),
    ).not.toHaveAttribute("open");
  });

  it("shows a clear fallback when the reference cannot be read", async () => {
    vi.spyOn(api, "getOverlapContentItem").mockRejectedValue(
      new Error("unavailable"),
    );
    render(
      <DeduplicationPanel
        candidate={candidate}
        onRescreen={async () => {}}
        isRescreening={false}
        overlapRequirements={[requirement("missing")]}
        onToggleAcknowledgment={vi.fn()}
      />,
    );
    expect(await screen.findByText(/تعذر تحميل المحتوى المرجعي/)).toBeVisible();
  });

  it("renders the correct answer of a referenced content item", async () => {
    vi.spyOn(api, "getOverlapContentItem").mockResolvedValue({
      scopeId: "scope",
      compatibleChallengeTypeIds: ["mechanic"],
      status: "ready",
      prompt: { ar: "السؤال السابق" },
      answerPayload: {
        mode: "multiple_choice",
        correctOptionId: "b",
        options: [{ id: "b", label: { ar: "الإجابة السابقة" } }],
      },
    } as never);
    render(
      <DeduplicationPanel
        candidate={candidate}
        onRescreen={async () => {}}
        isRescreening={false}
        overlapRequirements={[requirement("existing")]}
        onToggleAcknowledgment={vi.fn()}
      />,
    );
    const reference = await screen.findByRole("region", {
      name: "المحتوى المرجعي",
    });
    expect(await within(reference).findByText("السؤال السابق")).toBeVisible();
    expect(within(reference).getAllByText("الإجابة السابقة")[0]).toBeVisible();
    expect(within(reference).getByText("جاهز")).toBeVisible();
  });
});
