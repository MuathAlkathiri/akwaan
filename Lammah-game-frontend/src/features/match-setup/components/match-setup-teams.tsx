"use client";

import { Play, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JourneySection } from "@/features/worlds/components/journey-shell";
import { StepFooter } from "./occurrence-world-step";
import type { MatchSetupDraft } from "../state/match-setup-draft";

/**
 * The last thing before the Match exists: who is playing.
 *
 * Two team names, and nothing else. No phone pairs here and no QR: teams are
 * identities the server needs to score a Match, and players join their team later,
 * during challenge preflight. This is also the only screen that talks to the
 * server — pressing the button creates the session and the Match in one go.
 */
export function MatchSetupTeams({
  draft,
  submitting,
  rolledBack,
  onRename,
  onBack,
  onStart,
}: {
  draft: MatchSetupDraft;
  submitting: boolean;
  rolledBack: boolean;
  onRename: (index: 0 | 1, name: string) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const named = draft.teamNames.every((name) => name.trim().length > 0);
  const distinct =
    draft.teamNames[0].trim() !== draft.teamNames[1].trim();
  const ready = named && distinct;

  return (
    <JourneySection
      id="match-teams"
      title="الفريقان"
      description="اسمان فقط. تنضم الجوالات لاحقًا قبل أول تحدٍ يحتاجها."
    >
      <div className="space-y-5">
        <div className="grid gap-4 rounded-3xl border border-black/[0.06] bg-white p-6 shadow-[0_10px_30px_rgba(24,16,54,.05)] sm:grid-cols-2">
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-black text-slate-600">
              <Users className="h-4 w-4 text-primary" aria-hidden />
              الفريق الأول
            </span>
            <Input
              aria-label="اسم الفريق الأول"
              value={draft.teamNames[0]}
              onChange={(event) => onRename(0, event.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-black text-slate-600">
              <Users className="h-4 w-4 text-[#15803D]" aria-hidden />
              الفريق الثاني
            </span>
            <Input
              aria-label="اسم الفريق الثاني"
              value={draft.teamNames[1]}
              onChange={(event) => onRename(1, event.target.value)}
            />
          </label>
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
          <p className="text-sm leading-6 text-slate-500">
            لم تُنشأ أي مباراة، وتم إلغاء الجلسة المؤقتة. إعدادك محفوظ كما هو.
          </p>
        )}

        <StepFooter onBack={onBack} backDisabled={submitting}>
          <Button
            type="button"
            size="lg"
            disabled={!ready || submitting}
            onClick={onStart}
            className="min-w-44 rounded-2xl font-black shadow-[0_10px_26px_rgba(91,33,182,.2)]"
          >
            <Play className="ml-2 h-5 w-5 fill-current" aria-hidden />
            {submitting ? "جارٍ إنشاء المباراة…" : "ابدأ المباراة"}
          </Button>
        </StepFooter>
      </div>
    </JourneySection>
  );
}
