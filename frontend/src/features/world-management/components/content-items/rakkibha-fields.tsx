"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { RakkibhaFormState } from "../../services/content-item-form.service";

export const RAKKIBHA_SAFETY_CONFIRMATION =
  "أؤكد أن المرجع منفصل عن القطعة الصحيحة وأن هوية واحدة فقط صحيحة";

export function RakkibhaFields({
  value,
  onChange,
}: {
  value: RakkibhaFormState;
  onChange: (value: RakkibhaFormState) => void;
}) {
  const set = (patch: Partial<RakkibhaFormState>) =>
    onChange({ ...value, ...patch });
  return (
    <fieldset dir="rtl" className="space-y-5 rounded-xl border p-4">
      <legend className="px-2 text-lg font-black">ركّبها — تجميع بصري</legend>
      <div className="space-y-2">
        <label htmlFor="rakkibha-instruction">التعليمات المحايدة</label>
        <Input
          id="rakkibha-instruction"
          value={value.instructionAr}
          onChange={(event) => set({ instructionAr: event.target.value })}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="rakkibha-reference-image">صورة الشكل الناقص</label>
          <Input
            id="rakkibha-reference-image"
            value={value.referenceImageUrl}
            onChange={(event) => set({ referenceImageUrl: event.target.value })}
            placeholder="/uploads/...webp"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="rakkibha-reference-copy">نص خاص اختياري</label>
          <Input
            id="rakkibha-reference-copy"
            value={value.referenceContentAr}
            onChange={(event) =>
              set({ referenceContentAr: event.target.value })
            }
          />
        </div>
      </div>
      {value.candidateViews.map((view, viewIndex) => (
        <section
          key={view.id}
          className="space-y-3 rounded-lg border bg-muted/30 p-3"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              aria-label={`معرف حامل القطع ${viewIndex + 1}`}
              value={view.id}
              onChange={(event) => {
                const candidateViews = [...value.candidateViews];
                candidateViews[viewIndex] = { ...view, id: event.target.value };
                set({ candidateViews });
              }}
            />
            <Input
              aria-label={`تعليمات حامل القطع ${viewIndex + 1}`}
              value={view.contentAr}
              onChange={(event) => {
                const candidateViews = [...value.candidateViews];
                candidateViews[viewIndex] = {
                  ...view,
                  contentAr: event.target.value,
                };
                set({ candidateViews });
              }}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {view.candidates.map((candidate, candidateIndex) => (
              <div
                key={`${view.id}-${candidateIndex}`}
                className="space-y-2 rounded-lg bg-card p-3"
              >
                <Input
                  aria-label={`المعرف المحلي ${viewIndex + 1}-${candidateIndex + 1}`}
                  value={candidate.localId}
                  onChange={(event) =>
                    updateCandidate(
                      value,
                      onChange,
                      viewIndex,
                      candidateIndex,
                      { localId: event.target.value },
                    )
                  }
                />
                <Input
                  aria-label={`الهوية ${viewIndex + 1}-${candidateIndex + 1}`}
                  value={candidate.canonicalIdentity}
                  onChange={(event) =>
                    updateCandidate(
                      value,
                      onChange,
                      viewIndex,
                      candidateIndex,
                      { canonicalIdentity: event.target.value },
                    )
                  }
                />
                <Input
                  aria-label={`صورة القطعة ${viewIndex + 1}-${candidateIndex + 1}`}
                  value={candidate.imageUrl}
                  onChange={(event) =>
                    updateCandidate(
                      value,
                      onChange,
                      viewIndex,
                      candidateIndex,
                      { imageUrl: event.target.value },
                    )
                  }
                />
                <Input
                  aria-label={`وصف القطعة ${viewIndex + 1}-${candidateIndex + 1}`}
                  value={candidate.contentAr}
                  onChange={(event) =>
                    updateCandidate(
                      value,
                      onChange,
                      viewIndex,
                      candidateIndex,
                      { contentAr: event.target.value },
                    )
                  }
                />
              </div>
            ))}
          </div>
          {view.candidates.length === 3 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const candidateViews = [...value.candidateViews];
                candidateViews[viewIndex] = {
                  ...view,
                  candidates: view.candidates.slice(0, 2),
                };
                set({ candidateViews });
              }}
            >
              استخدم قطعتين فقط
            </Button>
          )}
        </section>
      ))}
      <div className="space-y-2">
        <label htmlFor="rakkibha-correct">الهوية الصحيحة الوحيدة</label>
        <Input
          id="rakkibha-correct"
          value={value.correctCanonicalIdentity}
          onChange={(event) =>
            set({ correctCanonicalIdentity: event.target.value })
          }
        />
      </div>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={value.safetyConfirmed}
          onCheckedChange={(checked: boolean | "indeterminate") =>
            set({ safetyConfirmed: checked === true })
          }
        />
        {RAKKIBHA_SAFETY_CONFIRMATION}
      </label>
    </fieldset>
  );
}

function updateCandidate(
  value: RakkibhaFormState,
  onChange: (value: RakkibhaFormState) => void,
  viewIndex: number,
  candidateIndex: number,
  patch: Partial<
    RakkibhaFormState["candidateViews"][number]["candidates"][number]
  >,
) {
  const candidateViews = [...value.candidateViews];
  const view = candidateViews[viewIndex];
  const candidates = [...view.candidates];
  candidates[candidateIndex] = { ...candidates[candidateIndex], ...patch };
  candidateViews[viewIndex] = { ...view, candidates };
  onChange({ ...value, candidateViews });
}
