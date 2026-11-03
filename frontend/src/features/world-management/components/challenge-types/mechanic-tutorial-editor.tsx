"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Eye, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MechanicTutorialRenderer,
  type ClosestTutorialScenario,
  type BombTutorialScenario,
  type OneClueTutorialScenario,
  type Top5TutorialScenario,
  type RyoTutorialScenario,
  type ComboTutorialScenario,
  type MarhalaTutorialScenario,
  type LaqathaTutorialScenario,
  type FirstNoteTutorialScenario,
  type LaTahriqhaTutorialScenario,
  type OddPieceLegacyTutorialScenario,
  type EkshifniTutorialScenario,
  type TutorialScenario,
  SAMPLE_ODD_PIECE_V1_TUTORIAL_SCENARIO,
  SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO,
  SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO,
  SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";
import {
  fetchAdminTutorial,
  publishTutorial,
  saveTutorialDraft,
  validateTutorialDraft,
  type AdminTutorialState,
  type TutorialScenarioDraft,
  type TutorialValidation,
} from "../../api/mechanic-tutorial-api";

/**
 * Authoring the demonstration a mechanic teaches with.
 *
 * Three states are deliberately visible at once — what is live, what is being
 * edited, and whether they differ — because the risk this screen manages is an
 * editor believing a change is live when it is not, or the reverse.
 *
 * Two things an editor cannot do here, by construction rather than by warning:
 *
 * - **Set the score.** There is no outcome field. The result is derived from
 *   the real payoff rule and arrives back from the server, so the preview shows
 *   what the Match would actually award.
 * - **Publish a competitive question.** Validation runs the same overlap guard
 *   publishing does, and surfaces the matching items before the attempt.
 *
 * The preview is the production `RyoExplainer`, not a mock of it: what is being
 * reviewed is the thing hosts will see.
 */

const EMPTY: TutorialScenarioDraft = {
  kind: "ryo",
  version: 1,
  prompt: "",
  options: [
    { id: "a", label: "" },
    { id: "b", label: "" },
    { id: "c", label: "" },
    { id: "d", label: "" },
  ],
  correctOptionId: "a",
  answeringSelectionOptionId: "a",
  opposingDecision: "STEAL",
};

export function MechanicTutorialEditor({
  mechanicKey,
}: {
  mechanicKey: string;
}) {
  return mechanicKey === "closest" ? (
    <ClosestTutorialEditor mechanicKey={mechanicKey} />
  ) : mechanicKey === "bomb" ? (
    <BombTutorialEditor mechanicKey={mechanicKey} />
  ) : mechanicKey === "one-clue" ? (
    <OneClueTutorialEditor mechanicKey={mechanicKey} />
  ) : mechanicKey === "top-5" ? (
    <Top5TutorialEditor mechanicKey={mechanicKey} />
  ) : mechanicKey === "combo" ? (
    <ComboTutorialEditor mechanicKey={mechanicKey} />
  ) : mechanicKey === "marhala" ? (
    <MarhalaTutorialEditor mechanicKey={mechanicKey} />
  ) : mechanicKey === "laqatha" ? (
    <LaqathaTutorialEditor mechanicKey={mechanicKey} />
  ) : mechanicKey === "first-note" ? (
    <FirstNoteTutorialEditor mechanicKey={mechanicKey} />
  ) : mechanicKey === "odd-piece" ? (
    <OddPieceTutorialEditor mechanicKey={mechanicKey} />
  ) : mechanicKey === "ekshifni" ? (
    <EkshifniTutorialEditor mechanicKey={mechanicKey} />
  ) : mechanicKey === "la-tahriqha" ? (
    <LaTahriqhaTutorialEditor mechanicKey={mechanicKey} />
  ) : (
    <RyoTutorialEditor mechanicKey={mechanicKey} />
  );
}

