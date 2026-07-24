const stripTrailingSlash = (value: string) => value.replace(/\/$/, "");

export const runtimeConfig = Object.freeze({
  apiBaseUrl: stripTrailingSlash(
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
  ),
});
