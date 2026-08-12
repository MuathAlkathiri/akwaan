"use client";

import { Check, Play, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JourneySection } from "@/features/worlds/components/journey-shell";
import { cn } from "@/lib/utils";
import {
  resolveTeamColor,
  teamColorPool,
  teamColorVariables,
} from "@/lib/team-palette";
import { StepFooter } from "./occurrence-world-step";
import type { MatchSetupDraft } from "../state/match-setup-draft";

/**
 * The last thing before the Match exists: who is playing.
 *
 * Two names and two colours, and nothing else. No phone pairs here and no QR: teams
 * are identities the server needs to score a Match, and players join their team
 * later, during challenge preflight. This is also the only screen that talks to the
 * server — pressing the button creates the session and the Match in one go.
 *
 * A team is its **name**. The colour is a second attribute, chosen here, sent with
 * the session so every client agrees on it, and never used as the team's label.
 */
export function MatchSetupTeams({
  draft,
  submitting,
  rolledBack,
  onRename,
  onRecolor,
  onBack,
  onStart,
}: {
  draft: MatchSetupDraft;
  submitting: boolean;
  rolledBack: boolean;
  onRename: (index: 0 | 1, name: string) => void;
  onRecolor: (index: 0 | 1, colorId: string) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const named = draft.teamNames.every((name) => name.trim().length > 0);
  const distinct = draft.teamNames[0].trim() !== draft.teamNames[1].trim();
  const ready = named && distinct;

  return (
    <JourneySection
      id="match-teams"
      title="الفريقان"
      description="اسم ولون لكل فريق. تنضم الجوالات لاحقًا قبل أول تحدٍ يحتاجها."
    >
      <div
        className="space-y-5"
        // The preview swatches below show the *actual* picks, not a stand-in, by
        // scoping the same variables the Match itself will run with.
        style={teamColorVariables(
          draft.teamColorIds.map((colorId) => ({ colorId })),
        )}
      >
        <div className="grid gap-4 rounded-3xl border border-border bg-card p-6 shadow-[0_10px_30px_rgba(24,16,54,.05)] sm:grid-cols-2">
          {([0, 1] as const).map((index) => (
            <TeamField
              key={index}
              index={index}
              name={draft.teamNames[index]}
              colorId={draft.teamColorIds[index]}
              onRename={onRename}
              onRecolor={onRecolor}
            />
          ))}
        </div>

        {!distinct && named && (
          <p role="alert" className="text-sm font-bold text-destructive">
            اختر اسمين مختلفين للفريقين.
          </p>
        )}
        {draft.issue && (
          <p role="alert" className="text-sm font-bold text-destructive">
            {draft.issue.message}
          </p>
        )}
        {rolledBack && (
          <p className="text-sm leading-6 text-muted-foreground">
            لم تُنشأ أي مباراة، وتم إلغاء الجلسة المؤقتة. إعدادك محفوظ كما هو.
          </p>
        )}

        <StepFooter onBack={onBack} backDisabled={submitting}>
          <Button
            type="button"
            size="lg"
            disabled={!ready || submitting}
            onClick={onStart}
            className="min-w-44 rounded-[var(--radius)] font-black shadow-[0_10px_26px_hsl(219_45%_16%/0.2)]"
          >
            <Play className="ml-2 h-5 w-5 fill-current" aria-hidden />
            {submitting ? "جارٍ إنشاء المباراة…" : "ابدأ المباراة"}
          </Button>
        </StepFooter>
      </div>
    </JourneySection>
  );
}

const POSITION_LABELS = ["الفريق الأول", "الفريق الثاني"] as const;

/**
 * One team's name and colour.
 *
 * The heading icon carries the team's own colour, which is the only place a colour
 * belongs on this screen: it previews the pick. It used to be `text-success` and
 * `text-primary` — a green icon beside the second team's field, which is the exact
 * confusion between "correct" and "team two" that the palette rules exist to stop.
 */
function TeamField({
  index,
  name,
  colorId,
  onRename,
  onRecolor,
}: {
  index: 0 | 1;
  name: string;
  colorId: string;
  onRename: (index: 0 | 1, name: string) => void;
  onRecolor: (index: 0 | 1, colorId: string) => void;
}) {
  const slot = index + 1;
  const position = POSITION_LABELS[index];
  const selected = resolveTeamColor(index, colorId);

  return (
    <div className="space-y-3">
      <label className="block space-y-2">
        <span className="flex items-center gap-2 text-sm font-black text-muted-foreground">
          <Users
            className={cn(
              "h-4 w-4",
              slot === 1 ? "text-team-1-text" : "text-team-2-text",
            )}
            aria-hidden
          />
          {position}
        </span>
        <Input
          aria-label={`اسم ${position}`}
          value={name}
          onChange={(event) => onRename(index, event.target.value)}
        />
      </label>

      <fieldset>
        {/* "اللون" rather than "لون الفريق الأول": the team's name is directly above
            it, so the long form only repeated it. The full phrase stays as the
            group's accessible name, where the surrounding context is not available. */}
        <legend className="mb-2 text-xs font-bold text-muted-foreground">
          اللون
        </legend>
        {/* Each team draws from its own pool, so the two picks can never be
            confusable and neither can land on a reserved meaning. */}
        <div
          className="flex flex-wrap gap-1"
          role="radiogroup"
          aria-label={`لون ${position}`}
        >
          {teamColorPool(index).map((color) => {
            const isSelected = color.id === selected.id;
            return (
              <button
                key={color.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={color.label}
                data-team-color={color.id}
                data-selected={isSelected ? "true" : "false"}
                onClick={() => onRecolor(index, color.id)}
                // A 44px target with a 28px dot inside it: the dot is the affordance,
                // the padding is the thumb. Sized to the touch guideline rather than
                // to the swatch, because this is a phone-first setup screen.
                className={cn(
                  "grid size-11 place-items-center rounded-full border-2 transition-colors duration-fast ease-akwaan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isSelected ? "border-foreground" : "border-transparent",
                )}
              >
                <span
                  aria-hidden
                  className="grid size-7 place-items-center rounded-full"
                  // The one place a palette value reaches an element directly: a
                  // swatch has to show a colour that is not the active team's, so it
                  // cannot come from the scoped token.
                  style={{
                    background: `hsl(${color.base.hue} ${color.base.saturation}% ${color.base.lightness}%)`,
                  }}
                >
                  {isSelected && (
                    <Check className="size-4 text-sem-reveal-foreground" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
