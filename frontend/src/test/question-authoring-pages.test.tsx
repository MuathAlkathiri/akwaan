import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionAdminScreen } from "@/features/questions/components/question-admin-screen";
import { QuestionsList } from "@/features/questions/components/questions-list";
import { QuestionForm } from "@/features/questions/components/question-form";

import { mediaRequestFingerprint } from "@/features/questions/hooks/use-question-form";
import { RankedListEditor } from "@/features/questions/components/ranked-list-editor";
import { mergeAcceptedAnswers } from "@/features/questions/components/accepted-answers-editor";
import {
  confirmUnsavedChanges,
  UNSAVED_CHANGES_MESSAGE,
} from "@/features/questions/hooks/use-unsaved-changes-warning";
import { createDefaultRankedListEntries } from "@/features/questions/models/ranked-list-form";
import type { Question } from "@/types";

const mutateAsync = vi.fn();
const removeMedia = vi.fn();
const uploadMedia = vi.fn();
const uploadImage = vi.fn();
const removeImage = vi.fn();
let imageUploading = false;
let mediaUploading = false;
const mutation = { mutate: vi.fn(), mutateAsync, isPending: false };
const question = {
  id: "question-1",
  _id: "question-1",
  categoryId: "category-1",
  question: "السؤال",
  questionType: "standard",
  answer: "الإجابة",
  acceptedAnswers: [],
  difficulty: "easy",
  points: 200,
  type: "text",
  status: "draft",
  source: "manual",
  isFreeGameQuestion: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as Question;

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/features/world-management/hooks/use-world-content", () => ({
  useWorlds: () => ({ data: [], isLoading: false }),
  useScopes: () => ({ data: [], isLoading: false }),
  useWorldBoard: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/features/categories", () => ({
  useCategories: () => ({
    data: [
      {
        id: "category-1",
        _id: "category-1",
        name: "رياضة",
        audioPolicy: "optional",
      },
    ],
  }),
}));

vi.mock("@/features/questions/hooks/use-questions", () => ({
  useQuestions: () => ({ data: [question], isLoading: false }),
  useCreateQuestion: () => mutation,
  usePatchQuestion: () => mutation,
  useDeleteQuestion: () => mutation,
  useUpdateQuestionStatus: () => mutation,
  useQuestionAudioActions: () => ({
    ...mutation,
    updateRequest: mutateAsync,
    preview: mutateAsync,
    remove: removeMedia,
    upload: uploadMedia,
    isUploading: mediaUploading,
    isRemoving: false,
  }),
  useQuestionAudioCandidates: () => ({
    data: [],
    isLoading: false,
  }),
  useQuestionImageActions: () => ({
    upload: uploadImage,
    remove: removeImage,
    isUploading: imageUploading,
    isRemoving: false,
  }),
  useBombItemImageUpload: () => ({
    upload: vi.fn(),
    isPending: false,
  }),
  useGenerateAcceptedAnswers: () => mutation,
  useGenerateRankedAcceptedAnswers: () => mutation,
}));

