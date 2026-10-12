"use client";

import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { HelpCircle, Lock, Swords, Unlock } from "lucide-react";
import { ChallengeFrame } from "@/features/live-game-session/match/components/challenge-frame";
import { ChallengeCountdown } from "@/features/live-game-session/match/components/challenge-countdown";
import { AnswerOption } from "@/features/live-game-session/match/components/answer-option";
import {
  PhoneFrame,
  SharedScreenFrame,
} from "@/features/how-to-play/components/device-frames";
import {
  RYO_DECISION_PRESENTATION,
  ryoDecisionRevealLabel,
} from "@/features/live-game-session/match/ryo-decision.presentation";
import { teamIdentityOf, type TeamIdentity } from "@/lib/team-identity";
import { BidiText } from "@/components/akwaan/bidi-text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RYO_DEMO_STEPS, type RyoDemoStepId } from "../ryo-demo-scenario";
import {
  TUTORIAL_ROLES,
  TUTORIAL_TEAMS,
  TUTORIAL_WINDOW_MS,
  toPresentationDecision,
  tutorialPayoffTeamId,
  type RyoTutorialScenario,
} from "../tutorial-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";
import { ExplainerControls } from "./explainer-controls";

/**
 * A miniature, faithful run of one "اقرأ خصمك" item.
 *
 * Every surface here is the production component the real challenge renders —
 * `ChallengeFrame`, `AnswerOption`, `ChallengeCountdown`, the decision copy and
 * the team identity palette — fed by a fixed fixture instead of a live session.
 * It holds no session context, issues no command, and opens no socket: the only
 * input is a step index.
 */

const STEP_INDEX: Record<RyoDemoStepId, number> = RYO_DEMO_STEPS.reduce(
  (map, step, index) => ({ ...map, [step.id]: index }),
  {} as Record<RyoDemoStepId, number>,
);

/**
 * Which phone the compact layout gives the floor to on each beat.
 *
 * Compact has room for one phone, not two, so it spotlights the surface that is
 * *acting*: the answering team while they pick, then the reading team from the
 * moment the answer locks through to the payoff. One swap, at the beat where the
 * tension moves — not a phone that flickers between sides every step.
 */
const SPOTLIGHT: Record<RyoDemoStepId, "answering" | "deciding"> = {
  brief: "answering",
  "answer-locked": "deciding",
  "decision-locked": "deciding",
  reveal: "deciding",
  payoff: "deciding",
};

const teams = [...TUTORIAL_TEAMS];
const answeringIdentity = teamIdentityOf(TUTORIAL_ROLES.answeringTeamId, teams);
const opposingIdentity = teamIdentityOf(TUTORIAL_ROLES.opposingTeamId, teams);
const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "الفريق";

/**
 * Everything the surfaces need, read off the published scenario.
 *
 * Derivation only — labels looked up by id and the server's own `outcome`
 * mapped onto the two demonstration teams. No scoring is decided here.
 */
interface TutorialView {
  correct: boolean;
  answerLabel: string;
  correctLabel: string;
  payoff: { teamId: string; delta: number; reason: string };
}

function viewOf(scenario: RyoTutorialScenario): TutorialView {
  const label = (id: string) =>
    scenario.options.find((option) => option.id === id)?.label ?? "";
  return {
    correct: scenario.outcome.correct,
    answerLabel: label(scenario.answeringSelectionOptionId),
    correctLabel: label(scenario.correctOptionId),
    payoff: {
      teamId: tutorialPayoffTeamId(scenario.outcome),
      delta: scenario.outcome.delta,
      reason: scenario.outcome.reason,
    },
  };
}

