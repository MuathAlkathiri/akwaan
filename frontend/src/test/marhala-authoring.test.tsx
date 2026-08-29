import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  scopes: [] as unknown[],
  configurations: [] as unknown[],
}));

vi.mock("@/components/ui/toast", () => ({ showToast: vi.fn() }));

vi.mock("@/features/world-management/hooks/use-world-content", () => ({
  useScopes: () => ({ data: mocks.scopes }),
  useWorldBoard: () => ({ data: { configurations: mocks.configurations } }),
  useWorldContentMetadata: () => ({
    data: {
      answerModeCompatibility: [
        {
          challengeAnswerMode: "match",
          itemAnswerModes: ["match"],
          contentPattern: "generic",
        },
      ],
    },
  }),
  useCreateContentItem: () => ({
    mutateAsync: mocks.create,
    isPending: false,
  }),
  useUpdateContentItem: () => ({
    mutateAsync: mocks.update,
    isPending: false,
  }),
}));

import { ContentItemForm } from "@/features/world-management/components/content-items/content-item-form";
import { MarhalaFields } from "@/features/world-management/components/content-items/marhala-fields";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  findLocalFormProblems,
  hasMarhalaMechanic,
  toContentItemForm,
  toMarhalaFormState,
  MARHALA_DIFFICULTIES,
  type MarhalaFormState,
} from "@/features/world-management/services/content-item-form.service";
import type { ContentItem } from "@/features/world-management/types";

/**
 * Authoring "صعوبة السؤال" for a المرحلة item.
 *
 * Two rules carry these tests. The author sees Arabic and nothing else, while what
 * persists is the backend's own `easy` / `medium` / `hard` — the label must never
 * reach the wire and the value must never reach the screen. And difficulty is
 * independent of Scope in both directions: GTA holds all three bands, and picking
 * a Scope neither implies a band nor discards one.
 */

const SCOPES = [
  { id: "scope-gta", name: "GTA", excludedChallengeTypeIds: [] },
  { id: "scope-cod", name: "كود", excludedChallengeTypeIds: [] },
];

const configuration = (id: string, slug: string, name: string) => ({
  id: `cfg-${slug}`,
  challengeTypeId: id,
  slotKey: "slot_1",
  isEnabled: true,
  challengeType: { id, slug, name, answerMode: "match" },
});

const MARHALA_CONFIG = configuration("ct-marhala", "marhala", "المرحلة");
const BOMB_CONFIG = configuration("ct-bomb", "bomb", "القنبلة");

function Fields({ initial }: { initial: MarhalaFormState }) {
  const [value, setValue] = useState(initial);
  return <MarhalaFields value={value} onChange={setValue} />;
}

/** A complete المرحلة item as the form holds it, at one band. */
const marhalaForm = (difficulty: MarhalaFormState["difficulty"]) => ({
  ...emptyContentItemForm("scope-gta"),
  promptAr: "ما اسم هذه اللعبة؟",
  compatibleChallengeTypeIds: ["ct-marhala"],
  answer: {
    ...emptyContentItemForm("scope-gta").answer,
    mode: "match" as const,
    acceptedAnswers: "جي تي إي",
  },
  marhala: { enabled: true, difficulty },
});

const savedItem = (marhalaDifficulty: unknown): ContentItem =>
  ({
    id: "item-1",
    scopeId: "scope-gta",
    worldId: "world-video-games",
    prompt: { ar: "سؤال" },
    compatibleChallengeTypeIds: ["ct-marhala"],
    answerPayload: { mode: "match", acceptedAnswers: ["جي تي إي"] },
    ...(marhalaDifficulty === undefined
      ? {}
      : { mechanicPayload: { marhalaDifficulty } }),
    isReusableAcrossSessions: false,
    status: "ready",
  }) as unknown as ContentItem;

beforeEach(() => {
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.scopes = SCOPES;
  mocks.configurations = [MARHALA_CONFIG, BOMB_CONFIG];
});

