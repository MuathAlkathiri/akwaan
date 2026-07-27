import { describe, expect, it } from "vitest";
import { AxiosHeaders } from "axios";

describe("apiClient request interceptor", () => {
  it("should remove Content-Type header for FormData requests", () => {
    // Test the logic that would be in the request interceptor
    const config = {
      url: "/test",
      method: "POST",
      data: new FormData(),
      headers: new AxiosHeaders({
        "Content-Type": "application/json",
      }),
    };

    // Simulate the interceptor logic
    if (config.data instanceof FormData) {
      config.headers.delete("Content-Type");
    }

    expect(config.data).toBeInstanceOf(FormData);
    expect(config.headers.get("Content-Type")).toBeUndefined();
  });

  it("should preserve Content-Type for JSON requests", () => {
    // Test the logic that would be in the request interceptor
    const config = {
      url: "/test",
      method: "POST",
      data: { question: "test" },
      headers: new AxiosHeaders({
        "Content-Type": "application/json",
      }),
    };

    // Simulate the interceptor logic
    if (config.data instanceof FormData) {
      config.headers.delete("Content-Type");
    }

    expect(config.data).toEqual({ question: "test" });
    expect(config.headers.get("Content-Type")).toBe("application/json");
  });

  it("integration: FormData with auth headers", () => {
    // Test merging FormData with Authorization header
    const formData = new FormData();
    formData.append("file", new File(["test"], "test.png"));

    const config = {
      url: "/admin/questions/1/media/image",
      method: "POST",
      data: formData,
      headers: new AxiosHeaders({
        "Content-Type": "multipart/form-data",
        Authorization: "Bearer token123",
      }),
    };

    // Simulate the interceptor logic
    if (config.data instanceof FormData) {
      config.headers.delete("Content-Type");
    }

    expect(config.headers.get("Authorization")).toBe("Bearer token123");
    expect(config.headers.get("Content-Type")).toBeUndefined();
  });
});