export function RyoExplainer({
  scenario,
  compact = false,
}: {
  /** The published tutorial this mechanic teaches with. */
  scenario: RyoTutorialScenario;
  compact?: boolean;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const spotlightRef = useRef<HTMLDivElement | null>(null);
  const view = useMemo(() => viewOf(scenario), [scenario]);
  const { correct, answerLabel, correctLabel } = view;
  const timeline = useExplainerTimeline(RYO_DEMO_STEPS, scope);
  const at = timeline.index;
  const step = RYO_DEMO_STEPS[at];
  const spotlight = SPOTLIGHT[step.id];

  // The compact swap, animated rather than cut. Scoped to its own element and
  // reverted on every change, so a rapid skip/replay cannot stack tweens.
  useEffect(() => {
    if (!compact) return;
    const element = spotlightRef.current;
    if (!element) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        element,
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0, duration: 0.28, ease: "power2.out", overwrite: "auto" },
      );
    }, element);
    return () => context.revert();
  }, [compact, spotlight]);

  const answerLocked = at >= STEP_INDEX["answer-locked"];
  const decisionLocked = at >= STEP_INDEX["decision-locked"];
  const revealed = at >= STEP_INDEX.reveal;
  const scored = at >= STEP_INDEX.payoff;
  // The clock only runs while both sides are still choosing, exactly as the real
  // window does — it is not a progress bar for the demo.
  const remainingMs = revealed
    ? 0
    : Math.round(TUTORIAL_WINDOW_MS * (decisionLocked ? 0.3 : answerLocked ? 0.6 : 1));

  return (
    <div
      ref={scope}
      dir="rtl"
      data-testid="ryo-explainer"
      data-variant={compact ? "compact" : "full"}
      className={compact ? "space-y-3" : "space-y-6"}
    >
      <ExplainerControls
        step={at}
        total={RYO_DEMO_STEPS.length}
        caption={step.caption}
        phase={step.phase}
        timeline={timeline}
        compact={compact}
      />

      <div
        className={
          compact
            ? "grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
            : "grid gap-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]"
        }
      >
        {/* The room's shared screen. Public state only. */}
        <SharedScreenFrame stand={!compact}>
          <ChallengeFrame
            eyebrow="اقرأ خصمك"
            title="السؤال 1 من 3"
            progressValue={0}
            compact={compact}
            className={compact ? "w-full" : "mx-auto w-full max-w-3xl"}
          >
            <div className={compact ? "space-y-2.5" : "space-y-5"}>
              <div
                className={cn(
                  "grid gap-2 sm:grid-cols-2",
                  compact ? "text-[0.7rem]" : "text-sm",
                )}
                data-testid="explainer-lock-indicators"
              >
                <LockIndicator
                  teamName={teamName(TUTORIAL_ROLES.answeringTeamId)}
                  role="يجيب"
                  identity={answeringIdentity}
                  locked={answerLocked}
                  testId="explainer-lock-answering"
                />
                <LockIndicator
                  teamName={teamName(TUTORIAL_ROLES.opposingTeamId)}
                  role="يقرأ الخصم"
                  identity={opposingIdentity}
                  locked={decisionLocked}
                  testId="explainer-lock-opposing"
                />
              </div>

              <section
                className={cn(
                  "mx-auto flex max-w-2xl flex-col items-center text-center",
                  compact ? "gap-2.5" : "gap-5",
                )}
              >
                <h2
                  className={cn(
                    "font-black leading-snug text-foreground",
                    compact
                      ? "text-base sm:text-lg"
                      : "text-[1.75rem] sm:text-[2.25rem]",
                  )}
                >
                  <BidiText>{scenario.prompt}</BidiText>
                </h2>
                {!revealed && (
                  <ChallengeCountdown
                    remainingMs={remainingMs}
                    variant={compact ? "chip" : "prominent"}
                  />
                )}
                {!revealed && (
                  <p
                    className={cn(
                      "rounded-[var(--radius)] bg-muted font-bold text-muted-foreground",
                      compact ? "px-3 py-1.5 text-xs" : "p-4",
                    )}
                    data-testid="explainer-shared-waiting"
                  >
                    {decisionLocked
                      ? "ثبّتوا الاثنين — الكشف الحين."
                      : answerLocked
                        ? "وصلت الإجابة. ننتظر قرار الخصم…"
                        : "ننتظر اختيارات الفريقين…"}
                  </p>
                )}
              </section>

              {revealed && (
                <div
                  data-testid="explainer-reveal"
                  data-outcome={correct ? "correct" : "wrong"}
                  className={cn(
                    "akwaan-rise rounded-[var(--radius)] text-center text-sem-reveal-foreground",
                    compact ? "p-3" : "p-5",
                    correct ? "bg-sem-success" : "bg-sem-error",
                  )}
                  role="status"
                >
                  <p className={compact ? "text-base font-black" : "text-2xl font-black"}>
                    {correct ? "إجابة صحيحة" : "إجابة غير صحيحة"}
                  </p>
                  <p
                    className={cn(
                      "font-bold opacity-90",
                      compact ? "text-[0.7rem]" : "text-sm",
                    )}
                  >
                    قرار الخصم: {ryoDecisionRevealLabel(toPresentationDecision(scenario.opposingDecision))}
                  </p>
                  <div
                    className={cn(
                      "grid gap-2 text-start sm:grid-cols-2",
                      compact ? "mt-2" : "mt-3",
                    )}
                  >
                    <div className="min-w-0">
                      <p className={compact ? "text-[0.6rem] font-bold opacity-80" : "text-xs font-bold opacity-80"}>
                        الإجابة المُرسلة
                      </p>
                      <p className={cn("break-words font-black", compact ? "text-sm" : "text-lg")}>
                        {answerLabel}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className={compact ? "text-[0.6rem] font-bold opacity-80" : "text-xs font-bold opacity-80"}>
                        الإجابة الصحيحة
                      </p>
                      <p className={cn("break-words font-black", compact ? "text-sm" : "text-lg")}>
                        {correctLabel}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {scored && <PayoffRow compact={compact} payoff={view.payoff} />}
            </div>
          </ChallengeFrame>
        </SharedScreenFrame>

        {/* The private surfaces.
            Full size shows both phones side by side, because the split *is* the
            mechanic. Compact has room for one, so it spotlights whichever phone
            is acting and crossfades on the swap — which keeps the shared/private
            distinction without two unreadable phones fighting for a card column.
            `PhoneFrame` is `aspect-[9/18]`, so width is always capped: left to
            fill a column it renders a phone the height of the page. */}
        {compact ? (
          <div
            ref={spotlightRef}
            data-testid="explainer-spotlight"
            data-surface={spotlight}
            className="mx-auto w-fit sm:mx-0"
          >
            {spotlight === "answering" ? (
              <PhoneColumn
                compact
                label={`${teamName(TUTORIAL_ROLES.answeringTeamId)} · يجيب`}
                identity={answeringIdentity}
              >
                {/* No prompt on the compact phone: the shared screen is showing
                    the same question inches away, and repeating it costs the
                    card real height for nothing. The options are the point of
                    this surface. */}
                <AnsweringPhone
                  scenario={scenario}
                  view={view}
                  locked={answerLocked}
                  revealed={revealed}
                  showPrompt={false}
                />
              </PhoneColumn>
            ) : (
              <PhoneColumn
                compact
                label={`${teamName(TUTORIAL_ROLES.opposingTeamId)} · يقرأ الخصم`}
                identity={opposingIdentity}
              >
                <DecidingPhone
                  scenario={scenario}
                  view={view}
                  locked={decisionLocked}
                  revealed={revealed}
                />
              </PhoneColumn>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 self-start sm:gap-4">
            <PhoneColumn
              label={`${teamName(TUTORIAL_ROLES.answeringTeamId)} · يجيب`}
              identity={answeringIdentity}
            >
              <AnsweringPhone scenario={scenario} view={view} locked={answerLocked} revealed={revealed} />
            </PhoneColumn>
            <PhoneColumn
              label={`${teamName(TUTORIAL_ROLES.opposingTeamId)} · يقرأ الخصم`}
              identity={opposingIdentity}
            >
              <DecidingPhone
                  scenario={scenario}
                  view={view}
                  locked={decisionLocked}
                  revealed={revealed}
                />
            </PhoneColumn>
          </div>
        )}
      </div>
    </div>
  );
}

function PayoffRow({
  compact = false,
  payoff,
}: {
  compact?: boolean;
  payoff: TutorialView["payoff"];
}) {
  return (
    <div
      data-testid="explainer-payoff"
      data-reason={payoff.reason}
      className={cn(
        "akwaan-rise grid gap-2 rounded-[var(--radius)] border-2 border-border bg-card sm:grid-cols-2",
        compact ? "p-2" : "p-4",
      )}
    >
      {teams.map((team) => {
        const delta = team.id === payoff.teamId ? payoff.delta : 0;
        const identity = teamIdentityOf(team.id, teams);
        return (
          <p
            key={team.id}
            data-testid={`explainer-score-${team.id}`}
            className={cn(
              "flex items-center justify-between gap-2 rounded-[var(--radius)] border-2 font-black",
              compact ? "p-2 text-xs" : "p-3",
              identity.border,
              delta !== 0 ? identity.solid : cn(identity.surface, identity.text),
            )}
          >
            <span className="truncate">{team.name}</span>
            <span className="akwaan-numeral shrink-0">
              {delta > 0 ? `+${delta}` : delta < 0 ? delta : "—"}
            </span>
          </p>
        );
      })}
    </div>
  );
}

/**
 * The explainer's own phone shell: a real portrait handset, ~9:19.5.
 *
 * Deliberately not the shared `PhoneFrame`. That one is `aspect-[9/18]` and
 * sized by its container, which is right for the how-to-play hero cluster it
 * was written for; here the container is a card column whose width is decided
 * by the shared screen beside it, so inheriting the width produced a phone with
 * no governing proportion at all — 0.61 wide-to-tall on desktop, 0.79 on
 * mobile, a tablet rather than a phone.
 *
 * So this variant fixes the *width* and derives the height from the aspect
 * ratio, rather than the other way round. A definite width plus `shrink-0`
 * means no grid track, flex row or `items-stretch` further up can squash or
 * stretch it, and the proportion holds at every breakpoint without a transform
 * scaling the device or its contents.
 */
const PHONE_SHELL_WIDTH = "w-[158px] sm:w-[166px]";

function CompactPhone({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="explainer-phone-shell"
      className={cn(
        "shrink-0 rounded-[1.5rem] border border-[hsl(var(--brand-navy)/.14)] bg-[hsl(var(--brand-navy))] p-[4px] shadow-[0_16px_34px_-18px_hsl(var(--brand-navy)/.7)]",
        PHONE_SHELL_WIDTH,
      )}
    >
      {/* The aspect ratio lives on the screen, so the glass is 9:19.5 and the
          navy bezel sits outside it, exactly as a real device reads. It also
          gives the screen a definite height, which is what lets the content
          below centre itself with `flex-1`. */}
      <div className="relative aspect-[9/19.5] overflow-hidden rounded-[1.2rem] bg-white">
        <span
          aria-hidden
          className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-[hsl(var(--brand-navy)/.16)]"
        />
        <div className="flex h-full flex-col justify-center gap-2 px-2.5 pb-3 pt-7">
          {children}
        </div>
      </div>
    </div>
  );
}

function PhoneColumn({
  label,
  identity,
  compact = false,
  children,
}: {
  label: string;
  identity: TeamIdentity;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={compact ? "w-fit space-y-1.5" : "space-y-2"}>
      <p
        className={cn(
          "rounded-[var(--radius)] border-2 text-center font-black",
          compact
            ? cn("px-2 py-1 text-[0.65rem]", PHONE_SHELL_WIDTH)
            : "px-3 py-1.5 text-xs",
          identity.border,
          identity.surface,
          identity.text,
        )}
      >
        {label}
      </p>
      {compact ? (
        <div className="mx-auto w-fit">
          <CompactPhone>{children}</CompactPhone>
        </div>
      ) : (
        <PhoneFrame className="mx-auto w-full max-w-[190px] sm:max-w-[210px]">
          {children}
        </PhoneFrame>
      )}
    </div>
  );
}

function AnsweringPhone({
  scenario,
  view,
  locked,
  revealed,
  showPrompt = true,
}: {
  scenario: RyoTutorialScenario;
  view: TutorialView;
  locked: boolean;
  revealed: boolean;
  showPrompt?: boolean;
}) {
  const { correct, answerLabel, correctLabel } = view;
  if (revealed) {
    return (
      <PhoneBody testId="explainer-phone-answering-reveal">
        <PhoneResult
          correct={correct}
          rows={[
            { label: "إجابتكم", value: answerLabel },
            { label: "الصحيحة", value: correctLabel },
            {
              label: "قرار الخصم",
              value: ryoDecisionRevealLabel(toPresentationDecision(scenario.opposingDecision)),
            },
          ]}
        />
      </PhoneBody>
    );
  }
  if (locked) {
    return (
      <PhoneBody testId="explainer-phone-answering-waiting">
        <PhoneWaiting
          headline="وصل اختيارك"
          row={{ label: "إجابتكم", value: answerLabel }}
          hint="ننتظر قرار الخصم…"
        />
      </PhoneBody>
    );
  }
  return (
    <div
      className="flex w-full min-h-0 flex-1 flex-col gap-1.5"
      data-testid="explainer-phone-answer-controls"
    >
      {showPrompt && (
        <p className="shrink-0 text-center text-[0.76rem] font-black leading-snug text-foreground">
          <BidiText>{scenario.prompt}</BidiText>
        </p>
      )}
      <div className="grid flex-1 content-center gap-2">
        {scenario.options.map((option) => (
          <AnswerOption
            key={option.id}
            selected={option.id === scenario.answeringSelectionOptionId && locked}
            disabled
            onClick={() => undefined}
            className="min-h-0 py-2.5 text-[0.8rem] leading-snug disabled:opacity-100"
          >
            <BidiText>{option.label}</BidiText>
          </AnswerOption>
        ))}
      </div>
    </div>
  );
}

function DecidingPhone({
  scenario,
  view,
  locked,
  revealed,
}: {
  scenario: RyoTutorialScenario;
  view: TutorialView;
  locked: boolean;
  revealed: boolean;
}) {
  const { correct, answerLabel, correctLabel } = view;
  if (revealed) {
    return (
      <PhoneBody testId="explainer-phone-deciding-reveal">
        <PhoneResult
          correct={correct}
          rows={[
            {
              label: "قرارك",
              value: ryoDecisionRevealLabel(toPresentationDecision(scenario.opposingDecision)),
            },
            { label: "إجابتهم", value: answerLabel },
            { label: "الصحيحة", value: correctLabel },
          ]}
        />
      </PhoneBody>
    );
  }
  if (locked) {
    return (
      <PhoneBody testId="explainer-phone-deciding-waiting">
        <PhoneWaiting
          headline="ثبّت قرارك"
          row={{
            label: "قرارك",
            value: ryoDecisionRevealLabel(toPresentationDecision(scenario.opposingDecision)),
          }}
          hint="الكشف بعد لحظة…"
        />
      </PhoneBody>
    );
  }
  return (
    <div
      className="flex w-full min-h-0 flex-1 flex-col gap-1.5"
      data-testid="explainer-phone-decision-controls"
    >
      <p className="flex flex-1 items-center justify-center text-center text-[0.78rem] font-bold leading-snug text-muted-foreground">
        اقرأوا الفريق الثاني واختاروا
      </p>
      <div className="grid gap-2">
        {(
          [
            { decision: "trust" as const, Icon: HelpCircle },
            { decision: "steal" as const, Icon: Swords },
          ]
        ).map(({ decision, Icon }) => (
          <Button
            key={decision}
            size="lg"
            variant="outline"
            disabled
            data-decision={decision}
            className="h-auto min-h-0 flex-row items-center justify-center gap-1.5 whitespace-normal border-2 bg-card px-2 py-2.5 text-center font-black disabled:opacity-100"
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="text-[0.76rem] leading-tight">
              {RYO_DECISION_PRESENTATION[decision].title}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * The locked-in state, built like the result screen rather than a lone
 * sentence: a 9:19.5 frame holding one line of text is mostly empty glass.
 * It also shows the team its own locked choice, which is what the real phone
 * does — and what makes the privacy point, since the other phone shows nothing.
 */
function PhoneWaiting({
  headline,
  row,
  hint,
}: {
  headline: string;
  row: { label: string; value: string };
  hint: string;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
        <Lock className="size-4" aria-hidden />
      </span>
      <p className="text-[0.85rem] font-black text-foreground">{headline}</p>
      <p className="w-full rounded-[var(--radius)] border border-border bg-muted/60 px-2 py-1.5 text-start">
        <span className="block text-[0.6rem] font-bold text-muted-foreground">
          {row.label}
        </span>
        <span className="block break-words text-[0.78rem] font-black leading-snug text-foreground">
          {row.value}
        </span>
      </p>
      <p className="text-[0.7rem] font-bold leading-snug text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

function PhoneResult({
  rows,
  correct,
}: {
  rows: { label: string; value: string }[];
  correct: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <p
        className={cn(
          "rounded-[var(--radius)] px-2 py-2 text-center text-[0.85rem] font-black text-sem-reveal-foreground",
          correct ? "bg-sem-success" : "bg-sem-error",
        )}
      >
        {correct ? "إجابة صحيحة" : "إجابة غير صحيحة"}
      </p>
      <dl className="grid gap-1.5 text-start">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-[var(--radius)] border border-border bg-muted/60 px-2 py-1.5"
          >
            <dt className="text-[0.6rem] font-bold text-muted-foreground">
              {row.label}
            </dt>
            <dd className="break-words text-[0.78rem] font-black leading-snug text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PhoneBody({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex w-full min-h-0 flex-1 flex-col items-center justify-center gap-1.5 text-center"
    >
      {children}
    </div>
  );
}

function LockIndicator({
  teamName: name,
  role,
  identity,
  locked,
  testId,
}: {
  teamName: string;
  role: string;
  identity: TeamIdentity;
  locked: boolean;
  testId: string;
}) {
  const Icon = locked ? Lock : Unlock;
  return (
    <p
      data-testid={testId}
      data-locked={locked ? "true" : "false"}
      className={cn(
        "flex items-center justify-between gap-2 rounded-[var(--radius)] border-2 p-3 font-bold transition-colors duration-base ease-akwaan",
        identity.border,
        locked ? identity.solid : cn(identity.surface, identity.text),
      )}
    >
      <span className="min-w-0">
        <span className="block text-[0.7rem] font-bold opacity-80">{role}</span>
        <strong className="block truncate font-black">{name}</strong>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-black">
        <Icon className="size-4" aria-hidden />
        {locked ? "اختار" : "يختار…"}
      </span>
    </p>
  );
}
