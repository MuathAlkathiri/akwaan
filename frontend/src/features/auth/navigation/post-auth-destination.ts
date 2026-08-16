const STORAGE_KEY = "akwaan:post-auth-destination";

/**
 * Persist only an application-local path. This is deliberately session-scoped:
 * it resumes the flow in this tab without becoming an open redirect contract.
 */
export function rememberPostAuthDestination(path: string): void {
  if (typeof window === "undefined" || !isSafeInternalPath(path)) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    // Authentication still works when browser storage is unavailable.
  }
}

export function consumePostAuthDestination(fallback = "/"): string {
  if (typeof window === "undefined") return fallback;
  try {
    const path = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    return path && isSafeInternalPath(path) ? path : fallback;
  } catch {
    return fallback;
  }
}

export function isSafeInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

export const POST_AUTH_DESTINATION_STORAGE_KEY = STORAGE_KEY;
