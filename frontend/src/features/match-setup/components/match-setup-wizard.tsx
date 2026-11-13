"use client";

import { RequireAuth } from "@/components/auth/require-auth";
import { AkwaanLoader } from "@/components/akwaan/akwaan-loader";
import { useDelayedVisible } from "@/lib/use-delayed-visible";
import { JourneyShell } from "@/features/worlds/components/journey-shell";
import { OccurrenceScopesStep } from "./occurrence-scopes-step";
import { OccurrenceWorldStep, StepFooter } from "./occurrence-world-step";
import { SetupProgress } from "./setup-progress";
import { useMatchSetup } from "../state/use-match-setup";
import {
  OCCURRENCE_COUNT,
  isOccurrenceComplete,
  occurrenceLabel,
} from "../state/match-setup-draft";
import { withLamPrefix } from "@/lib/arabic-plural";

/**
 * The pre-match setup journey.
 *
 * The whole Match is configured here — three World occurrences, four Scopes each —
 * and *nothing* is created on the server until the host confirms the last one on
 * the last step. Until then there is no session, no Match, no QR, and no
 * participants: this is a request being composed, and the backend validates all of
 * it in one atomic call.
 */
export function MatchSetupWizard({ initialWorldId }: { initialWorldId?: string }) {
  const { draft, act, start, submitting, rolledBack } =
    useMatchSetup(initialWorldId);
  // The CTA enters pending immediately (below); the branded loader only takes over
  // once the multi-request creation is genuinely still running, so a fast run — or
  // a fast failure that restores the form — never flashes a full-screen loader.
  const creating = useDelayedVisible(submitting, 350);
  const active = draft.occurrences.find(
    (occurrence) => occurrence.occurrenceIndex === draft.activeOccurrenceIndex,
  );
  const occurrenceIssue =
    draft.issue?.occurrenceIndex === draft.activeOccurrenceIndex
      ? draft.issue.message
      : undefined;
  // Whether confirming *this* occurrence leaves the whole draft complete, which
  // is the moment the Match is created. Asked of the draft as it stands, since
  // the reducer's own answer only exists after the dispatch.
  const confirmingCompletesDraft = Boolean(
    active &&
      isOccurrenceComplete(active) &&
      draft.occurrences.every(
        (occurrence) =>
          occurrence.occurrenceIndex === active.occurrenceIndex ||
          isOccurrenceComplete(occurrence),
      ),
  );

  return (
    <RequireAuth>
      {creating && (
        <div
          data-testid="match-creation-loader"
          className="fixed inset-0 z-50 grid place-items-center bg-[hsl(var(--background))]"
        >
          <AkwaanLoader label="نجهز المباراة..." />
        </div>
      )}
      <JourneyShell
        trail={[{ label: "العوالم", href: "/" }, { label: "مباراة جديدة" }]}
      >
        <div
          className="space-y-8"
          data-testid="match-setup-wizard"
          data-step={draft.activeStep}
        >
          <header>
            <p className="text-sm font-black text-success">إعداد المباراة</p>
            <h1 className="mt-1 text-3xl font-black text-foreground sm:text-4xl">
              جهّز المباراة كاملة
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              اختر {OCCURRENCE_COUNT} عوالم و4 نطاقات لكل عالم. تُنشأ المباراة مرة
              واحدة في النهاية، وتفتح غرفة الانتظار ولوحتها كاملة بـ12 تحديًا.
            </p>
          </header>

          <SetupProgress
            draft={draft}
            onEditWorld={(occurrenceIndex) =>
              act({ type: "edit-world", occurrenceIndex })
            }
          />

          {/* A failure the server did not pin on one occurrence — an existing
              Match, a dropped connection — belongs to the whole setup, so it is
              shown here rather than inside whichever occurrence is open. */}
          {draft.issue && draft.issue.occurrenceIndex === undefined && (
            <div className="space-y-1 text-center">
              <p role="alert" className="text-sm font-bold text-destructive">
                {draft.issue.message}
              </p>
              {rolledBack && (
                <p className="text-sm leading-6 text-muted-foreground">
                  ما انشأنا ولا مباراة، وألغينا الجلسة المؤقتة. إعدادك محفوظ زي ما هو.
                </p>
              )}
            </div>
          )}

          {draft.activeStep === "world" && active && (
            <div className="space-y-5">
              <OccurrenceWorldStep
                occurrenceIndex={active.occurrenceIndex}
                selectedWorldId={active.worldId}
                alreadyChosenWorldIds={draft.occurrences
                  .filter(
                    (occurrence) =>
                      occurrence.occurrenceIndex !== active.occurrenceIndex &&
                      occurrence.worldId,
                  )
                  .map((occurrence) => occurrence.worldId as string)}
                onChoose={(worldId) =>
                  act({
                    type: "choose-world",
                    occurrenceIndex: active.occurrenceIndex,
                    worldId,
                  })
                }
              />
              {occurrenceIssue && (
                <p role="alert" className="text-sm font-bold text-destructive">
                  {occurrenceIssue}
                </p>
              )}
              <StepFooter
                onBack={() => act({ type: "back" })}
                backDisabled={active.occurrenceIndex === 0}
              >
                <p className="text-sm leading-6 text-muted-foreground">
                  اختر عالمًا {withLamPrefix(occurrenceLabel(active.occurrenceIndex))}.
                </p>
              </StepFooter>
            </div>
          )}

          {draft.activeStep === "scopes" && active?.worldId && (
            <OccurrenceScopesStep
              occurrenceIndex={active.occurrenceIndex}
              worldId={active.worldId}
              selectedScopeIds={active.selectedScopeIds}
              issue={occurrenceIssue}
              onToggle={(scopeId) =>
                act({
                  type: "toggle-scope",
                  occurrenceIndex: active.occurrenceIndex,
                  scopeId,
                })
              }
              onBack={() => act({ type: "back" })}
              onChangeWorld={() =>
                act({
                  type: "edit-world",
                  occurrenceIndex: active.occurrenceIndex,
                })
              }
              onClear={() =>
                act({
                  type: "clear-occurrence",
                  occurrenceIndex: active.occurrenceIndex,
                })
              }
              // Confirming the last occurrence is what creates the Match and
              // opens the room: there is no team step to pass through, because
              // teams are not something a host sets up any more.
              isFinalOccurrence={confirmingCompletesDraft}
              submitting={submitting}
              rolledBack={rolledBack}
              onConfirm={() =>
                confirmingCompletesDraft
                  ? void start()
                  : act({ type: "confirm-scopes" })
              }
            />
          )}

        </div>
      </JourneyShell>
    </RequireAuth>
  );
}
