import {
  AxiosHeaders,
  type AxiosRequestConfig,
  type RawAxiosHeaders,
} from "axios";
import apiClient from "@/lib/api/client";

/**
 * Orval transport adapter. It deliberately returns the documented HTTP body,
 * including any API envelope, and delegates auth/error behavior to apiClient.
 * 
 * Handles FormData specially: removes explicit Content-Type headers to allow
 * the browser/Axios to add the correct multipart boundary.
 */
export async function orvalMutator<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  // Merge headers with options taking precedence
  const headers = AxiosHeaders.from({
    ...config.headers,
    ...options?.headers,
  } as RawAxiosHeaders);

  // For FormData requests, remove explicit Content-Type header
  // The request interceptor will handle this, but we remove it here too
  // to ensure the generated Orval "multipart/form-data" header doesn't interfere
  const data = options?.data ?? config.data;
  if (typeof FormData !== "undefined" && data instanceof FormData) {
    headers.delete("Content-Type");
  }

  const response = await apiClient.request<T>({
    ...config,
    ...options,
    headers,
    data,
  });

  return response.data;
}
