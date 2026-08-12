import { Fragment } from "react";

/**
 * Arabic text with Latin or numeric runs inside it, rendered the way it was written.
 *
 * Arabic is right-to-left and digits are left-to-right, so the Unicode bidi algorithm
 * has to guess where one direction ends and the other begins. On a hyphenated range
 * it guesses wrong: `موسم 2003-04` renders as `موسم 04-2003`, silently reversing a
 * season, a score, or a version in front of a room of players. Nothing throws and
 * nothing looks broken — it is simply the wrong number.
 *
 * The fix is isolation, not a `dir` on the paragraph: each Latin/numeric run becomes
 * its own LTR island, so the surrounding Arabic keeps flowing right-to-left and the
 * run keeps its own order. Splitting the runs out is what makes it work for text
 * that mixes both, which authored content routinely does.
 *
 * Used everywhere authored content, a score, a range, or a version is printed inside
 * Arabic copy. Purely numeric UI — a countdown, a score tile — uses `.akwaan-numeral`,
 * which applies the same isolation plus tabular figures.
 */

/**
 * A run of Latin letters, digits and the punctuation that binds them together
 * (`-`, `/`, `:`, `.`, `,`, `–`, `+`, `%`, `×`), so `2003-04`, `3/4`, `12:30`,
 * `v1.2` and `EPL 2024` each stay one island instead of fragmenting.
 */
const LTR_RUN = /[A-Za-z0-9][A-Za-z0-9\s\-/:.,–+%×_]*[A-Za-z0-9%]|[A-Za-z0-9]/g;

/** The isolated pieces of a string, in order. */
export function bidiSegments(
  text: string,
): Array<{ text: string; ltr: boolean }> {
  const segments: Array<{ text: string; ltr: boolean }> = [];
  let cursor = 0;
  for (const match of text.matchAll(LTR_RUN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), ltr: false });
    }
    segments.push({ text: match[0], ltr: true });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), ltr: false });
  }
  return segments;
}

export function BidiText({
  children,
  className,
}: {
  children: string | number | null | undefined;
  className?: string;
}) {
  const text = children === null || children === undefined ? "" : String(children);
  const segments = bidiSegments(text);
  // No mixed content: render it plainly rather than wrapping every string in a span.
  if (!segments.some((segment) => segment.ltr)) {
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  }
  return (
    <span className={className}>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {segment.ltr ? (
            // `dir` plus isolation: `dir` alone still lets the run participate in the
            // surrounding paragraph's ordering.
            <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
              {segment.text}
            </span>
          ) : (
            segment.text
          )}
        </Fragment>
      ))}
    </span>
  );
}
