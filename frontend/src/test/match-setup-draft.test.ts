import { beforeEach, describe, expect, it } from "vitest";
import {
  BOARD_POSITION_COUNT,
  OCCURRENCE_COUNT,
  SCOPES_PER_OCCURRENCE,
  completedOccurrenceCount,
  createDraft,
  isDraftComplete,
  isOccurrenceComplete,
  matchSetupReducer,
  selectedScopeTotal,
  toCreateUnifiedMatchRequest,
  type MatchSetupAction,
  type MatchSetupDraft,
} from "@/features/match-setup";
import {
  MATCH_SETUP_DRAFT_STORAGE_KEY,
  clearStoredDraft,
  readStoredDraft,
  writeStoredDraft,
} from "@/features/match-setup";

const ANIME = "world-anime";
const FOOTBALL = "world-football";
const ANIME_POOL = ["naruto", "bleach", "one-piece", "aot"];
const ANIME_POOL_2 = ["death-note", "jujutsu", "demon-slayer", "hxh"];
const FOOTBALL_POOL = ["world-cup", "epl", "spl", "ucl"];

const apply = (draft: MatchSetupDraft, ...actions: MatchSetupAction[]) =>
  actions.reduce(matchSetupReducer, draft);

/** Configures one occurrence exactly the way the wizard does. */
const configure = (
  draft: MatchSetupDraft,
  occurrenceIndex: number,
  worldId: string,
  scopeIds: string[],
) =>
  apply(
    draft,
    { type: "choose-world", occurrenceIndex, worldId },
    ...scopeIds.map(
      (scopeId) =>
        ({ type: "toggle-scope", occurrenceIndex, scopeId }) as MatchSetupAction,
    ),
    { type: "confirm-scopes" },
  );

/** The product contract's own example: Anime, Football, Anime again. */
const fullDraft = () =>
  configure(
    configure(configure(createDraft(), 0, ANIME, ANIME_POOL), 1, FOOTBALL, FOOTBALL_POOL),
    2,
    ANIME,
    ANIME_POOL_2,
  );

