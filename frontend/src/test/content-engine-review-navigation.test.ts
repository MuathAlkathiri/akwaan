import { afterEach, describe, expect, it } from "vitest";
import {
  adjacentCandidates,
  isShortcutBlockedTarget,
} from "@/features/content-engine-review/review-navigation";
import { candidateStatusPresentation } from "@/features/content-engine-review/job-status-helpers";

describe("adjacentCandidates", () => {
  const queue = ["a", "b", "c"];

  it("returns neighbours of a selection in the queue", () => {
    expect(adjacentCandidates(queue, "b")).toEqual({
      index: 1,
      previousId: "a",
      nextId: "c",
    });
  });

  it("has no previous at the start and no next at the end", () => {
    expect(adjacentCandidates(queue, "a").previousId).toBeUndefined();
    expect(adjacentCandidates(queue, "c").nextId).toBeUndefined();
  });

  it("offers the first candidate when nothing is selected", () => {
    expect(adjacentCandidates(queue, undefined)).toEqual({ index: -1, nextId: "a" });
  });

  it("continues from where a decided candidate left the queue", () => {
    // "b" was at index 1 and dropped out of the filtered queue after a decision.
    expect(adjacentCandidates(["a", "c"], "b", 1)).toEqual({
      index: -1,
      previousId: "a",
      nextId: "c",
    });
  });

  it("starts at the queue head for a linked candidate never seen in it", () => {
    expect(adjacentCandidates(queue, "elsewhere")).toEqual({
      index: -1,
      previousId: undefined,
      nextId: "a",
    });
  });

  it("handles an empty queue", () => {
    expect(adjacentCandidates([], "a", 3)).toEqual({
      index: -1,
      previousId: undefined,
      nextId: undefined,
    });
  });
});

describe("isShortcutBlockedTarget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const mount = (html: string) => {
    document.body.innerHTML = html;
    return document.body;
  };

  it.each([
    ["a text input", "<input id='t' />"],
    ["a textarea", "<textarea id='t'></textarea>"],
    ["a select", "<select id='t'><option>x</option></select>"],
    ["a button", "<button id='t'>x</button>"],
    ["a link", "<a id='t' href='#x'>x</a>"],
    ["a disclosure summary", "<details><summary id='t'>x</summary></details>"],
    ["a contenteditable region", "<div id='t' contenteditable='true'>x</div>"],
    ["a custom checkbox", "<button role='checkbox' id='t'></button>"],
    ["an element inside a custom checkbox", "<div role='checkbox'><span id='t'>x</span></div>"],
    ["anything inside a dialog", "<div role='dialog'><p id='t'>x</p></div>"],
  ])("blocks shortcuts from %s", (_label, html) => {
    mount(html);
    expect(isShortcutBlockedTarget(document.getElementById("t"))).toBe(true);
  });

  it.each([
    ["the page body", () => document.body],
    ["a focused heading", () => document.getElementById("h")],
    ["plain text", () => document.getElementById("p")],
    ["a non-interactive landmark", () => document.getElementById("r")],
  ])("allows shortcuts from %s", (_label, pick) => {
    mount(
      "<h2 id='h' tabindex='-1'>q</h2><p id='p'>t</p><div role='region'><span id='r'>x</span></div>",
    );
    expect(isShortcutBlockedTarget(pick())).toBe(false);
  });

  it("allows shortcuts with no target", () => {
    expect(isShortcutBlockedTarget(null)).toBe(false);
  });
});

describe("candidateStatusPresentation", () => {
  const base = { status: "awaiting_review", reviewStatus: "pending", publishedContentItemId: null };

  it("presents a reviewable candidate as awaiting review", () => {
    expect(candidateStatusPresentation(base)).toMatchObject({
      label: "بانتظار المراجعة",
      needsDecision: true,
    });
  });

  it("lets a human decision outrank the pipeline status", () => {
    expect(candidateStatusPresentation({ ...base, reviewStatus: "approved" })).toMatchObject({
      label: "معتمد",
      needsDecision: false,
    });
    expect(candidateStatusPresentation({ ...base, reviewStatus: "rejected" })).toMatchObject({
      label: "مرفوض",
      needsDecision: false,
    });
  });

  it("lets a created draft outrank everything", () => {
    expect(
      candidateStatusPresentation({
        ...base,
        reviewStatus: "approved",
        publishedContentItemId: "item-1",
      }),
    ).toMatchObject({ label: "أُنشئت المسودة", needsDecision: false });
  });

  it("keeps terminal pipeline outcomes visible and out of the decision count", () => {
    expect(candidateStatusPresentation({ ...base, status: "screened_reject" })).toMatchObject({
      label: "مرفوض آلياً",
      needsDecision: false,
    });
    expect(candidateStatusPresentation({ ...base, status: "generation_failed" })).toMatchObject({
      needsDecision: false,
    });
  });

  it("keeps fact-blocked candidates in the decision count", () => {
    expect(candidateStatusPresentation({ ...base, status: "fact_blocked" })).toMatchObject({
      label: "تعثّر التحقق من الحقائق",
      needsDecision: true,
    });
  });
});
