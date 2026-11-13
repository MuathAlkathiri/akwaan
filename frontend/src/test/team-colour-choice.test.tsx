import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MatchSetupTeams } from "@/features/match-setup/components/match-setup-teams";
import {
  createDraft,
  matchSetupReducer,
  type MatchSetupDraft,
} from "@/features/match-setup/state/match-setup-draft";
import { teamColorPool, teamColorVariables } from "@/lib/team-palette";

vi.mock("@/features/worlds/hooks/use-player-catalog", () => ({
  usePlayableWorlds: () => ({ data: [], isLoading: false }),
}));

/**
 * A team is a *name*; its colour is a second attribute the host chooses.
 *
 * The two rules that make the choice safe rather than decorative:
 *
 *  - Each team picks from its own pool, so no pair of picks can land in the same hue
 *    arc or on a reserved meaning. A pick from the wrong pool is refused, not honoured.
 *  - The picks travel with the session, so the shared screen and every phone resolve
 *    the same two hues. A colour decided locally is how one team ended up green on the
 *    television and violet in someone's hand.
 */
describe("the constrained picker", () => {
  it("offers each team only its own pool", () => {
    expect(teamColorPool(0).map((color) => color.id)).toEqual([
      "indigo",
      "azure",
      "violet",
    ]);
    expect(teamColorPool(1).map((color) => color.id)).toEqual([
      "magenta",
      "pink",
      "rose",
    ]);
  });

  it("refuses a pick from the other team's pool instead of honouring it", () => {
    // Honouring it would put both teams in one hue arc — the single thing the pools
    // exist to prevent — so the reducer resolves it back to the position's default.
    const draft = matchSetupReducer(createDraft(), {
      type: "set-team-color",
      index: 0,
      colorId: "rose",
    });
    expect(draft.teamColorIds).toEqual(["indigo", "magenta"]);
  });

  it("records a legal pick", () => {
    const draft = matchSetupReducer(createDraft(), {
      type: "set-team-color",
      index: 1,
      colorId: "rose",
    });
    expect(draft.teamColorIds).toEqual(["indigo", "rose"]);
  });
});

describe("the team setup screen", () => {
  const renderScreen = (draft: MatchSetupDraft = createDraft()) => {
    const onRecolor = vi.fn();
    const onRename = vi.fn();
    render(
      <MatchSetupTeams
        draft={draft}
        submitting={false}
        rolledBack={false}
        onRename={onRename}
        onRecolor={onRecolor}
        onBack={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    return { onRecolor, onRename };
  };

  it("defaults the two teams to names, never to colours", () => {
    renderScreen();
    // "الأخضر" and "الوردي" were the old defaults: at reveal time a green element had
    // to mean "correct" and "team one" at once, and could not mean both.
    const first = screen.getByLabelText("اسم الفريق الأول") as HTMLInputElement;
    const second = screen.getByLabelText("اسم الفريق الثاني") as HTMLInputElement;
    expect(first.value).toBe("الفريق الأول");
    expect(second.value).toBe("الفريق الثاني");
    expect(document.body.textContent).not.toContain("الأخضر");
    expect(document.body.textContent).not.toContain("الوردي");
  });

  it("shows one swatch per pool colour and marks the current pick", () => {
    renderScreen();
    const swatches = Array.from(
      document.querySelectorAll("[data-team-color]"),
    ) as HTMLElement[];
    expect(swatches.map((swatch) => swatch.dataset.teamColor)).toEqual([
      "indigo",
      "azure",
      "violet",
      "magenta",
      "pink",
      "rose",
    ]);
    const selected = swatches.filter(
      (swatch) => swatch.dataset.selected === "true",
    );
    expect(selected.map((swatch) => swatch.dataset.teamColor)).toEqual([
      "indigo",
      "magenta",
    ]);
  });

  it("reports a pick by its id", async () => {
    const user = userEvent.setup();
    const { onRecolor } = renderScreen();
    await user.click(screen.getByLabelText("أزرق سماوي"));
    expect(onRecolor).toHaveBeenCalledWith(0, "azure");
  });

  it("reports team-name edits and keeps Start gated by the existing rules", async () => {
    const { onRename } = renderScreen();
    fireEvent.change(screen.getByLabelText("اسم الفريق الأول"), {
      target: { value: "الصقور" },
    });
    expect(onRename).toHaveBeenCalledWith(0, "الصقور");

    const invalid = createDraft();
    invalid.teamNames = ["نفس الاسم", "نفس الاسم"];
    renderScreen(invalid);
    expect(screen.getAllByRole("button", { name: "ابدأ المباراة" })[1]).toBeDisabled();
  });
});

describe("the picks reach every client", () => {
  it("resolves the session's own colour ids into the shared tokens", () => {
    // Both clients read the same two ids off the same snapshot and scope the same
    // variables, so neither has to be told what the other decided.
    const variables = teamColorVariables([
      { colorId: "violet" },
      { colorId: "rose" },
    ]);
    expect(variables["--team-1-base"]).toBe("254 84% 64%");
    expect(variables["--team-2-base"]).toBe("347 72% 59%");
    // Both the light-room and dark-room variants are set, because which one carries
    // text is decided by the theme, not by the pick.
    expect(variables["--team-1-on-light"]).toBeDefined();
    expect(variables["--team-1-on-dark"]).toBeDefined();
  });

  it("falls back to the defaults for a session created before colours existed", () => {
    const variables = teamColorVariables([{}, {}]);
    expect(variables["--team-1-base"]).toBe("232 53% 50%");
    expect(variables["--team-2-base"]).toBe("324 58% 50%");
  });

  it("ignores a colour id from the wrong pool in a snapshot too", () => {
    const variables = teamColorVariables([{ colorId: "rose" }, { colorId: "azure" }]);
    expect(variables["--team-1-base"]).toBe("232 53% 50%");
    expect(variables["--team-2-base"]).toBe("324 58% 50%");
  });
});