describe("match setup draft", () => {
  it("starts on the first occurrence's World step", () => {
    const draft = createDraft();
    expect(draft.activeOccurrenceIndex).toBe(0);
    expect(draft.activeStep).toBe("world");
    expect(draft.occurrences).toHaveLength(OCCURRENCE_COUNT);
    expect(draft.occurrences.every((entry) => entry.worldId === null)).toBe(true);
    expect(isDraftComplete(draft)).toBe(false);
  });

  it("opens the Scope step as soon as a World is chosen", () => {
    const draft = apply(createDraft(), {
      type: "choose-world",
      occurrenceIndex: 0,
      worldId: ANIME,
    });
    expect(draft.activeStep).toBe("scopes");
    expect(draft.activeOccurrenceIndex).toBe(0);
    expect(draft.occurrences[0].worldId).toBe(ANIME);
  });

  it("requires exactly four Scopes before an occurrence is complete", () => {
    let draft = apply(createDraft(), {
      type: "choose-world",
      occurrenceIndex: 0,
      worldId: ANIME,
    });
    for (const [index, scopeId] of ANIME_POOL.entries()) {
      draft = apply(draft, { type: "toggle-scope", occurrenceIndex: 0, scopeId });
      expect(isOccurrenceComplete(draft.occurrences[0])).toBe(index === 3);
      // Three is never a valid final configuration.
      expect(isDraftComplete(draft)).toBe(false);
    }
    expect(draft.occurrences[0].selectedScopeIds).toEqual(ANIME_POOL);
  });

  it("refuses a fifth Scope until one is released", () => {
    let draft = configure(createDraft(), 0, ANIME, ANIME_POOL);
    draft = apply(draft, {
      type: "toggle-scope",
      occurrenceIndex: 0,
      scopeId: "one-punch",
    });
    expect(draft.occurrences[0].selectedScopeIds).toEqual(ANIME_POOL);
    expect(draft.occurrences[0].selectedScopeIds).toHaveLength(
      SCOPES_PER_OCCURRENCE,
    );

    // Release one, and the fifth becomes takeable.
    draft = apply(
      draft,
      { type: "toggle-scope", occurrenceIndex: 0, scopeId: "bleach" },
      { type: "toggle-scope", occurrenceIndex: 0, scopeId: "one-punch" },
    );
    expect(draft.occurrences[0].selectedScopeIds).toEqual([
      "naruto",
      "one-piece",
      "aot",
      "one-punch",
    ]);
  });

  it("cannot select the same Scope twice", () => {
    const draft = apply(
      createDraft(),
      { type: "choose-world", occurrenceIndex: 0, worldId: ANIME },
      { type: "toggle-scope", occurrenceIndex: 0, scopeId: "naruto" },
      { type: "toggle-scope", occurrenceIndex: 0, scopeId: "naruto" },
    );
    // The second tap released it rather than duplicating it.
    expect(draft.occurrences[0].selectedScopeIds).toEqual([]);
  });

  it("clears the Scopes when the occurrence's World changes", () => {
    let draft = configure(createDraft(), 0, ANIME, ANIME_POOL);
    draft = apply(draft, {
      type: "choose-world",
      occurrenceIndex: 0,
      worldId: FOOTBALL,
    });
    expect(draft.occurrences[0].worldId).toBe(FOOTBALL);
    expect(draft.occurrences[0].selectedScopeIds).toEqual([]);
    expect(draft.activeStep).toBe("scopes");
  });

  it("keeps the Scopes when the same World is re-picked", () => {
    let draft = configure(createDraft(), 0, ANIME, ANIME_POOL);
    draft = apply(draft, {
      type: "choose-world",
      occurrenceIndex: 0,
      worldId: ANIME,
    });
    expect(draft.occurrences[0].selectedScopeIds).toEqual(ANIME_POOL);
  });

  it("leaves the later occurrences alone when an earlier World changes", () => {
    let draft = fullDraft();
    draft = apply(draft, {
      type: "choose-world",
      occurrenceIndex: 0,
      worldId: FOOTBALL,
    });
    expect(draft.occurrences[0].selectedScopeIds).toEqual([]);
    // Only the changed occurrence loses its pool.
    expect(draft.occurrences[1].selectedScopeIds).toEqual(FOOTBALL_POOL);
    expect(draft.occurrences[2].selectedScopeIds).toEqual(ANIME_POOL_2);
    expect(completedOccurrenceCount(draft)).toBe(2);
  });

  it("accepts the same World at more than one occurrence", () => {
    const draft = fullDraft();
    expect(draft.occurrences.map((entry) => entry.worldId)).toEqual([
      ANIME,
      FOOTBALL,
      ANIME,
    ]);
    expect(isDraftComplete(draft)).toBe(true);
  });

  it("keeps repeated occurrences of one World on independent Scope arrays", () => {
    const draft = fullDraft();
    expect(draft.occurrences[0].selectedScopeIds).toEqual(ANIME_POOL);
    expect(draft.occurrences[2].selectedScopeIds).toEqual(ANIME_POOL_2);
    expect(draft.occurrences[0].selectedScopeIds).not.toEqual(
      draft.occurrences[2].selectedScopeIds,
    );

    // Editing one Anime occurrence must not touch the other.
    const edited = apply(draft, {
      type: "toggle-scope",
      occurrenceIndex: 2,
      scopeId: "hxh",
    });
    expect(edited.occurrences[2].selectedScopeIds).toHaveLength(3);
    expect(edited.occurrences[0].selectedScopeIds).toEqual(ANIME_POOL);
  });

  it("walks to the next unconfigured occurrence, then directly to teams", () => {
    let draft = configure(createDraft(), 0, ANIME, ANIME_POOL);
    expect(draft).toMatchObject({ activeOccurrenceIndex: 1, activeStep: "world" });
    draft = configure(draft, 1, FOOTBALL, FOOTBALL_POOL);
    expect(draft).toMatchObject({ activeOccurrenceIndex: 2, activeStep: "world" });
    draft = configure(draft, 2, ANIME, ANIME_POOL_2);
    expect(draft.activeStep).toBe("teams");
  });

  it("does not enter teams when the active occurrence is incomplete", () => {
    const draft = apply(
      createDraft(),
      { type: "choose-world", occurrenceIndex: 0, worldId: ANIME },
      ...ANIME_POOL.slice(0, 3).map(
        (scopeId) =>
          ({ type: "toggle-scope", occurrenceIndex: 0, scopeId }) as MatchSetupAction,
      ),
      { type: "confirm-scopes" },
    );
    expect(draft.activeStep).toBe("scopes");
    expect(isDraftComplete(draft)).toBe(false);
  });

  it("steps back through the wizard without losing valid state", () => {
    const complete = fullDraft();
    expect(complete.activeStep).toBe("teams");
    // Team Back is route navigation owned by the wizard, not a reducer rewind.
    expect(apply(complete, { type: "back" })).toEqual(complete);

    let draft = configure(createDraft(), 0, ANIME, ANIME_POOL);
    draft = apply(draft, { type: "back" });
    expect(draft).toMatchObject({ activeOccurrenceIndex: 0, activeStep: "scopes" });
    expect(isDraftComplete(draft)).toBe(false);
    // The very first World step has nowhere to go back to.
    const first = apply(createDraft(), { type: "back" });
    expect(first).toMatchObject({ activeOccurrenceIndex: 0, activeStep: "world" });
  });

  it("empties one occurrence on request and only that one", () => {
    const draft = apply(fullDraft(), {
      type: "clear-occurrence",
      occurrenceIndex: 1,
    });
    expect(draft.occurrences[1]).toMatchObject({
      worldId: null,
      selectedScopeIds: [],
    });
    expect(draft.occurrences[0].selectedScopeIds).toEqual(ANIME_POOL);
    expect(draft.occurrences[2].selectedScopeIds).toEqual(ANIME_POOL_2);
    expect(draft).toMatchObject({ activeOccurrenceIndex: 1, activeStep: "world" });
  });

  it("sends the host back to the occurrence the server rejected", () => {
    const draft = apply(fullDraft(), {
      type: "report-issue",
      occurrenceIndex: 1,
      message: "العالم الثاني: هذا العالم لم يعد متاحًا.",
      code: "MATCH_WORLD_NOT_ACTIVE",
    });
    expect(draft).toMatchObject({ activeOccurrenceIndex: 1, activeStep: "scopes" });
    // Nothing is discarded: the other two occurrences survive the rejection.
    expect(draft.occurrences[0].selectedScopeIds).toEqual(ANIME_POOL);
    expect(draft.occurrences[2].selectedScopeIds).toEqual(ANIME_POOL_2);
    expect(draft.issue?.code).toBe("MATCH_WORLD_NOT_ACTIVE");
  });

  it("counts three occurrences and twelve Scopes when complete", () => {
    const draft = fullDraft();
    expect(completedOccurrenceCount(draft)).toBe(OCCURRENCE_COUNT);
    expect(selectedScopeTotal(draft)).toBe(BOARD_POSITION_COUNT);
  });

  describe("the creation request", () => {
    it("carries all three occurrences and all twelve Scope ids", () => {
      expect(toCreateUnifiedMatchRequest(fullDraft())).toEqual({
        occurrences: [
          { occurrenceIndex: 0, worldId: ANIME, selectedScopeIds: ANIME_POOL },
          {
            occurrenceIndex: 1,
            worldId: FOOTBALL,
            selectedScopeIds: FOOTBALL_POOL,
          },
          { occurrenceIndex: 2, worldId: ANIME, selectedScopeIds: ANIME_POOL_2 },
        ],
      });
    });

    it("refuses to build a request from an incomplete draft", () => {
      expect(() =>
        toCreateUnifiedMatchRequest(configure(createDraft(), 0, ANIME, ANIME_POOL)),
      ).toThrow();
    });
  });
});