describe("which mechanics ask for a المرحلة difficulty", () => {
  const configured = (...slugs: string[]) =>
    slugs.map((slug) => ({ challengeType: { slug } }));

  it("asks only when المرحلة is among the selected mechanics", () => {
    expect(hasMarhalaMechanic(configured("marhala"))).toBe(true);
    expect(hasMarhalaMechanic(configured("bomb", "marhala"))).toBe(true);
  });

  it("never asks another mechanic for one", () => {
    // Marhala answers in the generic `match` mode, so only the slug can single it
    // out — an answer-mode test would also catch every other typed mechanic.
    expect(hasMarhalaMechanic(configured())).toBe(false);
    expect(hasMarhalaMechanic(configured("bomb"))).toBe(false);
    expect(hasMarhalaMechanic(configured("combo"))).toBe(false);
    expect(hasMarhalaMechanic(configured("one-clue", "closest"))).toBe(false);
  });
});

describe("the field appears with the mechanic and not otherwise", () => {
  const renderForm = (item?: ContentItem) =>
    render(
      <ContentItemForm
        worldId="world-video-games"
        defaultScopeId="scope-gta"
        {...(item ? { contentItem: item } : {})}
        onSuccess={() => {}}
      />,
    );

  it("shows صعوبة السؤال once المرحلة is selected", async () => {
    renderForm();
    expect(screen.queryByTestId("marhala-fields")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: /المرحلة/ }));

    await waitFor(() =>
      expect(screen.getByTestId("marhala-fields")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/صعوبة السؤال/)).toBeInTheDocument();
  });

  it("asks nothing of an item authored for another mechanic", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("checkbox", { name: /القنبلة/ }));

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /القنبلة/ })).toBeChecked(),
    );
    expect(screen.queryByTestId("marhala-fields")).toBeNull();
    expect(screen.queryByTestId("combo-fields")).toBeNull();
  });

  it("is not offered at all in a World whose board does not play it", () => {
    // المرحلة is the Video Games Signature, and the only mechanics offered here are
    // the ones this World's board is configured with — the same rule the server
    // enforces as CHALLENGE_TYPE_NOT_CONFIGURED_FOR_WORLD, so this is a reflection
    // of the restriction rather than a second, softer copy of it.
    mocks.configurations = [BOMB_CONFIG];
    renderForm();

    expect(screen.queryByRole("checkbox", { name: /المرحلة/ })).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: /القنبلة/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("marhala-fields")).toBeNull();
  });

  it("is not offered when the Scope excludes it", () => {
    mocks.scopes = [
      {
        id: "scope-gta",
        name: "GTA",
        excludedChallengeTypeIds: ["ct-marhala"],
      },
    ];
    renderForm();
    expect(screen.queryByRole("checkbox", { name: /المرحلة/ })).toBeNull();
  });

  it("stops asking when المرحلة is deselected, keeping the author's choice", async () => {
    renderForm(savedItem("hard"));
    expect(screen.getByTestId("marhala-difficulty-select")).toHaveTextContent(
      "صعب",
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /المرحلة/ }));
    await waitFor(() =>
      expect(screen.queryByTestId("marhala-fields")).toBeNull(),
    );

    // Re-selecting must not have cost the author their band.
    fireEvent.click(screen.getByRole("checkbox", { name: /المرحلة/ }));
    await waitFor(() =>
      expect(screen.getByTestId("marhala-difficulty-select")).toHaveTextContent(
        "صعب",
      ),
    );
  });
});

