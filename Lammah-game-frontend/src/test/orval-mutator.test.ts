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
});
