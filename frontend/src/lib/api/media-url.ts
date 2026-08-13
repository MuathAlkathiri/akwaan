import { runtimeConfig } from "@/config/runtime-config";

export function getMediaUrl(url?: string | null) {
  const value = url?.trim();
  if (!value) return "";
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;

  try {
    const backendOrigin = new URL(runtimeConfig.apiBaseUrl).origin;
    return new URL(value.replace(/^\/+/, ""), `${backendOrigin}/`).toString();
  } catch {
    return "";
  }
}
