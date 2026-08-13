/**
 * Reading authored World Content text.
 *
 * Prompts, option labels and alt text are authored as localized objects
 * (`{ ar: "…" }`), and a mechanic runtime republishes whatever the author wrote
 * rather than flattening it — so the client is where a language is chosen. A
 * component that treats one of these as a string renders an object as a React
 * child and takes the whole gameplay screen down with it.
 *
 * Arabic is the product language, so it wins; anything else present is a
 * fallback rather than a choice.
 */
export type AuthoredText = string | { ar?: string; en?: string } | null | undefined;

export function authoredText(value: AuthoredText, fallback = ""): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return fallback;
  const arabic = typeof value.ar === "string" ? value.ar.trim() : "";
  if (arabic) return arabic;
  const english = typeof value.en === "string" ? value.en.trim() : "";
  if (english) return english;
  // Some other locale key, authored before this one existed.
  const first = Object.values(value).find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  return first?.trim() ?? fallback;
}
