"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Eye, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  RyoExplainer,
  type RyoTutorialScenario,
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
  const [state, setState] = useState<AdminTutorialState | null>(null);
  const [draft, setDraft] = useState<TutorialScenarioDraft>(EMPTY);
  const [validation, setValidation] = useState<TutorialValidation | null>(null);
  const [busy, setBusy] = useState<"load" | "save" | "check" | "publish" | null>(
    "load",
  );
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
        if (source) setDraft(stripOutcome(source));
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
  const previewScenario: RyoTutorialScenario | null = validation?.outcome
    ? { ...draft, outcome: validation.outcome }
    : (state?.draft ?? null);

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
          <RyoExplainer scenario={previewScenario} compact />
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

function stripOutcome(scenario: RyoTutorialScenario): TutorialScenarioDraft {
  const { outcome: _outcome, ...rest } = scenario;
  return rest;
}

function extractIssues(error: unknown) {
  const payload = (
    error as { response?: { data?: { message?: { issues?: unknown } } } }
  )?.response?.data?.message;
  const issues = (payload as { issues?: unknown })?.issues;
  return Array.isArray(issues)
    ? (issues as { code: string; message: string; details?: Record<string, unknown> }[])
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