describe("choosing a difficulty", () => {
  it("offers exactly the three approved bands, in Arabic", async () => {
    render(<Fields initial={{ enabled: true, difficulty: "" }} />);
    fireEvent.click(screen.getByTestId("marhala-difficulty-select"));

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "سهل",
      "متوسط",
      "صعب",
    ]);
  });

  it.each(
    MARHALA_DIFFICULTIES.map((entry) => [entry.label, entry.value] as const),
  )("persists %s as %s and never the label", async (label, value) => {
    render(<Fields initial={{ enabled: true, difficulty: "" }} />);
    fireEvent.click(screen.getByTestId("marhala-difficulty-select"));
    fireEvent.click(await screen.findByRole("option", { name: label }));
    expect(screen.getByTestId("marhala-difficulty-select")).toHaveTextContent(
      label,
    );

    const payload = buildContentItemPayload(marhalaForm(value));
    expect(payload.mechanicPayload).toEqual({ marhalaDifficulty: value });
    expect(JSON.stringify(payload)).not.toContain(label);
  });

  it("refuses to save a المرحلة item with no difficulty chosen", () => {
    expect(findLocalFormProblems(marhalaForm(""))).toContain(
      "اختر صعوبة السؤال.",
    );
    // And nothing is emitted for it, so a bypass cannot save a bandless item.
    expect(
      buildContentItemPayload(marhalaForm("")).mechanicPayload,
    ).toBeUndefined();
  });

  it("never shows the author a canonical value or a payload path", () => {
    render(<Fields initial={{ enabled: true, difficulty: "hard" }} />);
    const text = screen.getByTestId("marhala-fields").textContent ?? "";
    for (const leak of [
      "marhalaDifficulty",
      "mechanicPayload",
      "easy",
      "medium",
      "hard",
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  it("emits no المرحلة payload once the mechanic is no longer selected", () => {
    const values = {
      ...marhalaForm("medium"),
      marhala: { enabled: false, difficulty: "medium" as const },
    };
    expect(buildContentItemPayload(values).mechanicPayload).toBeUndefined();
    expect(findLocalFormProblems(values)).not.toContain("اختر صعوبة السؤال.");
  });
});

describe("editing an authored item", () => {
  it.each([
    ["easy", "سهل"],
    ["medium", "متوسط"],
    ["hard", "صعب"],
  ])("hydrates %s as %s", (stored, label) => {
    const values = toContentItemForm(savedItem(stored));
    expect(values.marhala).toEqual({ enabled: true, difficulty: stored });

    render(<Fields initial={values.marhala} />);
    expect(screen.getByTestId("marhala-difficulty-select")).toHaveTextContent(
      label,
    );
  });

  it("persists a changed difficulty", async () => {
    render(<Fields initial={{ enabled: true, difficulty: "hard" }} />);
    expect(screen.getByTestId("marhala-difficulty-select")).toHaveTextContent(
      "صعب",
    );

    fireEvent.click(screen.getByTestId("marhala-difficulty-select"));
    fireEvent.click(await screen.findByRole("option", { name: "متوسط" }));

    expect(screen.getByTestId("marhala-difficulty-select")).toHaveTextContent(
      "متوسط",
    );
    expect(
      buildContentItemPayload(marhalaForm("medium")).mechanicPayload,
    ).toEqual({ marhalaDifficulty: "medium" });
  });

  it("surfaces a stored value the contract does not define instead of inventing one", () => {
    // The runtime draw reads the same predicate this form does, so such an item is
    // unplayable. Quietly showing سهل would change what it does in a race.
    for (const bad of ["EASY", "صعب جدًا", "impossible", 2, true]) {
      const state = toMarhalaFormState({ marhalaDifficulty: bad });
      expect(state).toEqual({
        enabled: true,
        difficulty: "",
        unknownStored: String(bad),
      });

      const { unmount } = render(<Fields initial={state} />);
      expect(
        screen.getByTestId("marhala-difficulty-unknown"),
      ).toBeInTheDocument();
      // Nothing is selected, so saving is blocked until the author chooses.
      expect(screen.getByTestId("marhala-difficulty-select")).toHaveTextContent(
        "اختر صعوبة السؤال",
      );
      unmount();
    }
  });

  it("clears the warning once the author picks a band", async () => {
    render(
      <Fields
        initial={{ enabled: true, difficulty: "", unknownStored: "EASY" }}
      />,
    );
    fireEvent.click(screen.getByTestId("marhala-difficulty-select"));
    fireEvent.click(await screen.findByRole("option", { name: "سهل" }));

    expect(screen.queryByTestId("marhala-difficulty-unknown")).toBeNull();
  });

  it("says nothing about difficulty for an item that carries none", () => {
    expect(toContentItemForm(savedItem(undefined)).marhala).toEqual({
      enabled: false,
      difficulty: "",
    });
    expect(toMarhalaFormState({ marhalaDifficulty: null })).toEqual({
      enabled: false,
      difficulty: "",
    });
  });
});

describe("Scope and difficulty are independent", () => {
  it("keeps the chosen band when the Scope changes", () => {
    const chosen = marhalaForm("hard");
    // A Scope change clears the mechanic selection — that is the existing
    // convention — but it may never touch, reset, or infer the band.
    const moved = {
      ...chosen,
      scopeId: "scope-cod",
      compatibleChallengeTypeIds: [],
    };
    expect(moved.marhala).toEqual({ enabled: true, difficulty: "hard" });
    expect(
      buildContentItemPayload({
        ...moved,
        compatibleChallengeTypeIds: ["ct-marhala"],
      }).mechanicPayload,
    ).toEqual({ marhalaDifficulty: "hard" });
  });

  it("keeps the Scope when the difficulty changes", () => {
    const easy = buildContentItemPayload(marhalaForm("easy"));
    const hard = buildContentItemPayload(marhalaForm("hard"));
    expect(easy.scopeId).toBe("scope-gta");
    expect(hard.scopeId).toBe("scope-gta");
  });

  it("authors all three bands inside one Scope", () => {
    // GTA — سهل, GTA — متوسط, GTA — صعب: one Scope, three bands, nothing shared
    // between them but the Scope.
    const authored = (["easy", "medium", "hard"] as const).map((band) =>
      buildContentItemPayload(marhalaForm(band)),
    );
    expect(authored.map((payload) => payload.scopeId)).toEqual([
      "scope-gta",
      "scope-gta",
      "scope-gta",
    ]);
    expect(authored.map((payload) => payload.mechanicPayload)).toEqual([
      { marhalaDifficulty: "easy" },
      { marhalaDifficulty: "medium" },
      { marhalaDifficulty: "hard" },
    ]);
  });
});

describe("an item compatible with more than one mechanic", () => {
  it("keeps المرحلة's band and القنبلة's authoring side by side", () => {
    const shared = {
      ...marhalaForm("medium"),
      compatibleChallengeTypeIds: ["ct-marhala", "ct-bomb"],
      mediaType: "image" as const,
      mediaUrls: ["/uploads/gta.webp"],
    };
    const payload = buildContentItemPayload(shared);
    // القنبلة needs the image and the typed answer; المرحلة needs the band. One
    // item satisfies both without either mechanic's authoring displacing the other.
    expect(payload.mechanicPayload).toEqual({ marhalaDifficulty: "medium" });
    expect(payload.media).toEqual({
      type: "image",
      assets: [{ url: "/uploads/gta.webp" }],
    });
    expect(payload.compatibleChallengeTypeIds).toEqual([
      "ct-marhala",
      "ct-bomb",
    ]);
  });

  it("carries a Combo stage and a Marhala band without merging their meanings", () => {
    // Legal, and deliberately not collapsed: a stage is a position in a run, a
    // band is a risk a team elects. Each key stays its own mechanic's.
    const payload = buildContentItemPayload({
      ...marhalaForm("hard"),
      compatibleChallengeTypeIds: ["ct-marhala", "ct-combo"],
      combo: { enabled: true, stage: 2 },
    });
    expect(payload.mechanicPayload).toEqual({
      comboStage: 2,
      marhalaDifficulty: "hard",
    });
  });

  it("leaves another mechanic's payload untouched", () => {
    const base = emptyContentItemForm("scope-gta");
    const payload = buildContentItemPayload({
      ...base,
      promptAr: "سؤال",
      compatibleChallengeTypeIds: ["ct-rakkibha"],
      rakkibha: { ...base.rakkibha, enabled: true },
      marhala: { enabled: false, difficulty: "easy" },
    });
    expect(payload.mechanicPayload).toHaveProperty("candidateViews");
    expect(payload.mechanicPayload).not.toHaveProperty("marhalaDifficulty");
  });

  it("asks for one difficulty per mechanic, and says so once", () => {
    const problems = findLocalFormProblems({
      ...marhalaForm(""),
      combo: { enabled: true, stage: "" },
    });
    expect(
      problems.filter((problem) => problem === "اختر صعوبة السؤال."),
    ).toHaveLength(1);
  });
});

describe("المرحلة answer authoring", () => {
  it("uses the shared match contract and adds nothing of its own", () => {
    const payload = buildContentItemPayload(marhalaForm("easy"));
    // The same typed-answer payload every `match` mechanic writes: one list of
    // accepted answers, graded by the server's canonical normalizer. No Marhala
    // answer editor, no host judgment.
    expect(payload.answerPayload).toEqual({
      mode: "match",
      acceptedAnswers: ["جي تي إي"],
    });
    expect(payload.mechanicPayload).toEqual({ marhalaDifficulty: "easy" });
  });

  it("accepts several spellings on one item", () => {
    const payload = buildContentItemPayload({
      ...marhalaForm("hard"),
      answer: {
        ...marhalaForm("hard").answer,
        acceptedAnswers: "جي تي إي\nGTA\nقرand ثفت",
      },
    });
    expect(payload.answerPayload).toMatchObject({
      mode: "match",
      acceptedAnswers: ["جي تي إي", "GTA", "قرand ثفت"],
    });
  });
});
