import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosHeaders } from "axios";
import apiClient from "@/lib/api/client";
import { orvalMutator } from "@/api/orval-mutator";

vi.mock("@/lib/api/client", () => ({
  default: { request: vi.fn() },
}));

describe("orvalMutator multipart handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.request).mockResolvedValue({ data: { ok: true } });
  });

  it("lets the browser add the multipart boundary for FormData", async () => {
    const data = new FormData();
    data.append("file", new File(["image"], "question.png"));

    await orvalMutator({
      url: "/admin/questions/question-1/media/image",
      method: "POST",
      data,
      headers: { "Content-Type": "multipart/form-data" },
    });

    expect(apiClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ data }),
    );
    const request = vi.mocked(apiClient.request).mock.calls[0]?.[0];
    expect(
      (request?.headers as AxiosHeaders).get("Content-Type"),
    ).toBeUndefined();
  });

  it("preserves FormData object in the request", async () => {
    const data = new FormData();
    data.append("file", new File(["audio"], "question.mp3"));

    await orvalMutator({
      url: "/admin/questions/question-1/audio/upload",
      method: "POST",
      data,
      headers: { "Content-Type": "multipart/form-data" },
    });

    const request = vi.mocked(apiClient.request).mock.calls[0]?.[0];
    expect(request?.data).toBeInstanceOf(FormData);
    expect((request?.data as FormData).get("file")).toBeInstanceOf(File);
  });

  it("preserves JSON requests with correct Content-Type", async () => {
    const data = { question: "test", category: "science" };

    await orvalMutator({
      url: "/questions",
      method: "POST",
      data,
      headers: { "Content-Type": "application/json" },
    });

    const request = vi.mocked(apiClient.request).mock.calls[0]?.[0];
    expect(request?.data).toEqual(data);
    // The Content-Type should be preserved for JSON
    expect(
      (request?.headers as AxiosHeaders).get("Content-Type"),
    ).toBe("application/json");
  });

  it("merges headers from options over config headers", async () => {
    const data = new FormData();
    data.append("file", new File(["image"], "test.png"));

    await orvalMutator(
      {
        url: "/admin/questions/question-1/media/image",
        method: "POST",
        data,
        headers: { "Content-Type": "multipart/form-data" },
      },
      {
        headers: { "X-Custom": "value" },
      },
    );

    const request = vi.mocked(apiClient.request).mock.calls[0]?.[0];
    expect((request?.headers as AxiosHeaders).get("X-Custom")).toBe("value");
    expect(
      (request?.headers as AxiosHeaders).get("Content-Type"),
    ).toBeUndefined();
  });
});
