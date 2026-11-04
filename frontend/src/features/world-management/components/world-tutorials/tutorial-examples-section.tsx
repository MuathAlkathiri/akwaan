"use client";

import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { EmptyState, LoadingState, SectionCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { SUPPORTED_TUTORIAL_MECHANIC_KEYS } from "@/features/challenge-explainer";
import { MechanicTutorialEditor } from "../challenge-types/mechanic-tutorial-editor";
import { useWorldBoard } from "../../hooks/use-world-content";
import {
  fetchScopedAdminTutorial,
  restoreScopedTutorial,
  withdrawScopedTutorial,
  type ScopedAdminTutorialState,
} from "../../api/mechanic-tutorial-api";

/** World-specific examples reuse the canonical mechanic editor and renderer. */
export function TutorialExamplesSection({ worldId }: { worldId: string }) {
  const board = useWorldBoard(worldId);
  const [selected, setSelected] = useState<string>();
  const configurations = (board.data?.configurations ?? []).filter((item) =>
    (SUPPORTED_TUTORIAL_MECHANIC_KEYS as readonly string[]).includes(
      item.challengeType.slug,
    ),
  );
  const active = selected
    ? configurations.find((item) => item.challengeType.slug === selected)
    : configurations[0];

  return (
    <SectionCard
      title="أمثلة شرح التحديات لهذا العالم"
      description="المحتوى يتغير حسب العالم؛ التسلسل والقواعد والنتيجة تبقى canonical."
    >
      {board.isLoading ? (
        <LoadingState count={2} />
      ) : board.isError ? (
        <EmptyState
          icon={BookOpen}
          title="تعذر تحميل أمثلة الشرح"
          description="تحقق من اتصال الإدارة ثم حاول مرة أخرى."
        />
      ) : !configurations.length ? (
        <EmptyState
          icon={BookOpen}
          title="لا توجد ميكانيكا مدعومة في لوحة هذا العالم"
          description="اربط ميكانيكا canonical باللوحة قبل تأليف مثال خاص بالعالم."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {configurations.map((configuration) => (
              <Button
                key={configuration.id}
                type="button"
                size="sm"
                variant={
                  active?.id === configuration.id ? "default" : "outline"
                }
                onClick={() => setSelected(configuration.challengeType.slug)}
              >
                {configuration.effectiveName}
              </Button>
            ))}
          </div>
          {active && (
            <div className="space-y-2">
              <p className="text-xs leading-5 text-muted-foreground">
                {active.challengeType.slug} · {active.challengeTypeId}
              </p>
              <ScopedTutorialLifecycle
                worldId={worldId}
                mechanicKey={active.challengeType.slug}
              />
              <MechanicTutorialEditor
                key={`${worldId}:${active.challengeType.slug}`}
                mechanicKey={active.challengeType.slug}
                worldId={worldId}
              />
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function ScopedTutorialLifecycle({
  worldId,
  mechanicKey,
}: {
  worldId: string;
  mechanicKey: string;
}) {
  const [state, setState] = useState<ScopedAdminTutorialState | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<number>();
  const [busy, setBusy] = useState(false);
  const load = () =>
    fetchScopedAdminTutorial(worldId, mechanicKey).then((next) => {
      setState(next);
      setSelectedRevision(next.revisions.at(-1)?.revision);
    });
  useEffect(() => {
    let active = true;
    fetchScopedAdminTutorial(worldId, mechanicKey).then((next) => {
      if (!active) return;
      setState(next);
      setSelectedRevision(next.revisions.at(-1)?.revision);
    });
    return () => {
      active = false;
    };
  }, [mechanicKey, worldId]);

  if (!state) return null;
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-2 text-xs">
      <span className="font-bold">
        {state.generic.published ? "العام متاح" : "لا يوجد مثال عام"}
        {state.published
          ? ` · منشور للعالم (مراجعة ${state.publishedRevision})`
          : " · العالم يستخدم الاحتياط العام"}
      </span>
      {state.revisions.length > 0 && (
        <>
          <select
            aria-label="مراجعة الشرح السابقة"
            value={selectedRevision ?? ""}
            onChange={(event) =>
              setSelectedRevision(Number(event.target.value))
            }
            className="h-8 rounded border border-border bg-background px-2"
          >
            {state.revisions.map((revision) => (
              <option key={revision.revision} value={revision.revision}>
                مراجعة {revision.revision}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !selectedRevision}
            onClick={() =>
              selectedRevision
                ? void run(() =>
                    restoreScopedTutorial(
                      worldId,
                      mechanicKey,
                      selectedRevision,
                    ),
                  )
                : undefined
            }
          >
            استعادة
          </Button>
        </>
      )}
      {state.published && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(() => withdrawScopedTutorial(worldId, mechanicKey))
          }
        >
          استخدام العام
        </Button>
      )}
    </div>
  );
}
