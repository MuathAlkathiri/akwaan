import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiGeneratedReview } from "./ai-generated-review";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt ?? ""} {...props} />
  ),
}));

vi.mock("@/features/questions", () => ({
  useDeleteQuestion: () => ({ mutate: vi.fn(), isPending: false }),
  usePatchQuestion: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateQuestionStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../hooks/use-ai-generation", () => ({
  useAiBulkAction: () => ({ mutate: vi.fn(), isPending: false }),
  useRetryQuestionAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useAiGenerated: () => ({
    isLoading: false,
    data: [
      {
        _id: "draft-1",
        question: "ما اسم هذه الأغنية؟",
        correctAnswer: "الأماكن",
        wrongAnswers: ["أ", "ب", "ج"],
        status: "draft",
        difficulty: "medium",
        gameMode: "identifySong",
        type: "audio",
        assetStatus: "READY",
        coverImageStatus: "FAILED",
        qualityScore: 8,
        primaryAssetRequest: {
          type: "audio",
          artist: "محمد عبده",
        },
        primaryAsset: {
          type: "audio",
          url: "/uploads/song.mp3",
          source: "youtube",
          provider: "youtube",
        },
        aiMetadata: {
          verificationDiagnostics: {
            verificationStatus: "VERIFIED",
            canonicalEntity: "الأماكن",
            canonicalAnswer: "الأماكن",
            overallConfidence: 0.86,
            evidenceSourceCount: 8,
            verificationCacheHit: true,
            canonicalArtist: "محمد عبده",
            canonicalSongTitle: "الأماكن",
            verifiedFranchise: "Naruto",
            verificationIssueCodes: ["ENTITY_VERIFICATION_SUCCEEDED"],
            rawMcpResponse: "SHOULD_NOT_RENDER",
            evidenceExcerpt: "FULL_EVIDENCE_EXCERPT_SHOULD_NOT_RENDER",
            localPath: "/Users/private/.wigolo/wigolo.db",
          },
        },
      },
    ],
  }),
}));

describe("AiGeneratedReview Wigolo diagnostics", () => {
  it("renders compact safe verification diagnostics collapsed by default", () => {
    render(<AiGeneratedReview />);

    const details = screen.getByText(/تحقق Wigolo:/).closest("details");
    expect(details).not.toHaveAttribute("open");

    expect(screen.getByText(/VERIFIED/)).toBeInTheDocument();
    expect(screen.getByText(/الكيان: الأماكن/)).toBeInTheDocument();
    expect(screen.getAllByText(/الإجابة: الأماكن/).length).toBeGreaterThan(0);
    expect(screen.getByText(/الثقة:/)).toBeInTheDocument();
    expect(screen.getByText(/86/)).toBeInTheDocument();
    expect(screen.getByText(/المصادر:\s*8/)).toBeInTheDocument();
    expect(screen.getByText(/نتيجة محفوظة/)).toBeInTheDocument();
    expect(screen.getAllByText(/محمد عبده/).length).toBeGreaterThan(0);
    expect(screen.getByText(/الأغنية: الأماكن/)).toBeInTheDocument();
    expect(screen.getByText(/العمل: Naruto/)).toBeInTheDocument();
  });

  it("does not render raw MCP data, evidence excerpts, or local paths", () => {
    const { container } = render(<AiGeneratedReview />);
    const text = container.textContent ?? "";

    expect(text).not.toContain("SHOULD_NOT_RENDER");
    expect(text).not.toContain("FULL_EVIDENCE_EXCERPT_SHOULD_NOT_RENDER");
    expect(text).not.toContain("/Users/private");
    expect(text).not.toContain("wigolo.db");
  });

  it("keeps existing media preview and save action controls visible", () => {
    render(<AiGeneratedReview />);

    expect(screen.getByText("اعتماد المحدد")).toBeInTheDocument();
    expect(document.querySelector("audio")).toBeInTheDocument();
  });
});