function LaTahriqhaTutorialEditor({ mechanicKey }: { mechanicKey: string }) {
  const initial = stripOutcome(
    SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO,
  ) as TutorialScenarioDraft;
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState<TutorialScenarioDraft>(initial);
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const la = draft as Omit<LaTahriqhaTutorialScenario, "outcome">;
  useEffect(() => {
    let active = true;
    fetchAdminTutorial(mechanicKey)
      .then((next) => {
        if (!active) return;
        setState(next);
        const source = next.draft ?? next.published;
        if (source?.kind === "la-tahriqha") setDraft(stripOutcome(source));
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [mechanicKey]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const issues = extractIssues(error);
      setValidation({
        valid: false,
        issues,
        competitiveOverlap: extractOverlap(issues),
        outcome: null,
      });
      toast.error(issues[0]?.message ?? "تعذّرت العملية. حاول مرة ثانية.");
    } finally {
      setBusy(false);
    }
  };
  const update = (patch: Partial<typeof la>) =>
    setDraft((current) => ({ ...current, ...patch }) as TutorialScenarioDraft);
  const updateDish = (
    dishIndex: number,
    patch: Partial<(typeof la.dishes)[number]>,
  ) =>
    update({
      dishes: la.dishes.map((dish, index) =>
        index === dishIndex ? { ...dish, ...patch } : dish,
      ),
    });
  const updateIngredient = (
    dishIndex: number,
    ingredientIndex: number,
    patch: Partial<(typeof la.dishes)[number]["ingredients"][number]>,
  ) =>
    update({
      dishes: la.dishes.map((dish, index) =>
        index === dishIndex
          ? {
              ...dish,
              ingredients: dish.ingredients.map((ingredient, itemIndex) =>
                itemIndex === ingredientIndex
                  ? { ...ingredient, ...patch }
                  : ingredient,
              ),
            }
          : dish,
      ),
    });
  const preview = validation?.outcome
    ? ({ ...la, outcome: validation.outcome } as LaTahriqhaTutorialScenario)
    : state?.draft?.kind === "la-tahriqha"
      ? state.draft
      : null;
  return (
    <section
      data-testid="mechanic-tutorial-editor"
      className="space-y-3 rounded-[var(--radius)] border-2 border-border p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <h3 className="text-sm font-black">شرح لا تحرقها</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            ثلاثة أطباق، ثماني بطاقات، والنتيجة تُشتق من قاعدة الطبق نفسها.
          </p>
        </span>
        <PublishState state={state} />
      </header>
      <Textarea
        data-testid="tutorial-la-tahriqha-prompt"
        value={la.prompt}
        onChange={(event) => update({ prompt: event.target.value })}
      />
      <Input
        type="number"
        min={5}
        max={120}
        value={la.dishWindowSeconds}
        onChange={(event) =>
          update({ dishWindowSeconds: Number(event.target.value) })
        }
        placeholder="نافذة الطبق بالثواني"
      />
      <div className="grid gap-3 lg:grid-cols-3">
        {la.dishes.map((dish, dishIndex) => (
          <section
            key={dish.id}
            className="space-y-2 rounded-lg border border-border p-2"
          >
            <Input
              value={dish.name}
              onChange={(event) =>
                updateDish(dishIndex, { name: event.target.value })
              }
              placeholder={`اسم الطبق ${dishIndex + 1}`}
            />
            <div className="space-y-1">
              {dish.ingredients.map((ingredient, ingredientIndex) => (
                <div key={ingredient.id} className="flex items-center gap-1">
                  <Input
                    value={ingredient.label}
                    onChange={(event) =>
                      updateIngredient(dishIndex, ingredientIndex, {
                        label: event.target.value,
                      })
                    }
                    className="h-8 text-xs"
                  />
                  <label className="flex shrink-0 items-center gap-1 text-[0.62rem] font-bold">
                    <input
                      type="checkbox"
                      checked={ingredient.correct}
                      onChange={(event) =>
                        updateIngredient(dishIndex, ingredientIndex, {
                          correct: event.target.checked,
                        })
                      }
                    />
                    صحيحة
                  </label>
                </div>
              ))}
            </div>
            <Input
              value={dish.teamASelection.join(",")}
              onChange={(event) =>
                updateDish(dishIndex, {
                  teamASelection: event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
              placeholder="اختيارات الفريق الأول (المعرّفات)"
            />
            <Input
              value={dish.teamBSelection.join(",")}
              onChange={(event) =>
                updateDish(dishIndex, {
                  teamBSelection: event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
              placeholder="اختيارات الفريق الثاني (المعرّفات)"
            />
          </section>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={la.captainRotation.teamA.join("،")}
          onChange={(event) =>
            update({
              captainRotation: {
                ...la.captainRotation,
                teamA: event.target.value
                  .split("،")
                  .map((value) => value.trim())
                  .filter(Boolean),
              },
            })
          }
          placeholder="قادة الفريق الأول بالترتيب"
        />
        <Input
          value={la.captainRotation.teamB.join("،")}
          onChange={(event) =>
            update({
              captainRotation: {
                ...la.captainRotation,
                teamB: event.target.value
                  .split("،")
                  .map((value) => value.trim())
                  .filter(Boolean),
              },
            })
          }
          placeholder="قادة الفريق الثاني بالترتيب"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => setState(await saveTutorialDraft(mechanicKey, la)))
          }
        >
          <CheckCircle2 className="size-4" /> حفظ مسودة
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(async () =>
              setValidation(await validateTutorialDraft(mechanicKey, la)),
            )
          }
        >
          <Eye className="size-4" /> فحص ومعاينة
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !state?.draft}
          onClick={() =>
            run(async () => {
              setState(await publishTutorial(mechanicKey));
              setValidation(null);
            })
          }
        >
          <Send className="size-4" /> نشر
        </Button>
      </div>
      {validation && <ValidationReport validation={validation} />}
      {preview && (
        <div data-testid="tutorial-preview">
          <MechanicTutorialRenderer scenario={preview} compact mode="preview" />
        </div>
      )}
    </section>
  );
}

function OddPieceTutorialEditor({ mechanicKey }: { mechanicKey: string }) {
  const initial = stripOutcome(
    SAMPLE_ODD_PIECE_V1_TUTORIAL_SCENARIO,
  ) as TutorialScenarioDraft;
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState<TutorialScenarioDraft>(initial);
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const odd = draft as Omit<OddPieceLegacyTutorialScenario, "outcome">;
  useEffect(() => {
    let active = true;
    fetchAdminTutorial(mechanicKey)
      .then((next) => {
        if (!active) return;
        setState(next);
        const source = next.draft ?? next.published;
        if (source?.kind === "odd-piece") setDraft(stripOutcome(source));
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [mechanicKey]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const issues = extractIssues(error);
      setValidation({
        valid: false,
        issues,
        competitiveOverlap: extractOverlap(issues),
        outcome: null,
      });
      toast.error(issues[0]?.message ?? "تعذّرت العملية. حاول مرة ثانية.");
    } finally {
      setBusy(false);
    }
  };
  const update = (patch: Partial<typeof odd>) =>
    setDraft((current) => ({ ...current, ...patch }) as TutorialScenarioDraft);
  const preview = validation?.outcome
    ? ({
        ...odd,
        outcome: validation.outcome,
      } as OddPieceLegacyTutorialScenario)
    : state?.draft?.kind === "odd-piece"
      ? state.draft
      : null;
  return (
    <section
      data-testid="mechanic-tutorial-editor"
      className="space-y-3 rounded-[var(--radius)] border-2 border-border p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <h3 className="text-sm font-black">شرح القطعة الدخيلة</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            أربع قطع موثّقة: ثلاث من BMW M4 G82 وقطعة دخيلة من Mercedes-AMG C63
            W206.
          </p>
        </span>
        <PublishState state={state} />
      </header>
      <Textarea
        data-testid="tutorial-odd-piece-prompt"
        value={odd.prompt}
        onChange={(event) => update({ prompt: event.target.value })}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={odd.targetVehicleLabel}
          onChange={(event) =>
            update({ targetVehicleLabel: event.target.value })
          }
          placeholder="اسم السيارة الهدف (يظهر في الكشف)"
        />
        <Input
          value={odd.intruderVehicleLabel}
          onChange={(event) =>
            update({ intruderVehicleLabel: event.target.value })
          }
          placeholder="اسم السيارة الدخيلة (يظهر في الكشف)"
        />
      </div>
      <p className="rounded-lg bg-muted/50 p-2 text-xs leading-5 text-muted-foreground">
        الصور المحلية والمصادر والترخيص محفوظة في حزمة المعاينة؛ لا تُرفع هذه
        المسودة إلى R2 من هذا المحرر.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => setState(await saveTutorialDraft(mechanicKey, odd)))
          }
        >
          <CheckCircle2 className="size-4" /> حفظ مسودة
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(async () =>
              setValidation(await validateTutorialDraft(mechanicKey, odd)),
            )
          }
        >
          <Eye className="size-4" /> فحص ومعاينة
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !state?.draft}
          onClick={() =>
            run(async () => {
              setState(await publishTutorial(mechanicKey));
              setValidation(null);
            })
          }
        >
          <Send className="size-4" /> نشر
        </Button>
      </div>
      {validation && <ValidationReport validation={validation} />}
      {preview && (
        <div data-testid="tutorial-preview">
          <MechanicTutorialRenderer scenario={preview} compact mode="preview" />
        </div>
      )}
    </section>
  );
}

function FirstNoteTutorialEditor({ mechanicKey }: { mechanicKey: string }) {
  const initial: TutorialScenarioDraft = {
    kind: "first-note",
    version: 1,
    prompt: "تعرّفوا على الأغنية من مزاد ثوانٍ قصير.",
    title: "",
    clueLabel: "السياق",
    contextualClue: "",
    bids: [
      { team: "team-a", seconds: 8 },
      { team: "team-b", seconds: 5 },
      { team: "team-a", seconds: 3 },
    ],
    acceptedAnswers: [""],
    firstSubmittedAnswer: "",
    stealSubmittedAnswer: "",
    caption: "",
  } as TutorialScenarioDraft;
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState<TutorialScenarioDraft>(initial);
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const firstNote = draft as Omit<FirstNoteTutorialScenario, "outcome">;

  useEffect(() => {
    let active = true;
    fetchAdminTutorial(mechanicKey)
      .then((next) => {
        if (!active) return;
        setState(next);
        const source = next.draft ?? next.published;
        if (source?.kind === "first-note") setDraft(stripOutcome(source));
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [mechanicKey]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const issues = extractIssues(error);
      setValidation({
        valid: false,
        issues,
        competitiveOverlap: extractOverlap(issues),
        outcome: null,
      });
      toast.error(issues[0]?.message ?? "تعذّرت العملية. حاول مرة ثانية.");
    } finally {
      setBusy(false);
    }
  };
  const update = (patch: Partial<typeof firstNote>) =>
    setDraft((current) => ({ ...current, ...patch }) as TutorialScenarioDraft);
  const preview = validation?.outcome
    ? ({
        ...firstNote,
        outcome: validation.outcome,
      } as FirstNoteTutorialScenario)
    : state?.draft?.kind === "first-note"
      ? state.draft
      : null;

  return (
    <section
      data-testid="mechanic-tutorial-editor"
      className="space-y-3 rounded-[var(--radius)] border-2 border-border p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <h3 className="text-sm font-black">شرح من أول نغمة</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            دليل واحد، مزاد 8 ثم 5 ثم 3، ثم إجابة وسرقة بنفس المقطع.
          </p>
        </span>
        <PublishState state={state} />
      </header>
      <Textarea
        data-testid="tutorial-first-note-prompt"
        value={firstNote.prompt}
        onChange={(event) => update({ prompt: event.target.value })}
        placeholder="السؤال التعليمي"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          data-testid="tutorial-first-note-title"
          value={firstNote.title}
          onChange={(event) => update({ title: event.target.value })}
          placeholder="عنوان الأغنية الذي يظهر في الكشف"
        />
        <Input
          data-testid="tutorial-first-note-clue"
          value={firstNote.contextualClue}
          onChange={(event) => update({ contextualClue: event.target.value })}
          placeholder="الدليل السياقي غير الكاشف"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {firstNote.bids.map((bid, index) => (
          <Input
            key={bid.team}
            type="number"
            min={1}
            max={15}
            data-testid={`tutorial-first-note-bid-${index + 1}`}
            value={bid.seconds}
            onChange={(event) =>
              update({
                bids: firstNote.bids.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, seconds: Number(event.target.value) }
                    : item,
                ),
              })
            }
            placeholder={`مزايدة ${index + 1}`}
          />
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          data-testid="tutorial-first-note-accepted"
          value={firstNote.acceptedAnswers.join(" | ")}
          onChange={(event) =>
            update({
              acceptedAnswers: event.target.value
                .split("|")
                .map((answer) => answer.trim()),
            })
          }
          placeholder="إجابة مقبولة | بديلة"
        />
        <Input
          data-testid="tutorial-first-note-first"
          value={firstNote.firstSubmittedAnswer}
          onChange={(event) =>
            update({ firstSubmittedAnswer: event.target.value })
          }
          placeholder="إجابة الفريق الأول الخاطئة"
        />
        <Input
          data-testid="tutorial-first-note-steal"
          value={firstNote.stealSubmittedAnswer}
          onChange={(event) =>
            update({ stealSubmittedAnswer: event.target.value })
          }
          placeholder="إجابة السرقة الصحيحة"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-save"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setState(await saveTutorialDraft(mechanicKey, firstNote));
              setValidation(null);
            })
          }
        >
          حفظ المسودة
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-validate"
          disabled={busy}
          onClick={() =>
            run(async () =>
              setValidation(
                await validateTutorialDraft(mechanicKey, firstNote),
              ),
            )
          }
        >
          <Eye className="size-4" /> فحص ومعاينة
        </Button>
        <Button
          type="button"
          data-testid="tutorial-publish"
          disabled={busy || !state?.draft}
          onClick={() =>
            run(async () => {
              setState(await publishTutorial(mechanicKey));
              setValidation(null);
            })
          }
        >
          <Send className="size-4" /> نشر
        </Button>
      </div>
      {validation && <ValidationReport validation={validation} />}
      {preview && (
        <div data-testid="tutorial-preview">
          <MechanicTutorialRenderer scenario={preview} compact mode="preview" />
        </div>
      )}
    </section>
  );
}

function LaqathaTutorialEditor({ mechanicKey }: { mechanicKey: string }) {
  const initial: TutorialScenarioDraft = {
    kind: "laqatha",
    version: 1,
    prompt: "تعرّفوا على الفيلم من أدلة متدرجة.",
    title: "",
    clues: [
      { order: 1, value: 5, text: "" },
      { order: 2, value: 4, text: "" },
      { order: 3, value: 3, text: "" },
      { order: 4, value: 2, text: "" },
      { order: 5, value: 1, text: "" },
    ],
    acceptedAnswers: [""],
    firstSubmittedAnswer: "",
    secondSubmittedAnswer: "",
    caption: "",
  } as TutorialScenarioDraft;
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState<TutorialScenarioDraft>(initial);
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const laqatha = draft as Omit<LaqathaTutorialScenario, "outcome">;

  useEffect(() => {
    let active = true;
    fetchAdminTutorial(mechanicKey)
      .then((next) => {
        if (!active) return;
        setState(next);
        const source = next.draft ?? next.published;
        if (source?.kind === "laqatha") setDraft(stripOutcome(source));
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [mechanicKey]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const issues = extractIssues(error);
      setValidation({
        valid: false,
        issues,
        competitiveOverlap: extractOverlap(issues),
        outcome: null,
      });
      toast.error(issues[0]?.message ?? "تعذّرت العملية. حاول مرة ثانية.");
    } finally {
      setBusy(false);
    }
  };
  const update = (patch: Partial<typeof laqatha>) =>
    setDraft((current) => ({ ...current, ...patch }) as TutorialScenarioDraft);
  const preview = validation?.outcome
    ? ({ ...laqatha, outcome: validation.outcome } as LaqathaTutorialScenario)
    : state?.draft?.kind === "laqatha"
      ? state.draft
      : null;

  return (
    <section
      data-testid="mechanic-tutorial-editor"
      className="space-y-3 rounded-[var(--radius)] border-2 border-border p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <h3 className="text-sm font-black">شرح القطها</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            خمسة أدلة: الفريق الأول يخطئ في نافذة 4 نقاط، ثم يكمل الفريق الثاني
            من الدليل الثالث.
          </p>
        </span>
        <PublishState state={state} />
      </header>
      <Textarea
        data-testid="tutorial-laqatha-prompt"
        value={laqatha.prompt}
        onChange={(event) => update({ prompt: event.target.value })}
        placeholder="السؤال التعليمي"
      />
      <Input
        data-testid="tutorial-laqatha-title"
        value={laqatha.title}
        onChange={(event) => update({ title: event.target.value })}
        placeholder="عنوان الفيلم الذي يظهر في Reveal فقط"
      />
      <div className="space-y-2">
        {laqatha.clues.map((clue, index) => (
          <div
            key={clue.order}
            className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2"
          >
            <span className="grid place-items-center rounded border text-xs font-black">
              {clue.value}
            </span>
            <Input
              data-testid={`tutorial-laqatha-clue-${index + 1}`}
              value={clue.text}
              onChange={(event) =>
                update({
                  clues: laqatha.clues.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, text: event.target.value }
                      : item,
                  ),
                })
              }
              placeholder={`الدليل ${index + 1}`}
            />
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          data-testid="tutorial-laqatha-accepted"
          value={laqatha.acceptedAnswers.join(" | ")}
          onChange={(event) =>
            update({
              acceptedAnswers: event.target.value
                .split("|")
                .map((answer) => answer.trim()),
            })
          }
          placeholder="إجابات مقبولة مفصولة بـ |"
        />
        <Input
          data-testid="tutorial-laqatha-first"
          value={laqatha.firstSubmittedAnswer}
          onChange={(event) =>
            update({ firstSubmittedAnswer: event.target.value })
          }
          placeholder="إجابة الفريق الأول الخاطئة"
        />
        <Input
          data-testid="tutorial-laqatha-second"
          value={laqatha.secondSubmittedAnswer}
          onChange={(event) =>
            update({ secondSubmittedAnswer: event.target.value })
          }
          placeholder="إجابة الفريق الثاني الصحيحة"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-save"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setState(await saveTutorialDraft(mechanicKey, laqatha));
              setValidation(null);
            })
          }
        >
          حفظ المسودة
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-validate"
          disabled={busy}
          onClick={() =>
            run(async () =>
              setValidation(await validateTutorialDraft(mechanicKey, laqatha)),
            )
          }
        >
          <Eye className="size-4" /> فحص ومعاينة
        </Button>
        <Button
          type="button"
          data-testid="tutorial-publish"
          disabled={busy || !state?.draft}
          onClick={() =>
            run(async () => {
              setState(await publishTutorial(mechanicKey));
              setValidation(null);
            })
          }
        >
          <Send className="size-4" /> نشر
        </Button>
      </div>
      {validation && <ValidationReport validation={validation} />}
      {preview && (
        <div data-testid="tutorial-preview">
          <MechanicTutorialRenderer scenario={preview} compact mode="preview" />
        </div>
      )}
    </section>
  );
}

function MarhalaTutorialEditor({ mechanicKey }: { mechanicKey: string }) {
  const initial: TutorialScenarioDraft = {
    kind: "marhala",
    version: 1,
    prompt: "",
    correctAnswer: "",
    submittedAnswer: "",
    teamAPosition: 4,
    teamBPosition: 11,
    activeTeam: "team-a",
    difficulty: "hard",
    movement: 4,
    baseLanding: 8,
    tile: "boost",
    finalLanding: 13,
    caption: "",
  };
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState<TutorialScenarioDraft>(initial);
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const marhala = draft as Omit<MarhalaTutorialScenario, "outcome">;

  useEffect(() => {
    let active = true;
    fetchAdminTutorial(mechanicKey)
      .then((next) => {
        if (!active) return;
        setState(next);
        const source = next.draft ?? next.published;
        if (source?.kind === "marhala") setDraft(stripOutcome(source));
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [mechanicKey]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const issues = extractIssues(error);
      setValidation({
        valid: false,
        issues,
        competitiveOverlap: extractOverlap(issues),
        outcome: null,
      });
      toast.error(issues[0]?.message ?? "تعذّرت العملية. حاول مرة ثانية.");
    } finally {
      setBusy(false);
    }
  };
  const update = (patch: Partial<typeof marhala>) =>
    setDraft((current) => ({ ...current, ...patch }) as TutorialScenarioDraft);
  const preview = validation?.outcome
    ? ({ ...marhala, outcome: validation.outcome } as MarhalaTutorialScenario)
    : state?.draft?.kind === "marhala"
      ? state.draft
      : null;

  return (
    <section
      data-testid="mechanic-tutorial-editor"
      className="space-y-3 rounded-[var(--radius)] border-2 border-border p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <h3 className="text-sm font-black">شرح المرحلة</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            لوحة حقيقية 4×4: اختيار الصعوبة، سؤال، حركة وتأثير مربع.
          </p>
        </span>
        <PublishState state={state} />
      </header>
      <Textarea
        data-testid="tutorial-marhala-prompt"
        value={marhala.prompt}
        onChange={(event) => update({ prompt: event.target.value })}
        placeholder="السؤال التعليمي"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          data-testid="tutorial-marhala-correct"
          value={marhala.correctAnswer}
          onChange={(event) => update({ correctAnswer: event.target.value })}
          placeholder="الإجابة الصحيحة"
        />
        <Input
          data-testid="tutorial-marhala-submitted"
          value={marhala.submittedAnswer}
          onChange={(event) => update({ submittedAnswer: event.target.value })}
          placeholder="الإجابة المرسلة"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          type="number"
          value={marhala.teamAPosition}
          onChange={(event) =>
            update({ teamAPosition: Number(event.target.value) })
          }
          aria-label="موضع الفريق الأول"
        />
        <Input
          type="number"
          value={marhala.teamBPosition}
          onChange={(event) =>
            update({ teamBPosition: Number(event.target.value) })
          }
          aria-label="موضع الفريق الثاني"
        />
        <select
          value={marhala.difficulty}
          onChange={(event) =>
            update({
              difficulty: event.target
                .value as MarhalaTutorialScenario["difficulty"],
            })
          }
          className="h-10 rounded-[var(--radius)] border border-border bg-background px-2 text-sm font-bold"
        >
          <option value="easy">سهل 1–2</option>
          <option value="medium">متوسط 2–4</option>
          <option value="hard">صعب 4–6</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-save"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setState(await saveTutorialDraft(mechanicKey, marhala));
              setValidation(null);
            })
          }
        >
          حفظ المسودة
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-validate"
          disabled={busy}
          onClick={() =>
            run(async () =>
              setValidation(await validateTutorialDraft(mechanicKey, marhala)),
            )
          }
        >
          <Eye className="size-4" /> فحص ومعاينة
        </Button>
        <Button
          type="button"
          data-testid="tutorial-publish"
          disabled={busy || !state?.draft}
          onClick={() =>
            run(async () => {
              setState(await publishTutorial(mechanicKey));
              setValidation(null);
            })
          }
        >
          <Send className="size-4" /> نشر
        </Button>
      </div>
      {validation && <ValidationReport validation={validation} />}
      {preview && (
        <div data-testid="tutorial-preview">
          <MechanicTutorialRenderer scenario={preview} compact mode="preview" />
        </div>
      )}
    </section>
  );
}

function Top5TutorialEditor({ mechanicKey }: { mechanicKey: string }) {
  const initial: TutorialScenarioDraft = {
    kind: "top-5",
    version: 1,
    prompt: "",
    title: "",
    rankingBasis: "",
    sourceLabel: "",
    startingTeam: "team-a",
    entries: Array.from({ length: 10 }, (_, index) => ({
      id: `entry-${index + 1}`,
      label: "",
      rank: index < 5 ? index + 1 : null,
    })),
    decisions: Array.from({ length: 10 }, (_, index) => ({
      action: index % 2 === 0 ? "keep" : "give",
    })),
  };
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState<TutorialScenarioDraft>(initial);
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAdminTutorial(mechanicKey)
      .then((next) => {
        if (!active) return;
        setState(next);
        const source = next.draft ?? next.published;
        if (source?.kind === "top-5") setDraft(stripOutcome(source));
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [mechanicKey]);

  const top5 = draft as Omit<Top5TutorialScenario, "outcome">;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const issues = extractIssues(error);
      setValidation({
        valid: false,
        issues,
        competitiveOverlap: extractOverlap(issues),
        outcome: null,
      });
      toast.error(issues[0]?.message ?? "تعذّرت العملية. حاول مرة ثانية.");
    } finally {
      setBusy(false);
    }
  };
  const preview = validation?.outcome
    ? ({ ...top5, outcome: validation.outcome } as Top5TutorialScenario)
    : state?.draft?.kind === "top-5"
      ? state.draft
      : null;
  const update = (patch: Partial<typeof top5>) =>
    setDraft((current) => ({ ...current, ...patch }) as TutorialScenarioDraft);

  return (
    <section
      data-testid="mechanic-tutorial-editor"
      className="space-y-3 rounded-[var(--radius)] border-2 border-border p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <h3 className="text-sm font-black">شرح أفضل 5</h3>
          <p className="text-xs text-muted-foreground">
            أدخل قائمة من عشر بطاقات؛ النتيجة والملكية تُشتقان من قرارات
            الاحتفاظ والدس.
          </p>
        </span>
        <PublishState state={state} />
      </header>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <FieldLabel htmlFor="tutorial-prompt">السؤال التعليمي</FieldLabel>
          <Textarea
            id="tutorial-prompt"
            data-testid="tutorial-prompt"
            value={top5.prompt}
            onChange={(event) => update({ prompt: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <FieldLabel htmlFor="tutorial-top5-title">عنوان القائمة</FieldLabel>
          <Input
            id="tutorial-top5-title"
            data-testid="tutorial-top5-title"
            value={top5.title}
            onChange={(event) => update({ title: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <FieldLabel htmlFor="tutorial-top5-basis">أساس الترتيب</FieldLabel>
          <Input
            id="tutorial-top5-basis"
            data-testid="tutorial-top5-basis"
            value={top5.rankingBasis}
            onChange={(event) => update({ rankingBasis: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <FieldLabel htmlFor="tutorial-top5-source">المصدر</FieldLabel>
          <Input
            id="tutorial-top5-source"
            data-testid="tutorial-top5-source"
            value={top5.sourceLabel}
            onChange={(event) => update({ sourceLabel: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <FieldLabel htmlFor="tutorial-top5-start">
            الفريق الذي يبدأ
          </FieldLabel>
          <select
            id="tutorial-top5-start"
            data-testid="tutorial-top5-start"
            value={top5.startingTeam}
            onChange={(event) =>
              update({
                startingTeam: event.target.value as "team-a" | "team-b",
              })
            }
            className="h-10 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm font-bold"
          >
            <option value="team-a">الفريق الأول</option>
            <option value="team-b">الفريق الثاني</option>
          </select>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {top5.entries.map((entry, index) => (
          <div
            key={entry.id}
            className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2 rounded-lg border p-2"
          >
            <div className="space-y-1">
              <FieldLabel
                htmlFor={`tutorial-top5-entry-${index}`}
              >{`البطاقة ${index + 1}`}</FieldLabel>
              <Input
                id={`tutorial-top5-entry-${index}`}
                data-testid={`tutorial-top5-entry-${index}`}
                value={entry.label}
                onChange={(event) =>
                  update({
                    entries: top5.entries.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, label: event.target.value }
                        : item,
                    ),
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor={`tutorial-top5-rank-${index}`}>
                الرتبة
              </FieldLabel>
              <Input
                id={`tutorial-top5-rank-${index}`}
                data-testid={`tutorial-top5-rank-${index}`}
                type="number"
                placeholder="فخ"
                value={entry.rank ?? ""}
                onChange={(event) =>
                  update({
                    entries: top5.entries.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            rank:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          }
                        : item,
                    ),
                  })
                }
              />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {top5.decisions.map((decision, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-xs font-bold"
          >
            <span>قرار البطاقة {index + 1}</span>
            <select
              data-testid={`tutorial-top5-decision-${index}`}
              value={decision.action}
              onChange={(event) =>
                update({
                  decisions: top5.decisions.map((item, itemIndex) =>
                    itemIndex === index
                      ? { action: event.target.value as "keep" | "give" }
                      : item,
                  ),
                })
              }
              className="h-8 rounded border border-border bg-background px-2 font-bold"
            >
              <option value="keep">احتفظ بها</option>
              <option value="give">دسّها للخصم</option>
            </select>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-save"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setState(await saveTutorialDraft(mechanicKey, top5));
              setValidation(null);
            })
          }
        >
          حفظ المسودة
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-validate"
          disabled={busy}
          onClick={() =>
            run(async () =>
              setValidation(await validateTutorialDraft(mechanicKey, top5)),
            )
          }
        >
          <Eye className="size-4" /> فحص ومعاينة
        </Button>
        <Button
          type="button"
          data-testid="tutorial-publish"
          disabled={busy || !state?.draft}
          onClick={() =>
            run(async () => {
              setState(await publishTutorial(mechanicKey));
              setValidation(null);
            })
          }
        >
          <Send className="size-4" /> نشر
        </Button>
      </div>
      {validation && <ValidationReport validation={validation} />}
      {preview && (
        <div data-testid="tutorial-preview">
          <MechanicTutorialRenderer scenario={preview} compact mode="preview" />
        </div>
      )}
    </section>
  );
}

function ComboTutorialEditor({ mechanicKey }: { mechanicKey: string }) {
  const initial: TutorialScenarioDraft = {
    kind: "combo",
    version: 1,
    stages: [
      { stage: 1, prompt: "", correctAnswer: "", submittedAnswer: "" },
      { stage: 2, prompt: "", correctAnswer: "", submittedAnswer: "" },
      { stage: 3, prompt: "", correctAnswer: "", submittedAnswer: "" },
    ],
    caption: "",
  };
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState<TutorialScenarioDraft>(initial);
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const combo = draft as Omit<ComboTutorialScenario, "outcome">;

  useEffect(() => {
    let active = true;
    fetchAdminTutorial(mechanicKey)
      .then((next) => {
        if (!active) return;
        setState(next);
        const source = next.draft ?? next.published;
        if (source?.kind === "combo") setDraft(stripOutcome(source));
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [mechanicKey]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const issues = extractIssues(error);
      setValidation({
        valid: false,
        issues,
        competitiveOverlap: extractOverlap(issues),
        outcome: null,
      });
      toast.error(issues[0]?.message ?? "تعذّرت العملية. حاول مرة ثانية.");
    } finally {
      setBusy(false);
    }
  };
  const updateStage = (
    index: number,
    patch: Partial<(typeof combo.stages)[number]>,
  ) =>
    setDraft(
      (current) =>
        ({
          ...current,
          stages: combo.stages.map((stage, stageIndex) =>
            stageIndex === index ? { ...stage, ...patch } : stage,
          ),
        }) as TutorialScenarioDraft,
    );
  const preview = validation?.outcome
    ? ({ ...combo, outcome: validation.outcome } as ComboTutorialScenario)
    : state?.draft?.kind === "combo"
      ? state.draft
      : null;

  return (
    <section
      data-testid="mechanic-tutorial-editor"
      className="space-y-3 rounded-[var(--radius)] border-2 border-border p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <h3 className="text-sm font-black">شرح الكومبو</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            مثال قصير: إجابتان صحيحتان، قرار استمرار، ثم كسر في السؤال الإجباري.
          </p>
        </span>
        <PublishState state={state} />
      </header>
      <div className="space-y-2">
        {combo.stages.map((stage, index) => (
          <div key={stage.stage} className="space-y-2 rounded-lg border p-2">
            <p className="text-xs font-black text-muted-foreground">
              المرحلة {stage.stage} ·{" "}
              {index < 2 ? "إجابة صحيحة" : "إجابة خاطئة في السؤال الإجباري"}
            </p>
            <Textarea
              data-testid={`tutorial-combo-prompt-${stage.stage}`}
              value={stage.prompt}
              onChange={(event) =>
                updateStage(index, { prompt: event.target.value })
              }
              placeholder="السؤال التعليمي"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                data-testid={`tutorial-combo-correct-${stage.stage}`}
                value={stage.correctAnswer}
                onChange={(event) =>
                  updateStage(index, { correctAnswer: event.target.value })
                }
                placeholder="الإجابة الصحيحة"
              />
              <Input
                data-testid={`tutorial-combo-submitted-${stage.stage}`}
                value={stage.submittedAnswer}
                onChange={(event) =>
                  updateStage(index, { submittedAnswer: event.target.value })
                }
                placeholder="الإجابة المرسلة في المثال"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-save"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setState(await saveTutorialDraft(mechanicKey, combo));
              setValidation(null);
            })
          }
        >
          حفظ المسودة
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-validate"
          disabled={busy}
          onClick={() =>
            run(async () =>
              setValidation(await validateTutorialDraft(mechanicKey, combo)),
            )
          }
        >
          <Eye className="size-4" /> فحص ومعاينة
        </Button>
        <Button
          type="button"
          data-testid="tutorial-publish"
          disabled={busy || !state?.draft}
          onClick={() =>
            run(async () => {
              setState(await publishTutorial(mechanicKey));
              setValidation(null);
            })
          }
        >
          <Send className="size-4" /> نشر
        </Button>
      </div>
      {validation && <ValidationReport validation={validation} />}
      {preview && (
        <div data-testid="tutorial-preview">
          <MechanicTutorialRenderer scenario={preview} compact mode="preview" />
        </div>
      )}
    </section>
  );
}

function EkshifniTutorialEditor({ mechanicKey }: { mechanicKey: string }) {
  const initial = stripOutcome(
    SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO,
  ) as TutorialScenarioDraft;
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState<TutorialScenarioDraft>(initial);
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const ekshifni = draft as Omit<EkshifniTutorialScenario, "outcome">;
  useEffect(() => {
    let active = true;
    setBusy(true);
    fetchAdminTutorial(mechanicKey)
      .then((next) => {
        if (!active) return;
        setState(next);
        const source = next.draft ?? next.published;
        if (source?.kind === "ekshifni") setDraft(stripOutcome(source));
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [mechanicKey]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const issues = extractIssues(error);
      setValidation({
        valid: false,
        issues,
        competitiveOverlap: extractOverlap(issues),
        outcome: null,
      });
      toast.error(issues[0]?.message ?? "تعذّرت العملية. حاول مرة ثانية.");
    } finally {
      setBusy(false);
    }
  };
  const update = (patch: Partial<typeof ekshifni>) =>
    setDraft((current) => ({ ...current, ...patch }) as TutorialScenarioDraft);
  const preview = validation?.outcome
    ? ({ ...ekshifni, outcome: validation.outcome } as EkshifniTutorialScenario)
    : state?.draft?.kind === "ekshifni"
      ? state.draft
      : null;
  return (
    <section
      data-testid="mechanic-tutorial-editor"
      className="space-y-3 rounded-[var(--radius)] border-2 border-border p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <h3 className="text-sm font-black">شرح اكشفني</h3>
          <p className="text-xs text-muted-foreground">
            صورة حقيقية وست نوافذ كشف؛ المبادرة والإجابات والنتيجة مشتقة من
            قواعد اللعب.
          </p>
        </span>
        <PublishState state={state} />
      </header>
      <Textarea
        data-testid="tutorial-ekshifni-prompt"
        value={ekshifni.prompt}
        onChange={(event) => update({ prompt: event.target.value })}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          data-testid="tutorial-ekshifni-identity"
          value={ekshifni.celebrityIdentity}
          onChange={(event) =>
            update({
              celebrityIdentity: event.target.value,
              correctSubmittedAnswer: event.target.value,
            })
          }
          placeholder="هوية المشهور"
        />
        <Input
          data-testid="tutorial-ekshifni-image"
          value={ekshifni.image.url}
          onChange={(event) =>
            update({ image: { ...ekshifni.image, url: event.target.value } })
          }
          placeholder="رابط الصورة"
        />
        <Input
          value={ekshifni.wrongSubmittedAnswer}
          onChange={(event) =>
            update({ wrongSubmittedAnswer: event.target.value })
          }
          placeholder="إجابة الفريق الأول الخاطئة"
        />
        <Input
          value={ekshifni.correctSubmittedAnswer}
          onChange={(event) =>
            update({ correctSubmittedAnswer: event.target.value })
          }
          placeholder="إجابة الفريق الثاني الصحيحة"
        />
      </div>
      <p className="rounded-lg border bg-muted/30 p-2 text-xs leading-5 text-muted-foreground">
        النوافذ الست وبصمة الملف وملاحظة المصدر محفوظة مع السيناريو. حقوق النشر
        الخارجية غير مثبتة لهذا الأصل الأرشيفي؛ لا يُنشر قبل التخليص.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-save"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setState(await saveTutorialDraft(mechanicKey, ekshifni));
              setValidation(null);
            })
          }
        >
          حفظ المسودة
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-validate"
          disabled={busy}
          onClick={() =>
            run(async () =>
              setValidation(await validateTutorialDraft(mechanicKey, ekshifni)),
            )
          }
        >
          <Eye className="size-4" />
          فحص ومعاينة
        </Button>
        <Button
          type="button"
          data-testid="tutorial-publish"
          disabled={busy || !state?.draft}
          onClick={() =>
            run(async () => {
              setState(await publishTutorial(mechanicKey));
              setValidation(null);
            })
          }
        >
          <Send className="size-4" />
          نشر
        </Button>
      </div>
      {validation && <ValidationReport validation={validation} />}
      {preview && (
        <div data-testid="tutorial-preview">
          <MechanicTutorialRenderer scenario={preview} compact mode="preview" />
        </div>
      )}
    </section>
  );
}

function OneClueTutorialEditor({ mechanicKey }: { mechanicKey: string }) {
  const initial = stripOutcome(
    SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO,
  ) as TutorialScenarioDraft;
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState<TutorialScenarioDraft>(initial);
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const oneClue = draft as Omit<OneClueTutorialScenario, "outcome">;

  useEffect(() => {
    let active = true;
    setBusy(true);
    fetchAdminTutorial(mechanicKey)
      .then((next) => {
        if (!active) return;
        setState(next);
        const source = next.draft ?? next.published;
        if (source?.kind === "one-clue") setDraft(stripOutcome(source));
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [mechanicKey]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const issues = extractIssues(error);
      setValidation({
        valid: false,
        issues,
        competitiveOverlap: extractOverlap(issues),
        outcome: null,
      });
      toast.error(issues[0]?.message ?? "تعذّرت العملية. حاول مرة ثانية.");
    } finally {
      setBusy(false);
    }
  };
  const update = (patch: Partial<typeof oneClue>) =>
    setDraft((current) => ({ ...current, ...patch }) as TutorialScenarioDraft);
  const preview = validation?.outcome
    ? ({ ...oneClue, outcome: validation.outcome } as OneClueTutorialScenario)
    : state?.draft?.kind === "one-clue"
      ? state.draft
      : null;

  return (
    <section
      data-testid="mechanic-tutorial-editor"
      className="space-y-3 rounded-[var(--radius)] border-2 border-border p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <h3 className="text-sm font-black">شرح من دليل واحد</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            خمسة أدلة متدرجة؛ كل فريق يثبّت إجابة واحدة، والنتيجة مشتقة من قواعد
            اللعب.
          </p>
        </span>
        <PublishState state={state} />
      </header>
      <Textarea
        data-testid="tutorial-one-clue-prompt"
        value={oneClue.prompt}
        onChange={(event) => update({ prompt: event.target.value })}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {oneClue.clues.map((clue, index) => (
          <Input
            key={clue.order}
            data-testid={`tutorial-one-clue-clue-${clue.order}`}
            value={clue.text}
            onChange={(event) =>
              update({
                clues: oneClue.clues.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, text: event.target.value }
                    : item,
                ),
              })
            }
            placeholder={`الدليل ${clue.order} — ${clue.value} نقاط`}
          />
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          data-testid="tutorial-one-clue-answer"
          value={oneClue.acceptedAnswer}
          onChange={(event) => update({ acceptedAnswer: event.target.value })}
          placeholder="الإجابة الصحيحة"
        />
        <Input
          value={oneClue.firstSubmittedAnswer}
          onChange={(event) =>
            update({ firstSubmittedAnswer: event.target.value })
          }
          placeholder="إجابة الفريق الأول الخاطئة"
        />
        <Input
          value={oneClue.secondSubmittedAnswer}
          onChange={(event) =>
            update({ secondSubmittedAnswer: event.target.value })
          }
          placeholder="إجابة الفريق الثاني الصحيحة"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-save"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setState(await saveTutorialDraft(mechanicKey, oneClue));
              setValidation(null);
            })
          }
        >
          حفظ المسودة
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-validate"
          disabled={busy}
          onClick={() =>
            run(async () =>
              setValidation(await validateTutorialDraft(mechanicKey, oneClue)),
            )
          }
        >
          <Eye className="size-4" />
          فحص ومعاينة
        </Button>
        <Button
          type="button"
          data-testid="tutorial-publish"
          disabled={busy || !state?.draft}
          onClick={() =>
            run(async () => {
              setState(await publishTutorial(mechanicKey));
              setValidation(null);
            })
          }
        >
          <Send className="size-4" />
          نشر
        </Button>
      </div>
      {validation && <ValidationReport validation={validation} />}
      {preview && (
        <div data-testid="tutorial-preview">
          <MechanicTutorialRenderer scenario={preview} compact mode="preview" />
        </div>
      )}
    </section>
  );
}

function BombTutorialEditor({ mechanicKey }: { mechanicKey: string }) {
  const empty: Omit<BombTutorialScenario, "outcome"> = {
    kind: "bomb",
    version: 1,
    prompt: "",
    acceptedAnswer: "",
    nextPrompt: "",
    startingTeam: "team-a",
    correctAtSecondsRemaining: 18,
    opponentExpiresAtSecondsRemaining: 0,
  };
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState(empty);
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetchAdminTutorial(mechanicKey).then((next) => {
      if (!active) return;
      setState(next);
      const source = next.draft ?? next.published;
      if (source?.kind === "bomb")
        setDraft(stripOutcome(source) as Omit<BombTutorialScenario, "outcome">);
    });
    return () => {
      active = false;
    };
  }, [mechanicKey]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const issues = extractIssues(error);
      setValidation({
        valid: false,
        issues,
        competitiveOverlap: extractOverlap(issues),
        outcome: null,
      });
      toast.error(issues[0]?.message ?? "تعذّرت العملية.");
    } finally {
      setBusy(false);
    }
  };
  const preview = validation?.outcome
    ? ({ ...draft, outcome: validation.outcome } as BombTutorialScenario)
    : state?.draft?.kind === "bomb"
      ? state.draft
      : null;
  return (
    <section
      data-testid="mechanic-tutorial-editor"
      className="space-y-3 rounded-[var(--radius)] border-2 border-border p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <h3 className="text-sm font-black">شرح القنبلة</h3>
          <p className="text-xs text-muted-foreground">
            إجابة صحيحة تمرّر الضغط؛ انتهاء الساعة يحسم التحدي.
          </p>
        </span>
        <PublishState state={state} />
      </header>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <FieldLabel htmlFor="tutorial-prompt">السؤال الأول</FieldLabel>
          <Textarea
            id="tutorial-prompt"
            value={draft.prompt}
            onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <FieldLabel htmlFor="tutorial-next-prompt">
            السؤال بعد التمرير
          </FieldLabel>
          <Textarea
            id="tutorial-next-prompt"
            value={draft.nextPrompt}
            onChange={(e) => setDraft({ ...draft, nextPrompt: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <FieldLabel htmlFor="tutorial-answer">الإجابة المقبولة</FieldLabel>
          <Input
            id="tutorial-answer"
            value={draft.acceptedAnswer}
            onChange={(e) =>
              setDraft({ ...draft, acceptedAnswer: e.target.value })
            }
          />
        </div>
        <NumberField
          id="tutorial-correct-seconds"
          label="الوقت المتبقي عند الإجابة"
          value={draft.correctAtSecondsRemaining}
          onChange={(e) =>
            setDraft({
              ...draft,
              correctAtSecondsRemaining: Number(e.target.value),
            })
          }
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setState(await saveTutorialDraft(mechanicKey, draft));
              setValidation(null);
            })
          }
        >
          حفظ المسودة
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(async () =>
              setValidation(await validateTutorialDraft(mechanicKey, draft)),
            )
          }
        >
          <Eye className="size-4" />
          فحص ومعاينة
        </Button>
        <Button
          type="button"
          disabled={busy || !state?.draft}
          onClick={() =>
            run(async () => {
              setState(await publishTutorial(mechanicKey));
              setValidation(null);
            })
          }
        >
          <Send className="size-4" />
          نشر
        </Button>
      </div>
      {validation && <ValidationReport validation={validation} />}
      {preview && (
        <div data-testid="tutorial-preview">
          <MechanicTutorialRenderer scenario={preview} compact mode="preview" />
        </div>
      )}
    </section>
  );
}

function ClosestTutorialEditor({ mechanicKey }: { mechanicKey: string }) {
  const initial: TutorialScenarioDraft = {
    kind: "closest",
    version: 1,
    prompt: "",
    teamAEstimate: 0,
    teamBEstimate: 0,
    correctValue: 0,
    unit: "",
  };
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState<TutorialScenarioDraft>(initial);
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAdminTutorial(mechanicKey)
      .then((next) => {
        if (!active) return;
        setState(next);
        const source = next.draft ?? next.published;
        if (source?.kind === "closest") setDraft(stripOutcome(source));
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [mechanicKey]);

  const closest = draft as Omit<ClosestTutorialScenario, "outcome">;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const issues = extractIssues(error);
      setValidation({
        valid: false,
        issues,
        competitiveOverlap: extractOverlap(issues),
        outcome: null,
      });
      toast.error(issues[0]?.message ?? "تعذّرت العملية. حاول مرة ثانية.");
    } finally {
      setBusy(false);
    }
  };
  const numberField = (
    field: "teamAEstimate" | "teamBEstimate" | "correctValue",
  ) => ({
    value: closest[field],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setDraft(
        (current) =>
          ({
            ...current,
            [field]: Number(event.target.value),
          }) as TutorialScenarioDraft,
      ),
  });
  const preview = validation?.outcome
    ? ({ ...closest, outcome: validation.outcome } as ClosestTutorialScenario)
    : state?.draft?.kind === "closest"
      ? state.draft
      : null;

  return (
    <section
      data-testid="mechanic-tutorial-editor"
      className="space-y-3 rounded-[var(--radius)] border-2 border-border p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <h3 className="text-sm font-black">شرح مين أقرب</h3>
          <p className="text-xs text-muted-foreground">
            مثال رقمي تعليمي؛ المسافات والنتيجة مشتقة من قواعد اللعبة.
          </p>
        </span>
        <PublishState state={state} />
      </header>
      <div className="space-y-1">
        <FieldLabel htmlFor="tutorial-prompt">السؤال التعليمي</FieldLabel>
        <Textarea
          id="tutorial-prompt"
          data-testid="tutorial-prompt"
          value={closest.prompt}
          onChange={(event) =>
            setDraft({ ...closest, prompt: event.target.value })
          }
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField
          id="tutorial-team-a-estimate"
          label="تقدير الفريق الأول"
          {...numberField("teamAEstimate")}
        />
        <NumberField
          id="tutorial-team-b-estimate"
          label="تقدير الفريق الثاني"
          {...numberField("teamBEstimate")}
        />
        <NumberField
          id="tutorial-correct-value"
          label="الإجابة الصحيحة"
          {...numberField("correctValue")}
        />
        <div className="space-y-1">
          <FieldLabel htmlFor="tutorial-unit">الوحدة</FieldLabel>
          <Input
            id="tutorial-unit"
            value={closest.unit ?? ""}
            onChange={(event) =>
              setDraft({ ...closest, unit: event.target.value })
            }
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-save"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setState(await saveTutorialDraft(mechanicKey, closest));
              setValidation(null);
            })
          }
        >
          حفظ المسودة
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-validate"
          disabled={busy}
          onClick={() =>
            run(async () =>
              setValidation(await validateTutorialDraft(mechanicKey, closest)),
            )
          }
        >
          <Eye className="size-4" />
          فحص ومعاينة
        </Button>
        <Button
          type="button"
          data-testid="tutorial-publish"
          disabled={busy || !state?.draft}
          onClick={() =>
            run(async () => {
              setState(await publishTutorial(mechanicKey));
              setValidation(null);
            })
          }
        >
          <Send className="size-4" />
          نشر
        </Button>
      </div>
      {validation && <ValidationReport validation={validation} />}
      {preview && (
        <div data-testid="tutorial-preview">
          <MechanicTutorialRenderer scenario={preview} compact mode="preview" />
        </div>
      )}
    </section>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        data-testid={id}
        type="number"
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function RyoTutorialEditor({ mechanicKey }: { mechanicKey: string }) {
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState<Omit<RyoTutorialScenario, "outcome">>(
    EMPTY as Omit<RyoTutorialScenario, "outcome">,
  );
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState<
    "load" | "save" | "check" | "publish" | null
  >("load");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setBusy("load");
    fetchAdminTutorial(mechanicKey)
      .then((next) => {
        if (!active) return;
        setState(next);
        // An existing draft is what an editor continues from; otherwise the
        // published version is the sensible starting point, and only a mechanic
        // with neither starts blank.
        const source = next.draft ?? next.published;
        if (source && (!source.kind || source.kind === "ryo"))
          setDraft(
            stripOutcome(source) as Omit<RyoTutorialScenario, "outcome">,
          );
        setLoadError(null);
      })
      .catch(() => active && setLoadError("ما قدرنا نحمّل الشرح التعليمي."))
      .finally(() => active && setBusy(null));
    return () => {
      active = false;
    };
  }, [mechanicKey]);

  const run = async (
    kind: Exclude<typeof busy, null | "load">,
    action: () => Promise<void>,
  ) => {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      const issues = extractIssues(error);
      if (issues.length) {
        setValidation({
          valid: false,
          issues,
          competitiveOverlap: extractOverlap(issues),
          outcome: null,
        });
        toast.error(issues[0].message);
      } else {
        toast.error("تعذّرت العملية. حاول مرة ثانية.");
      }
    } finally {
      setBusy(null);
    }
  };

  const onSave = () =>
    run("save", async () => {
      const next = await saveTutorialDraft(mechanicKey, draft);
      setState(next);
      setValidation(null);
      toast.success("انحفظت المسودة.");
    });

  const onCheck = () =>
    run("check", async () => {
      const result = await validateTutorialDraft(mechanicKey, draft);
      setValidation(result);
      if (result.valid) toast.success("الشرح جاهز للنشر.");
    });

  const onPublish = () =>
    run("publish", async () => {
      const next = await publishTutorial(mechanicKey);
      setState(next);
      setValidation(null);
      toast.success(`تم النشر — المراجعة رقم ${next.publishedRevision}.`);
    });

  if (loadError) {
    return (
      <p
        data-testid="tutorial-editor-error"
        className="rounded-[var(--radius)] bg-muted p-3 text-sm font-bold text-muted-foreground"
      >
        {loadError}
      </p>
    );
  }

  // Previewable only once the server has derived an outcome for this draft —
  // the preview must never guess a score the rules did not produce.
  const previewScenario: RyoTutorialScenario | null =
    validation?.outcome && draft.kind === "ryo"
      ? ({ ...draft, outcome: validation.outcome } as RyoTutorialScenario)
      : state?.draft?.kind === "ryo"
        ? state.draft
        : null;

  return (
    <section
      data-testid="mechanic-tutorial-editor"
      className="space-y-3 rounded-[var(--radius)] border-2 border-border p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <h3 className="text-sm font-black text-foreground">
            الشرح التعليمي للمكانيكا
          </h3>
          <p className="text-xs leading-5 text-muted-foreground">
            مثال تعليمي واحد لكل مكانيكا. النتيجة تُحتسب من قواعد اللعبة نفسها.
          </p>
        </span>
        <PublishState state={state} />
      </header>

      <div className="space-y-2">
        <FieldLabel htmlFor="tutorial-prompt">السؤال التعليمي</FieldLabel>
        <Textarea
          id="tutorial-prompt"
          data-testid="tutorial-prompt"
          value={draft.prompt}
          onChange={(event) =>
            setDraft((current) => ({ ...current, prompt: event.target.value }))
          }
          placeholder="سؤال واضح ما ينتمي لمحتوى المباريات"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {draft.options.map((option, index) => (
          <div key={option.id} className="space-y-1">
            <FieldLabel htmlFor={`tutorial-option-${option.id}`}>
              الخيار {index + 1}
            </FieldLabel>
            <Input
              id={`tutorial-option-${option.id}`}
              data-testid={`tutorial-option-${option.id}`}
              value={option.label}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  options: current.options.map((each) =>
                    each.id === option.id
                      ? { ...each, label: event.target.value }
                      : each,
                  ),
                }))
              }
            />
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <OptionPicker
          label="الإجابة الصحيحة"
          testId="tutorial-correct"
          value={draft.correctOptionId}
          options={draft.options}
          onChange={(correctOptionId) =>
            setDraft((current) => ({ ...current, correctOptionId }))
          }
        />
        <OptionPicker
          label="اختيار الفريق المجيب"
          testId="tutorial-selection"
          value={draft.answeringSelectionOptionId}
          options={draft.options}
          onChange={(answeringSelectionOptionId) =>
            setDraft((current) => ({ ...current, answeringSelectionOptionId }))
          }
        />
        <div className="space-y-1">
          <FieldLabel htmlFor="tutorial-decision">قرار الفريق الخصم</FieldLabel>
          <select
            id="tutorial-decision"
            data-testid="tutorial-decision"
            value={draft.opposingDecision}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                opposingDecision: event.target.value as "TRUST" | "STEAL",
              }))
            }
            className="h-10 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm font-bold"
          >
            <option value="TRUST">يثق فيهم</option>
            <option value="STEAL">يسرق منهم</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-save"
          disabled={busy !== null}
          onClick={onSave}
        >
          حفظ المسودة
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="tutorial-validate"
          disabled={busy !== null}
          onClick={onCheck}
        >
          <Eye className="size-4" aria-hidden />
          فحص ومعاينة
        </Button>
        <Button
          type="button"
          data-testid="tutorial-publish"
          disabled={busy !== null || !state?.draft}
          onClick={onPublish}
        >
          <Send className="size-4" aria-hidden />
          نشر
        </Button>
      </div>

      {validation && <ValidationReport validation={validation} />}

      {previewScenario && (
        <div className="space-y-1.5" data-testid="tutorial-preview">
          <p className="text-xs font-black text-muted-foreground">
            معاينة بالشرح الحقيقي
          </p>
          <MechanicTutorialRenderer
            scenario={previewScenario}
            compact
            mode="preview"
          />
        </div>
      )}
    </section>
  );
}

/** The form has no shared Label primitive; this matches its existing markup. */
function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-black text-muted-foreground"
    >
      {children}
    </label>
  );
}

function PublishState({ state }: { state: AdminTutorialState | null }) {
  if (!state) return null;
  const label = !state.published
    ? "غير منشور"
    : state.hasUnpublishedChanges
      ? `منشور (مراجعة ${state.publishedRevision}) — فيه تعديلات غير منشورة`
      : `منشور (مراجعة ${state.publishedRevision})`;
  return (
    <span
      data-testid="tutorial-publish-state"
      data-published={state.published ? "true" : "false"}
      data-dirty={state.hasUnpublishedChanges ? "true" : "false"}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-black",
        state.published && !state.hasUnpublishedChanges
          ? "bg-sem-success/15 text-sem-success"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function ValidationReport({ validation }: { validation: TutorialValidation }) {
  if (validation.valid) {
    return (
      <p
        data-testid="tutorial-validation"
        data-valid="true"
        className="flex items-center gap-2 rounded-[var(--radius)] bg-sem-success/10 p-2.5 text-xs font-bold text-sem-success"
      >
        <CheckCircle2 className="size-4" aria-hidden />
        جاهز للنشر — ما فيه تعارض مع محتوى المباريات.
      </p>
    );
  }
  return (
    <div
      data-testid="tutorial-validation"
      data-valid="false"
      className="space-y-1.5 rounded-[var(--radius)] bg-sem-error/10 p-2.5 text-xs font-bold text-sem-error"
    >
      {validation.issues.map((issue) => (
        <p key={issue.code} className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {issue.message}
        </p>
      ))}
      {validation.competitiveOverlap.length > 0 && (
        <ul
          data-testid="tutorial-overlap"
          className="list-none space-y-1 ps-6 font-normal"
        >
          {validation.competitiveOverlap.map((match) => (
            <li key={match.contentItemId} className="akwaan-numeral">
              {match.contentItemId} · {Math.round(match.similarity * 100)}%
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OptionPicker({
  label,
  testId,
  value,
  options,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={testId}>{label}</FieldLabel>
      <select
        id={testId}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm font-bold"
      >
        {options.map((option, index) => (
          <option key={option.id} value={option.id}>
            {option.label.trim() || `الخيار ${index + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function stripOutcome(scenario: TutorialScenario): TutorialScenarioDraft {
  const { outcome: _outcome, ...rest } = scenario;
  return rest;
}

function extractIssues(error: unknown) {
  const payload = (
    error as { response?: { data?: { message?: { issues?: unknown } } } }
  )?.response?.data?.message;
  const issues = (payload as { issues?: unknown })?.issues;
  return Array.isArray(issues)
    ? (issues as {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      }[])
    : [];
}

function extractOverlap(
  issues: { details?: Record<string, unknown> }[],
): { contentItemId: string; similarity: number }[] {
  for (const issue of issues) {
    const matches = issue.details?.matches;
    if (Array.isArray(matches)) {
      return matches as { contentItemId: string; similarity: number }[];
    }
  }
  return [];
}
