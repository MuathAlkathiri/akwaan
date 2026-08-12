import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

/**
 * The copy rules that were being broken one screen at a time.
 *
 * Each of these shipped: two numeral systems on one screen, an emoji beside a user's
 * name, "the server" in a sentence read aloud to a room, a team addressed as one
 * person. None of them is catchable by a type, and all of them are catchable by a
 * grep — so they are grepped, once, here.
 */
const ROOT = resolve(process.cwd(), "src");

function sourceFiles(directory = ROOT): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      // Tests describe the defects in prose, so they are not held to the rules.
      return entry === "test" || entry === "__tests__" ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

const FILES = sourceFiles();
const relative = (path: string) => path.slice(resolve(process.cwd()).length + 1);

/**
 * The lines of a file that are copy rather than prose about the code, keeping each
 * line's real number so a failure points at the right place.
 */
function copyLines(source: string): Array<{ text: string; number: number }> {
  return source
    .split("\n")
    .map((text, index) => ({ text, number: index + 1 }))
    .filter(({ text }) => {
      const trimmed = text.trimStart();
      return (
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("/*")
      );
    });
}

describe("one numeral system, everywhere", () => {
  it("uses Western digits — no Arabic-Indic numerals in any surface", () => {
    // "السؤال 1 من 3" beside "ثانية ٥" on one screen is harder to read than either
    // system alone. Western digits win because scores and counters are already in
    // them; the choice matters less than making it once.
    const offenders = FILES.flatMap((path) =>
      copyLines(readFileSync(path, "utf8"))
        .filter(({ text }) => /[٠-٩]/.test(text))
        .map(({ number }) => `${relative(path)}:${number}`),
    );
    expect(offenders).toEqual([]);
  });

  it("routes numerals through the one shared utility rather than per-component CSS", () => {
    // `.akwaan-numeral` is tabular *and* LTR-isolated. A component that sets
    // `tabular-nums` itself gets the figures right and the direction wrong.
    const offenders = FILES.flatMap((path) => {
      // The legacy classic game predates the utility and is not player-facing.
      if (relative(path).startsWith("src/legacy/")) return [];
      return copyLines(readFileSync(path, "utf8"))
        .filter(
          ({ text }) => /tabular-nums/.test(text) && !/akwaan-numeral/.test(text),
        )
        .map(({ number }) => `${relative(path)}:${number}`);
    });
    expect(offenders).toEqual([]);
  });
});

describe("no engineering vocabulary in player-facing copy", () => {
  const PLAYER_FACING = [
    "src/features/live-game-session",
    "src/features/match-setup",
    "src/features/worlds",
  ];
  // Words that name our internals. A player cannot act on any of them, and reading
  // one out to a room is the tell that nobody wrote the sentence for players.
  const LEAKS = ["الخادم", "السيرفر", "payload", "socket", "revision", "snapshot"];

  it("keeps our internals out of the words on screen", () => {
    const offenders: string[] = [];
    for (const path of FILES.filter((candidate) =>
      PLAYER_FACING.some((prefix) => relative(candidate).startsWith(prefix)),
    )) {
      // Identifiers are fine; the Arabic words are what end up on a screen.
      const arabicLeaks = LEAKS.filter((word) => /[؀-ۿ]/.test(word));
      for (const { text, number } of copyLines(readFileSync(path, "utf8"))) {
        if (arabicLeaks.some((word) => text.includes(word))) {
          offenders.push(`${relative(path)}:${number}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("teams are addressed as teams", () => {
  it("uses the plural, because a team is more than one person", () => {
    // "أثق بإجابته" spoke to one player about one player. Every team-facing string is
    // plural: "نثق بإجابتكم", "دوركم الآن", "اختاروا".
    const singulars = ["بإجابته", "دورك الآن", "اختر تحديًا", "فريقك جاهز"];
    const offenders: string[] = [];
    for (const path of FILES) {
      for (const { text, number } of copyLines(readFileSync(path, "utf8"))) {
        if (singulars.some((phrase) => text.includes(phrase))) {
          offenders.push(`${relative(path)}:${number}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("no emoji in the interface", () => {
  it("carries state with icons and words rather than pictographs", () => {
    // "test مرحبًا بك 👋" was a placeholder and an emoji in one line. Typographic
    // marks (✓ / ✗) stay: they pair with colour so state is never colour alone.
    const PICTOGRAPH = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}\u{1F900}-\u{1F9FF}]/u;
    const offenders: string[] = [];
    for (const path of FILES) {
      for (const { text, number } of copyLines(readFileSync(path, "utf8"))) {
        if (PICTOGRAPH.test(text)) offenders.push(`${relative(path)}:${number}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
