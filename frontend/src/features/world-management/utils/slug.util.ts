// The backend World Content slug field only accepts ASCII a-z/0-9/hyphens
// (unlike the legacy category slug, which also allows Arabic characters), so
// Arabic-only names fall back to a generated placeholder slug.
export function slugify(name: string, fallbackPrefix = "item"): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `${fallbackPrefix}-${Date.now()}`;
}
