import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "@/features/content-engine-review/api";
import { MediaLibraryPanel } from "@/features/content-engine-review/media-library-panel";
import type { MediaLibraryEntry } from "@/features/content-engine-review/types";

const entry = (over: Partial<MediaLibraryEntry> = {}): MediaLibraryEntry => ({
  id: "entry-1",
  name: "Leicester City F.C.",
  nameAr: "ليستر سيتي",
  aliases: [],
  kind: "club-or-brand-mark",
  asset: { url: "/uploads/x.png", mimetype: "image/png", width: 600, height: 600, sha256: "a" },
  createdByEmail: "admin@example.test",
  createdAt: null,
  ...over,
});

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MediaLibraryPanel />
    </QueryClientProvider>,
  );
}

describe("Media library panel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("says the library is empty before anything is uploaded", async () => {
    vi.spyOn(api, "listMediaLibrary").mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByTestId("media-library-empty")).toBeInTheDocument();
  });

  it("lists what is in the library, by its Arabic name", async () => {
    vi.spyOn(api, "listMediaLibrary").mockResolvedValue([entry()]);
    renderPanel();
    const card = await screen.findByTestId("media-library-entry");
    expect(within(card).getByText("ليستر سيتي")).toBeInTheDocument();
    expect(within(card).getByText("Leicester City F.C.")).toBeInTheDocument();
    expect(within(card).getByText("شعار نادي أو علامة")).toBeInTheDocument();
  });

  it("uploads a picture under the names given, as a crest unless told otherwise", async () => {
    vi.spyOn(api, "listMediaLibrary").mockResolvedValue([]);
    const add = vi.spyOn(api, "addMediaLibraryEntry").mockResolvedValue(entry());
    renderPanel();
    const submit = await screen.findByRole("button", { name: "أضف للمكتبة" });
    // Nothing to send yet.
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Leicester City F.C."), {
      target: { value: "Leicester City F.C." },
    });
    fireEvent.change(screen.getByPlaceholderText("ليستر سيتي"), {
      target: { value: "ليستر سيتي" },
    });
    const file = new File(["png"], "crest.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("ملف صورة للمكتبة"), { target: { files: [file] } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith(
        { name: "Leicester City F.C.", nameAr: "ليستر سيتي", aliases: "", kind: "club-or-brand-mark" },
        file,
      ),
    );
  });

  it("explains a refused duplicate in plain words", async () => {
    vi.spyOn(api, "listMediaLibrary").mockResolvedValue([]);
    vi.spyOn(api, "addMediaLibraryEntry").mockRejectedValue(
      Object.assign(new Error("conflict"), {
        response: { status: 409, data: { code: "MEDIA_LIBRARY_SUBJECT_EXISTS", message: "exists" } },
      }),
    );
    renderPanel();
    fireEvent.change(await screen.findByPlaceholderText("Leicester City F.C."), {
      target: { value: "Leicester City FC" },
    });
    fireEvent.change(screen.getByLabelText("ملف صورة للمكتبة"), {
      target: { files: [new File(["png"], "c.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "أضف للمكتبة" }));
    expect(await screen.findByTestId("media-library-error")).toHaveTextContent(
      "هذا الاسم موجود في المكتبة",
    );
  });

  it("deletes an entry only after the Admin confirms", async () => {
    vi.spyOn(api, "listMediaLibrary").mockResolvedValue([entry()]);
    const remove = vi.spyOn(api, "removeMediaLibraryEntry").mockResolvedValue({ id: "entry-1" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel();
    const card = await screen.findByTestId("media-library-entry");
    fireEvent.click(within(card).getByRole("button", { name: "حذف" }));
    expect(remove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(within(card).getByRole("button", { name: "حذف" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("entry-1"));
  });
});