describe("full-page question authoring", () => {
  beforeAll(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:image-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    imageUploading = false;
    mediaUploading = false;
    removeImage.mockResolvedValue(question);
    uploadImage.mockResolvedValue({
      ...question,
      type: "image",
      primaryAsset: {
        type: "image",
        url: "/uploads/questions/images/new.webp",
        source: "admin-upload",
      },
    });
    uploadMedia.mockResolvedValue({
      ...question,
      type: "video",
      audioAsset: {
        type: "video",
        url: "/uploads/question-assets/video/new.mp4",
        source: "admin-upload",
      },
    });
  });

  it("links Add Question and Edit to dedicated routes without dialogs", () => {
    const { rerender } = render(<QuestionAdminScreen />);
    expect(screen.getByText("إضافة سؤال جديد").closest("a")).toHaveAttribute(
      "href",
      "/admin/questions/new",
    );
    rerender(<QuestionsList canPreview />);
    expect(screen.getByText("تحرير السؤال").closest("a")).toHaveAttribute(
      "href",
      "/admin/questions/question-1/edit",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not disable question approval because optional media is pending", () => {
    const mutableQuestion = question as Question;
    const previous = { ...mutableQuestion };
    Object.assign(mutableQuestion, {
      type: "audio",
      requiresAudio: true,
      audioStatus: "pending",
      audioReviewStatus: "pending",
      audioRequestStale: false,
    });
    render(<QuestionsList canPreview />);
    expect(screen.getByRole("button", { name: "موافق عليه" })).toBeEnabled();
    Object.assign(mutableQuestion, previous);
    delete mutableQuestion.requiresAudio;
    delete mutableQuestion.audioStatus;
    delete mutableQuestion.audioReviewStatus;
    delete mutableQuestion.audioRequestStale;
  });

  it("renders exactly ten Top 10 rows with system-owned point displays", () => {
    render(
      <QuestionForm
        question={{
          ...question,
          questionType: "ranked_list",
          points: 600,
          rankedList: {
            displayName: { ar: "توب 10", en: "Top 10" },
            entries: createDefaultRankedListEntries().map((entry) => ({
              ...entry,
              answer: { ar: `إجابة ${entry.rank}`, en: "" },
            })),
          },
        }}
      />,
    );
    expect(screen.getAllByLabelText(/الإجابة العربية للمرتبة/)).toHaveLength(
      10,
    );
    expect(
      screen.queryByRole("spinbutton", { name: /نقاط المرتبة/ }),
    ).toBeNull();
    expect(screen.getByTestId("ranked-list-total")).toHaveTextContent(
      "600 / 600",
    );
  });

  it("switches authoring sections without creating a new gameplay enum", () => {
    render(<QuestionForm question={question} />);
    expect(screen.queryByTestId("image-section")).toBeNull();
    fireEvent.click(screen.getByRole("combobox", { name: "نوع السؤال" }));
    fireEvent.click(screen.getByRole("option", { name: "صورة" }));
    expect(screen.getByTestId("image-section")).toBeInTheDocument();
    expect(screen.queryByTestId("audio-section")).toBeNull();
    expect(screen.queryByTestId("top10-section")).toBeNull();
  });

  it("uploads a selected image only through the explicit image action", async () => {
    const { container } = render(
      <QuestionForm
        question={{
          ...question,
          type: "image",
          primaryAsset: {
            type: "image",
            url: "/uploads/questions/images/current.webp",
            source: "admin-upload",
          },
        }}
      />,
    );
    const file = new File(["image"], "replacement.webp", {
      type: "image/webp",
    });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    expect(screen.getByText("معاينة قبل الرفع")).toBeInTheDocument();
    expect(screen.getByText("لم يتم رفع الصورة بعد.")).toBeInTheDocument();
    expect(screen.getByText(/replacement\.webp/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "لديك صورة مختارة لم يتم رفعها بعد. حفظ بيانات السؤال لن يرفعها.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "رفع الصورة" }));
    await waitFor(() =>
      expect(uploadImage).toHaveBeenCalledWith({
        id: "question-1",
        file,
      }),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps upload disabled without a file and shows a reopened stored image", () => {
    render(
      <QuestionForm
        question={{
          ...question,
          type: "image",
          primaryAsset: {
            type: "image",
            url: "/uploads/questions/images/current.webp",
            source: "admin-upload",
          },
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "رفع الصورة" })).toBeDisabled();
    expect(screen.getByText("الصورة الحالية")).toBeInTheDocument();
    expect(screen.getByAltText("الصورة الحالية للسؤال")).toHaveAttribute(
      "src",
      "/uploads/questions/images/current.webp",
    );
    expect(screen.getByLabelText("اختيار صورة السؤال")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "تغيير الصورة" }),
    ).toBeInTheDocument();
  });

  it("disables image controls while an upload is pending", () => {
    imageUploading = true;
    render(<QuestionForm question={{ ...question, type: "image" }} />);
    expect(screen.getByLabelText("اختيار صورة السؤال")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "جاري رفع الصورة..." }),
    ).toBeDisabled();
  });

  it("keeps the stored image and selected file after an upload failure", async () => {
    uploadImage.mockRejectedValueOnce(new Error("upload failed"));
    render(
      <QuestionForm
        question={{
          ...question,
          type: "image",
          primaryAsset: {
            type: "image",
            url: "/uploads/questions/images/current.webp",
            source: "admin-upload",
          },
        }}
      />,
    );
    const file = new File(["image"], "retry.webp", { type: "image/webp" });
    fireEvent.change(screen.getByLabelText("اختيار صورة السؤال"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "رفع الصورة" }));

    await waitFor(() => expect(uploadImage).toHaveBeenCalled());
    expect(screen.getByAltText("الصورة الحالية للسؤال")).toHaveAttribute(
      "src",
      "/uploads/questions/images/current.webp",
    );
    expect(screen.getByText(/retry\.webp/)).toBeInTheDocument();
  });

  it("does not upload a selected image during a regular question update", async () => {
    const { container } = render(
      <QuestionForm question={{ ...question, type: "image" }} />,
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["image"], "selected.webp", { type: "image/webp" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "تحديث السؤال" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(uploadImage).not.toHaveBeenCalled();
    expect(mutateAsync.mock.calls[0]?.[0]).not.toHaveProperty("image");
  });

  it("removes the current image through the explicit action after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    render(
      <QuestionForm
        question={{
          ...question,
          type: "image",
          primaryAsset: {
            type: "image",
            url: "/uploads/questions/images/current.webp",
            source: "admin-upload",
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "حذف الصورة" }));
    await waitFor(() => expect(removeImage).toHaveBeenCalledWith("question-1"));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText("الصورة الحالية")).toBeNull();
  });

  it("hydrates MM:SS timing and previews using current unsaved values", async () => {
    render(
      <QuestionForm
        question={{
          ...question,
          type: "video",
          requiresAudio: true,
          audioStatus: "ready",
          audioReviewStatus: "pending",
          audioRequest: {
            kind: "custom",
            searchQuery: "Saudi landmark video",
            preferredDurationSeconds: 8,
            preferredStartSeconds: 198,
            selectedCandidateId: "candidate-1",
          },
          audioAsset: {
            type: "video",
            url: "/uploads/question-assets/video/clip.mp4",
            source: "youtube",
            duration: 8,
          },
        }}
      />,
    );
    expect(screen.getByTestId("video-section")).toBeInTheDocument();
    expect(screen.getByLabelText("عبارة البحث")).toHaveValue(
      "Saudi landmark video",
    );
    expect(screen.getByLabelText("وقت بداية المقطع")).toHaveValue("03:18");
    expect(screen.getByLabelText("مدة المقطع")).toHaveValue("00:08");
    fireEvent.change(screen.getByLabelText("وقت بداية المقطع"), {
      target: { value: "01:14" },
    });
    fireEvent.change(screen.getByLabelText("مدة المقطع"), {
      target: { value: "00:10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "معاينة المقطع" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        id: "question-1",
        data: { startTimeSeconds: 74, durationSeconds: 10 },
      }),
    );
    const preview = document.querySelector("video");
    expect(preview).toHaveAttribute("controls");
    expect(preview).toHaveAttribute(
      "src",
      "/uploads/question-assets/video/clip.mp4",
    );
    expect(
      screen.getByRole("button", { name: "اختيار ملف بديل" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إزالة الفيديو" }));
    await waitFor(() =>
      expect(removeMedia).toHaveBeenCalledWith("question-1"),
    );
  });

  it("previews a manually selected video before uploading it through the explicit action", async () => {
    render(
      <QuestionForm
        question={{
          ...question,
          type: "video",
          requiresAudio: true,
          audioStatus: "ready",
          audioReviewStatus: "pending",
          audioRequest: { kind: "custom", searchQuery: "Saudi landmark video" },
        }}
      />,
    );
    const file = new File(["video"], "replacement.mp4", { type: "video/mp4" });
    fireEvent.click(screen.getByRole("button", { name: "اختيار ملف" }));
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("معاينة قبل الرفع، لم يتم رفعها بعد.")).toBeInTheDocument();
    expect(screen.getByText(/replacement\.mp4/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "رفع الفيديو" }));
    await waitFor(() => expect(uploadMedia).toHaveBeenCalledWith("question-1", file));
    expect(
      screen.queryByText("معاينة قبل الرفع، لم يتم رفعها بعد."),
    ).toBeNull();
  });

  it("keeps advanced audio search fields collapsed by default for a plain search sentence", () => {
    render(
      <QuestionForm
        question={{
          ...question,
          type: "audio",
          audioRequest: { kind: "custom", searchQuery: "بحث بسيط" },
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "خيارات بحث متقدمة" })).toBeInTheDocument();
    expect(screen.queryByLabelText("الاسم المستهدف")).toBeNull();
  });

  it("auto-expands advanced audio search fields when a question already has them filled in", () => {
    render(
      <QuestionForm
        question={{
          ...question,
          type: "audio",
          audioRequest: {
            kind: "custom",
            searchQuery: "بحث بسيط",
            targetName: "Youtube",
          },
        }}
      />,
    );
    expect(screen.getByLabelText("الاسم المستهدف")).toHaveValue("Youtube");
  });

  it("shows optional media as a non-blocking warning on an approved question", () => {
    render(
      <QuestionForm
        question={{
          ...question,
          type: "audio",
          status: "approved",
          effectivePresentationType: "text",
          mediaAvailable: false,
          mediaFallbackReason: "PROCESSING",
          audioStatus: "processing",
          audioReviewStatus: "pending",
          audioRequest: {
            kind: "custom",
            searchQuery: "optional audio",
          },
        }}
      />,
    );
    expect(
      screen.getByText(
        "الوسائط اختيارية. إذا لم تكن جاهزة سيظهر السؤال نصيًا فقط.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("السؤال معتمد، لكن الوسائط لن تظهر حتى تصبح جاهزة."),
    ).toBeInTheDocument();
  });

  it("does not treat server-owned media identity fields as an editable request change", () => {
    const editable = {
      kind: "custom" as const,
      searchQuery: " Saudi   landmark video ",
      preferredDurationSeconds: 10,
      preferredStartSeconds: 74,
    };
    const persisted = {
      ...editable,
      searchQuery: "Saudi landmark video",
      requestVersion: 3,
      requestHash: "server-owned-hash",
      requestedAt: "2026-07-24T00:00:00.000Z",
      selectedCandidateId: "candidate-1",
    } as NonNullable<Question["audioRequest"]>;
    expect(mediaRequestFingerprint(editable)).toBe(
      mediaRequestFingerprint(persisted),
    );
  });

  it("adds, edits, and removes reviewable alias chips", () => {
    render(<QuestionForm question={question} />);
    const input = screen.getByPlaceholderText("اكتب اسماً مقبولاً");
    fireEvent.change(input, { target: { value: "بديل" } });
    fireEvent.click(screen.getByRole("button", { name: "إضافة" }));
    const edit = screen.getByLabelText("تعديل الاسم المقبول 1");
    fireEvent.change(edit, { target: { value: "بديل معدل" } });
    expect(edit).toHaveValue("بديل معدل");
    fireEvent.click(screen.getByLabelText("حذف بديل معدل"));
    expect(screen.queryByLabelText("تعديل الاسم المقبول 1")).toBeNull();
  });

  it("merges generated aliases without normalized duplicates", () => {
    expect(
      mergeAcceptedAnswers(
        ["السعودية", "KSA"],
        ["السُّعُودِيَّة", "ksa", "Saudi Arabia"],
      ),
    ).toEqual(["السعودية", "KSA", "Saudi Arabia"]);
  });

  it("generates one answer and keeps it reviewable", async () => {
    mutateAsync.mockResolvedValueOnce({
      aliases: [
        {
          value: "البديل",
          language: "ar",
          reason: "اسم مختصر",
          confidence: "high",
        },
      ],
      warnings: [],
    });
    render(<QuestionForm question={question} />);
    fireEvent.click(
      screen.getByRole("button", { name: "توليد الإجابات المقبولة" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("تعديل الاسم المقبول 1")).toHaveValue(
        "البديل",
      ),
    );
  });

  it("marks every ranked row identified by a deterministic conflict", () => {
    const entries = createDefaultRankedListEntries();
    render(
      <RankedListEditor
        entries={entries}
        onChange={vi.fn()}
        rowWarnings={{ 0: ["تعارض"], 1: ["تعارض"] }}
      />,
    );
    expect(screen.getByTestId("ranked-list-row-1")).toHaveAttribute(
      "data-invalid",
      "true",
    );
    expect(screen.getByTestId("ranked-list-row-2")).toHaveAttribute(
      "data-invalid",
      "true",
    );
  });

  it("protects navigation when changes are unsaved", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(confirmUnsavedChanges(true)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(UNSAVED_CHANGES_MESSAGE);
    confirm.mockRestore();
  });
});
