import {
  AxiosHeaders,
  type AxiosRequestConfig,
  type RawAxiosHeaders,
} from "axios";
import apiClient from "@/lib/api/client";

/**
 * Orval transport adapter. It deliberately returns the documented HTTP body,
 * including any API envelope, and delegates auth/error behavior to apiClient.
 */
export async function orvalMutator<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  const headers = AxiosHeaders.from({
    ...config.headers,
    ...options?.headers,
  } as RawAxiosHeaders);
  const data = options?.data ?? config.data;
  if (typeof FormData !== "undefined" && data instanceof FormData) {
    headers.delete("Content-Type");
  }
  const response = await apiClient.request<T>({
    ...config,
    ...options,
    headers,
  });

  return response.data;
}