describe("match setup draft recovery", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("survives a refresh through sessionStorage only", () => {
    const draft = fullDraft();
    writeStoredDraft(draft);
    expect(window.localStorage.getItem(MATCH_SETUP_DRAFT_STORAGE_KEY)).toBeNull();
    expect(readStoredDraft()).toMatchObject({
      occurrences: draft.occurrences,
      activeStep: draft.activeStep,
    });
  });

  it("migrates a complete version-1 review draft directly to teams", () => {
    const draft = fullDraft();
    window.sessionStorage.setItem(
      MATCH_SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({ version: 1, draft: { ...draft, activeStep: "review" } }),
    );
    expect(readStoredDraft()).toMatchObject({
      occurrences: draft.occurrences,
      activeStep: "teams",
    });
  });

  it("recovers an incomplete version-1 review draft at its first safe step", () => {
    const draft = configure(createDraft(), 0, ANIME, ANIME_POOL);
    window.sessionStorage.setItem(
      MATCH_SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({ version: 1, draft: { ...draft, activeStep: "review" } }),
    );
    expect(readStoredDraft()).toMatchObject({
      activeOccurrenceIndex: 1,
      activeStep: "world",
    });
  });

  it("never restores a rejection message", () => {
    writeStoredDraft(
      apply(fullDraft(), {
        type: "report-issue",
        occurrenceIndex: 1,
        message: "لن يعود",
      }),
    );
    expect(readStoredDraft()?.issue).toBeUndefined();
  });

  it("discards a draft written by an obsolete shape", () => {
    window.sessionStorage.setItem(
      MATCH_SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({ version: 0, draft: fullDraft() }),
    );
    expect(readStoredDraft()).toBeUndefined();
    // And removes it, so it cannot fail again on the next load.
    expect(window.sessionStorage.getItem(MATCH_SETUP_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("discards a structurally wrong or unreadable draft", () => {
    for (const raw of [
      "not json",
      JSON.stringify({ version: 1 }),
      JSON.stringify({ version: 1, draft: { occurrences: [], activeStep: "world" } }),
      JSON.stringify({
        version: 1,
        draft: { ...fullDraft(), activeStep: "coin_toss" },
      }),
      JSON.stringify({
        version: 1,
        draft: { ...fullDraft(), activeOccurrenceIndex: 7 },
      }),
    ]) {
      window.sessionStorage.setItem(MATCH_SETUP_DRAFT_STORAGE_KEY, raw);
      expect(readStoredDraft()).toBeUndefined();
    }
  });

  it("trims a stored pool that somehow exceeds four Scopes", () => {
    const draft = fullDraft();
    window.sessionStorage.setItem(
      MATCH_SETUP_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        draft: {
          ...draft,
          occurrences: [
            {
              ...draft.occurrences[0],
              selectedScopeIds: [...ANIME_POOL, "smuggled"],
            },
            draft.occurrences[1],
            draft.occurrences[2],
          ],
        },
      }),
    );
    expect(readStoredDraft()?.occurrences[0].selectedScopeIds).toEqual(ANIME_POOL);
  });

  it("clears on request", () => {
    writeStoredDraft(fullDraft());
    clearStoredDraft();
    expect(readStoredDraft()).toBeUndefined();
  });
});
