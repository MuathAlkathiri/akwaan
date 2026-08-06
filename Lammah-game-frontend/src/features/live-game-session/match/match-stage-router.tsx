"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleDashed,
  Crown,
  Dices,
  FlaskConical,
  Lock,
  Play,
  RefreshCw,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { GameplayRuntimePanel } from "../components/gameplay-runtime-panel";
import { RyoGameplayPanel } from "../components/ryo-gameplay-panel";
import { Top10PoisonDeckPanel } from "../components/top10-poison-deck-panel";
import { DistributedInformationPanel } from "../components/distributed-information-panel";
import { DistributedInformationScreen } from "../components/distributed-information-screen";
import { DISTRIBUTED_INFORMATION_MODE_KEY } from "./distributed-information.presentation";
import { useLiveSession } from "../hooks/live-session-context";
import { DevelopmentLaunchDialog } from "./components/development-launch-dialog";
import { MatchConnectionBanner } from "./components/match-connection-banner";
import { MatchScoreDisplay } from "./components/match-score-display";
import { UnifiedBoard } from "./components/unified-board";
import { UnifiedMatchComplete } from "./components/unified-match-complete";
import { UnifiedPreflightStage } from "./components/unified-preflight-stage";
import { useMatchController, useMatchWorlds } from "./hooks/use-match-controller";
import {
  launchabilityLabels,
  selectionMethodLabels,
  shortWorldName,
  slotLabels,
  slotStatusLabels,
  teamName,
} from "./presentation";
import type {
  MatchActor,
  MatchBoardSlot,
  MatchSelectableWorld,
} from "./types";
import { UNIFIED_SETUP_MODE, isMatchStageKey } from "./types";

/**
 * The sequential setup stages. A preconfigured Match is created past all of them
 * and can never legitimately be in one, so seeing one means the snapshot and this
 * client disagree — which is reported, not rendered.
 */
const LEGACY_SETUP_STAGES = [
  "lobby",
  "coin_toss",
  "world_selection",
  "scope_selection",
  "world_complete",
] as const;

export function MatchStageRouter({
  actor,
  participantId,
}: {
  actor: MatchActor;
  participantId?: string;
}) {
  const { snapshot, error, resync } = useLiveSession();
  const unified = snapshot?.match?.setupMode === UNIFIED_SETUP_MODE;
  const worlds = useMatchWorlds(
    actor !== "participant" &&
      // The selectable-Worlds list belongs to the sequential setup; a
      // preconfigured Match already carries its three, so it is never fetched.
      !unified &&
      snapshot?.match?.stage.key !== "lobby",
  );
  const authoritativeStage = snapshot?.match?.stage.key;
  const previousStageRef = useRef(authoritativeStage);
  const [showSettledToss, setShowSettledToss] = useState(false);
  useEffect(() => {
    const previous = previousStageRef.current;
    previousStageRef.current = authoritativeStage;
    if (previous !== "coin_toss" || authoritativeStage !== "world_selection") {
      return;
    }
    setShowSettledToss(true);
    const timer = window.setTimeout(() => setShowSettledToss(false), 3500);
    return () => window.clearTimeout(timer);
  }, [authoritativeStage]);
  if (!snapshot) {
    return (
      <div className="space-y-4" aria-label="جارٍ تحميل المباراة" dir="rtl">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (!snapshot.match) {
    return <MatchAbsent actor={actor} />;
  }

  // The settled-toss replay is a sequential-setup flourish; a preconfigured Match
  // has no toss stage to replay.
  const stage =
    showSettledToss && !unified ? "coin_toss" : snapshot.match.stage.key;
  let content: React.ReactNode;
  if (!isMatchStageKey(stage)) {
    content = <UnsupportedStage onResync={resync} />;
  } else if (
    unified &&
    (LEGACY_SETUP_STAGES as readonly string[]).includes(stage)
  ) {
    content = <UnsupportedStage onResync={resync} />;
  } else if (unified && stage === "board") {
    content = <UnifiedBoard actor={actor} />;
  } else if (unified && stage === "preflight") {
    content = <UnifiedPreflightStage actor={actor} />;
  } else if (unified && stage === "match_complete") {
    content = <UnifiedMatchComplete actor={actor} />;
  } else if (stage === "preflight") {
    // Only a preconfigured Match has a preflight; a legacy Match reporting one
    // means this client and the server disagree.
    content = <UnsupportedStage onResync={resync} />;
  } else switch (stage) {
    case "lobby":
      content = <LobbyStage actor={actor} participantId={participantId} />;
      break;
    case "coin_toss":
      content = <CoinTossStage actor={actor} participantId={participantId} />;
      break;
    case "world_selection":
      content = (
        <WorldSelectionStage
          actor={actor}
          worlds={worlds.data}
          loadingWorlds={worlds.isLoading}
        />
      );
      break;
    case "scope_selection":
      content = <ScopeSelectionStage actor={actor} />;
      break;
    case "board":
      content = <BoardStage actor={actor} worlds={worlds.data} />;
      break;
    case "challenge":
      content = <ChallengeStage actor={actor} worlds={worlds.data} />;
      break;
    case "world_complete":
      content = <WorldCompleteStage actor={actor} worlds={worlds.data} />;
      break;
    case "match_complete":
      content = (
        <MatchCompleteStage
          actor={actor}
          participantId={participantId}
          worlds={worlds.data}
        />
      );
      break;
    default:
      content = exhaustiveStage(stage);
  }

  return (
    <main
      dir="rtl"
      className="mx-auto min-h-[60vh] max-w-6xl space-y-4 rounded-[2rem] bg-[#fffaf0] p-4 text-slate-950 sm:p-6"
      data-match-actor={actor}
      data-match-stage={stage}
    >
      <MatchConnectionBanner actor={actor} />
      {error && actor !== "controller" && (
        <p className="sr-only" role="alert">
          تعذر تحديث المباراة. ستتم إعادة المحاولة تلقائيًا.
        </p>
      )}
      {content}
    </main>
  );
}

function exhaustiveStage(stage: never): React.ReactNode {
  throw new Error(`Unreachable Match stage: ${String(stage)}`);
}

function UnsupportedStage({ onResync }: { onResync?: () => void }) {
  return (
    <Card role="alert" className="border-amber-300">
      <CardHeader>
        <CardTitle>تعذر عرض المرحلة الحالية</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>وصلت حالة غير معروفة أو تالفة. بياناتك محفوظة.</p>
        <Button onClick={() => onResync?.()}>
          <RefreshCw className="size-4" aria-hidden />
          مزامنة المباراة
        </Button>
      </CardContent>
    </Card>
  );
}

function ScopeSelectionStage({ actor }: { actor: MatchActor }) {
  const router = useRouter();
  const { snapshot } = useLiveSession();
  const occurrence = snapshot?.match?.currentOccurrence;
  const destination =
    snapshot && occurrence
      ? `/worlds/${occurrence.worldId}?sessionId=${encodeURIComponent(snapshot.sessionId)}`
      : undefined;

  useEffect(() => {
    if (actor === "controller" && destination) router.replace(destination);
  }, [actor, destination, router]);

  if (!occurrence) {
    return (
      <Card role="alert" className="border-red-300">
        <CardContent className="p-8 text-center font-bold">
          مرحلة اختيار النطاقات بلا World occurrence صالح. أعد مزامنة المباراة.
        </CardContent>
      </Card>
    );
  }

  return (
    <StageCard
      eyebrow={`العالم ${occurrence.index + 1} من 3`}
      title="اختيار أربعة نطاقات"
    >
      <p className="text-center text-slate-600">
        {actor === "controller"
          ? "جارٍ فتح نطاقات العالم الحالي من حالة المباراة المحفوظة…"
          : "بانتظار المتحكّم لاختيار نطاقات العالم الحالي."}
      </p>
      {actor === "controller" && destination && (
        <Button className="mx-auto flex" onClick={() => router.replace(destination)}>
          اختر النطاقات
        </Button>
      )}
    </StageCard>
  );
}

function MatchAbsent({ actor }: { actor: MatchActor }) {
  const { snapshot, connection } = useLiveSession();
  const controller = useMatchController();
  if (!snapshot) return null;
  const activeTeams = snapshot.teams.filter((team) => team.active);
  const canCreate = snapshot.status === "active" && activeTeams.length === 2;
  if (actor !== "controller") {
    return (
      <main dir="rtl" className="mx-auto max-w-3xl py-10">
        <Card className="border-amber-200 bg-[#fffaf0] text-center">
          <CardContent className="space-y-3 p-10">
            <CircleDashed className="mx-auto size-10 text-amber-600" aria-hidden />
            <h1 className="text-3xl font-black">المباراة لم تبدأ بعد</h1>
            <p className="text-slate-600">بانتظار المتحكّم لبدء رحلة العوالم.</p>
          </CardContent>
        </Card>
      </main>
    );
  }
  return (
    <Card dir="rtl" className="border-amber-200 bg-amber-50/50">
      <CardHeader>
        <CardTitle>بدء تدفق المباراة الجديد</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          شغّل الجلسة بفريقين نشطين، ثم أنشئ مباراة مرتبطة بها.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant={snapshot.status === "active" ? "secondary" : "outline"}>
            {snapshot.status === "active" ? "الجلسة نشطة" : "الجلسة لم تبدأ"}
          </Badge>
          <Badge variant={activeTeams.length === 2 ? "secondary" : "outline"}>
            {activeTeams.length} من فريقين
          </Badge>
        </div>
        <Button
          onClick={() => controller.run({ type: "create" })}
          disabled={!canCreate || controller.pending || connection !== "connected"}
        >
          <Play className="size-4" aria-hidden />
          {controller.pending ? "جارٍ الإنشاء…" : "إنشاء المباراة"}
        </Button>
        {!canCreate && (
          <p className="text-sm text-amber-800">
            {snapshot.status !== "active"
              ? "ابدأ الجلسة من أدوات الجلسة أدناه أولًا."
              : "تحتاج المباراة فريقين نشطين بالضبط."}
          </p>
        )}
        <CommandError controller={controller} />
      </CardContent>
    </Card>
  );
}

function LobbyStage({
  actor,
  participantId,
}: {
  actor: MatchActor;
  participantId?: string;
}) {
  const { snapshot } = useLiveSession();
  const controller = useMatchController();
  if (!snapshot?.match) return null;
  const participant = snapshot.participants.find((item) => item.id === participantId);
  if (actor === "participant") {
    return (
      <StageCard eyebrow="الاستعداد" title="المباراة لم تبدأ بعد">
        <p className="text-lg text-slate-600">أنت مع فريق {teamName(snapshot, participant?.teamId)}.</p>
        <p>ابقَ في هذه الصفحة؛ ستنتقل تلقائيًا عند بدء المباراة.</p>
      </StageCard>
    );
  }
  const canStart = snapshot.match.availableActions.includes("match:start");
  return (
    <>
      <StageCard eyebrow="الاستعداد" title="الفريقان جاهزان للرحلة">
        <div className="grid gap-4 sm:grid-cols-2">
          {snapshot.teams.map((team) => {
            const players = snapshot.participants.filter(
              (item) => item.teamId === team.id && item.role !== "controller",
            );
            return (
              <div key={team.id} className="rounded-2xl border bg-white p-4">
                <h2 className="text-xl font-black">{team.name}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {players.filter((item) => item.connected).length} متصل من {players.length}
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-center text-slate-600">بانتظار بدء المباراة.</p>
        {actor === "controller" && canStart && (
          <Button
            className="mx-auto flex"
            size="lg"
            disabled={controller.pending || !controller.connected}
            onClick={() => controller.run({ type: "start" })}
          >
            <Play className="size-4" aria-hidden />
            {controller.pending ? "جارٍ البدء…" : "ابدأ رمية الاختيار"}
          </Button>
        )}
        <CommandError controller={controller} />
      </StageCard>
    </>
  );
}

function CoinTossStage({
  actor,
  participantId,
}: {
  actor: MatchActor;
  participantId?: string;
}) {
  const { snapshot, nowMs } = useLiveSession();
  const controller = useMatchController();
  const [revealed, setRevealed] = useState(false);
  const match = snapshot?.match;
  const settled = match?.coinToss.status === "resolved";
  useEffect(() => {
    if (!match || !settled) {
      setRevealed(false);
      return;
    }
    if (actor === "participant") {
      setRevealed(true);
      return;
    }
    const elapsed = nowMs - Date.parse(match.stage.enteredAt);
    const wait = Math.max(0, match.stage.minimumDisplayDurationMs - elapsed);
    const timer = window.setTimeout(() => setRevealed(true), wait);
    return () => window.clearTimeout(timer);
  }, [actor, match, nowMs, settled]);
  if (!snapshot || !match) return null;
  const participant = snapshot.participants.find((item) => item.id === participantId);
  const won = participant?.teamId === match.coinToss.winnerTeamId;
  const canToss = match.availableActions.includes("match:coin-toss");
  return (
    <StageCard eyebrow="رمية الاختيار" title="من يختار العالم أولًا؟">
      <div
        aria-label={settled ? "نتيجة الرمية محفوظة في الخادم" : "الرمية لم تُحسم بعد"}
        className={`mx-auto grid size-36 place-items-center rounded-full border-8 border-amber-300 bg-slate-950 text-5xl text-amber-300 shadow-xl ${!revealed ? "animate-spin" : ""}`}
      >
        ✦
      </div>
      <div className="flex justify-center gap-3 text-lg font-bold">
        {snapshot.teams.map((team) => (
          <span key={team.id}>{team.name}</span>
        ))}
      </div>
      {settled && revealed ? (
        <div className="rounded-2xl bg-amber-100 p-5 text-center" role="status">
          <p className="text-sm text-amber-900">نتيجة الرمية</p>
          <p className="text-3xl font-black">{teamName(snapshot, match.coinToss.winnerTeamId)}</p>
          <p className="mt-2">
            {actor === "participant"
              ? won
                ? "أنتم تختارون أولًا"
                : "الفريق الآخر يختار أولًا"
              : "الفائز يختار العالم الأول"}
          </p>
        </div>
      ) : (
        <p className="text-center text-slate-600">
          {settled ? "جارٍ عرض النتيجة المحفوظة…" : "بانتظار المتحكّم لإجراء الرمية."}
        </p>
      )}
      {actor === "controller" && canToss && (
        <Button
          className="mx-auto flex"
          size="lg"
          disabled={controller.pending || !controller.connected}
          onClick={() => controller.run({ type: "coin-toss" })}
        >
          <Dices className="size-4" aria-hidden />
          {controller.pending ? "جارٍ الحسم…" : "أجرِ الرمية"}
        </Button>
      )}
      <CommandError controller={controller} />
    </StageCard>
  );
}

function WorldSelectionStage({
  actor,
  worlds,
  loadingWorlds,
}: {
  actor: MatchActor;
  worlds?: MatchSelectableWorld[];
  loadingWorlds: boolean;
}) {
  const { snapshot } = useLiveSession();
  const controller = useMatchController();
  const [worldId, setWorldId] = useState<string>();
  if (!snapshot?.match) return null;
  const match = snapshot.match;
  const selections = [...match.worldSelection.selections].sort(
    (a, b) => a.occurrenceIndex - b.occurrenceIndex,
  );
  const names = new Map(worlds?.map((world) => [world.worldId, world.name]));
  const counts = selections.reduce<Record<string, number>>((all, item) => {
    all[item.worldId] = (all[item.worldId] ?? 0) + 1;
    return all;
  }, {});
  const chooser = teamName(snapshot, match.worldSelection.nextTeamId);
  const canSelect = match.availableActions.includes("match:select-world");
  const selectedWorld = worlds?.find((world) => world.worldId === worldId);
  const submit = (method: "team_pick" | "agreed" | "random") => {
    controller.run({
      type: "select-world",
      method,
      worldId: method === "random" ? undefined : worldId,
      selectedByTeamId:
        method === "team_pick" ? match.worldSelection.nextTeamId : undefined,
    });
  };
  return (
    <StageCard eyebrow="اختيار العوالم" title="ثلاث محطات، ويمكن تكرار العالم">
      <ol className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => {
          const selection = selections.find((item) => item.occurrenceIndex === index);
          return (
            <li key={index} className="rounded-2xl border bg-white p-4 text-center">
              <p className="text-xs text-slate-500">العالم {index + 1}</p>
              <p className="mt-1 text-lg font-black">
                {selection
                  ? names.get(selection.worldId) ?? shortWorldName(selection.worldId, index)
                  : "بانتظار الاختيار"}
                {selection && counts[selection.worldId] > 1
                  ? ` ×${counts[selection.worldId]}`
                  : ""}
              </p>
              {selection && (
                <p className="mt-1 text-xs text-slate-500">
                  {selectionMethodLabels[selection.method]}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {!match.worldSelection.complete && (
        <div className="rounded-2xl bg-slate-950 p-5 text-center text-white">
          <p className="text-sm text-amber-300">الدور الحالي</p>
          <p className="text-2xl font-black">
            {match.worldSelection.requiresAgreement ? "قرار الفريقين" : chooser}
          </p>
          {actor !== "controller" && <p className="mt-2 text-slate-300">بانتظار اختيار المتحكّم.</p>}
        </div>
      )}
      {actor === "controller" && canSelect && (
        <section className="space-y-3 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
          <h2 className="font-black">اختيار العالم التالي</h2>
          {loadingWorlds ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={worldId} onValueChange={setWorldId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر عالمًا — التكرار مسموح" />
              </SelectTrigger>
              <SelectContent>
                {worlds?.map((world) => (
                  <SelectItem key={world.worldId} value={world.worldId}>
                    {world.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedWorld?.hasRelationalChallenge && (
            <p className="rounded-lg bg-amber-100 p-2 text-sm text-amber-900">
              تنبيه تطويري: يحتوي هذا العالم على تحدٍ مرن غير منفّذ بعد. هذا لا يمنع اختيار العالم، لكنه سيظهر «قريبًا» على اللوحة.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {match.worldSelection.requiresAgreement ? (
              <>
                <Button disabled={!worldId || controller.pending} onClick={() => submit("agreed")}>
                  اعتماد العالم المتفق عليه
                </Button>
                <Button variant="outline" disabled={controller.pending} onClick={() => submit("random")}>
                  اختيار عشوائي من الخادم
                </Button>
              </>
            ) : (
              <Button disabled={!worldId || controller.pending} onClick={() => submit("team_pick")}>
                اعتماد اختيار {chooser}
              </Button>
            )}
          </div>
        </section>
      )}
      <CommandError controller={controller} />
    </StageCard>
  );
}

function BoardStage({
  actor,
  worlds,
}: {
  actor: MatchActor;
  worlds?: MatchSelectableWorld[];
}) {
  const { snapshot } = useLiveSession();
  const [selectedSlot, setSelectedSlot] = useState<MatchBoardSlot>();
  if (!snapshot?.match?.currentOccurrence) return null;
  const match = snapshot.match;
  const occurrence = match.currentOccurrence!;
  const name = worlds?.find((world) => world.worldId === occurrence.worldId)?.name;
  const canLaunch = match.availableActions.includes("match:launch-challenge");
  return (
    <>
      <header className="grid gap-4 md:grid-cols-[1fr_320px] md:items-end">
        <div>
          <p className="font-bold text-amber-700">العالم {occurrence.index + 1} من 3</p>
          <h1 className="text-4xl font-black">{name ?? shortWorldName(occurrence.worldId, occurrence.index)}</h1>
        </div>
        <MatchScoreDisplay compact />
      </header>
      <section className="grid gap-4 sm:grid-cols-2" aria-label="لوحة تحديات العالم">
        {(match.board?.slots ?? []).map((slot) => {
          const available =
            actor === "controller" &&
            canLaunch &&
            slot.status === "available" &&
            slot.launchability === "launchable";
          return (
            <Card
              key={slot.slotKey}
              className={
                slot.status === "completed"
                  ? "border-emerald-300 bg-emerald-50"
                  : slot.status === "in_progress"
                    ? "border-amber-400 bg-amber-50"
                    : "border-slate-200 bg-white"
              }
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500">{slotLabels[slot.slotKey]}</p>
                    <CardTitle>{slot.challengeName ?? slotLabels[slot.slotKey]}</CardTitle>
                  </div>
                  {slot.status === "completed" ? (
                    <CheckCircle2 className="size-6 text-emerald-600" aria-label="مكتمل" />
                  ) : slot.launchability !== "launchable" ? (
                    <Lock className="size-5 text-slate-400" aria-hidden />
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{slotStatusLabels[slot.status]}</Badge>
                  <Badge variant={slot.launchability === "launchable" ? "secondary" : "outline"}>
                    {launchabilityLabels[slot.launchability]}
                  </Badge>
                </div>
                {slot.scoreSummary && (
                  <p className="text-sm text-slate-600">
                    {slot.scoreSummary
                      .map((score) => `${teamName(snapshot, score.teamId)}: ${score.displayTotal}`)
                      .join(" · ")}
                  </p>
                )}
                {available && (
                  <Button className="w-full" onClick={() => setSelectedSlot(slot)}>
                    <FlaskConical className="size-4" aria-hidden />
                    اختيار المحتوى وتشغيل التحدي
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>
      {actor === "participant" && (
        <p className="rounded-xl bg-white p-4 text-center text-slate-600">
          بانتظار المتحكّم لاختيار التحدي التالي.
        </p>
      )}
      <DevelopmentLaunchDialog
        slot={selectedSlot}
        open={Boolean(selectedSlot)}
        onOpenChange={(open) => !open && setSelectedSlot(undefined)}
      />
    </>
  );
}

function ChallengeStage({
  actor,
  worlds,
}: {
  actor: MatchActor;
  worlds?: MatchSelectableWorld[];
}) {
  const { snapshot } = useLiveSession();
  if (!snapshot?.match) return null;
  const current = snapshot.match.currentChallenge;
  const occurrence = snapshot.match.currentOccurrence;
  const worldName = occurrence
    ? worlds?.find((world) => world.worldId === occurrence.worldId)?.name
    : undefined;
  return (
    <>
      <header className="grid gap-3 md:grid-cols-[1fr_300px] md:items-center">
        <div>
          <p className="text-sm font-bold text-amber-700">
            {worldName ?? (occurrence ? shortWorldName(occurrence.worldId, occurrence.index) : "التحدي الحالي")}
          </p>
          <h1 className="text-2xl font-black">
            {current ? slotLabels[current.slotKey] : "جارٍ استعادة التحدي"}
          </h1>
        </div>
        <MatchScoreDisplay compact />
      </header>
      {snapshot.gameplay ? (
        <MatchGameplayRenderer actor={actor} />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-10 text-slate-600">
            <RefreshCw className="size-5 animate-spin" aria-hidden />
            جارٍ استعادة حالة التحدي من الخادم…
          </CardContent>
        </Card>
      )}
      {actor === "controller" && (
        <p className="text-center text-sm text-slate-500">
          سيعود التدفق إلى اللوحة تلقائيًا فور اكتمال التحدي في الخادم.
        </p>
      )}
    </>
  );
}

function WorldCompleteStage({
  actor,
  worlds,
}: {
  actor: MatchActor;
  worlds?: MatchSelectableWorld[];
}) {
  const { snapshot } = useLiveSession();
  const controller = useMatchController();
  if (!snapshot?.match?.currentOccurrence) return null;
  const match = snapshot.match;
  const occurrence = match.currentOccurrence!;
  const name = worlds?.find((world) => world.worldId === occurrence.worldId)?.name;
  const scores = match.scoring.worldSubtotals;
  const sorted = [...scores].sort((a, b) => b.displayTotal - a.displayTotal);
  const tie = sorted.length === 2 && sorted[0].displayTotal === sorted[1].displayTotal;
  const next = match.worldSelection.selections.find(
    (item) => item.occurrenceIndex === occurrence.index + 1,
  );
  const canContinue = match.availableActions.includes("match:continue");
  return (
    <StageCard eyebrow={`اكتمل العالم ${occurrence.index + 1} من 3`} title={name ?? shortWorldName(occurrence.worldId, occurrence.index)}>
      <Trophy className="mx-auto size-16 text-amber-500" aria-hidden />
      <div className="grid gap-3 sm:grid-cols-2">
        {snapshot.teams.map((team) => {
          const score = scores.find((item) => item.teamId === team.id);
          return (
            <div key={team.id} className="rounded-2xl bg-white p-5 text-center">
              <p>{team.name}</p>
              <p className="text-4xl font-black">{score?.displayTotal ?? 0}</p>
            </div>
          );
        })}
      </div>
      <p className="text-center text-xl font-bold">
        {tie ? "تعادل في هذا العالم" : `يتقدم ${teamName(snapshot, sorted[0]?.teamId)} في هذا العالم`}
      </p>
      <p className="text-center text-sm text-slate-600">
        اكتملت {(match.board?.slots ?? []).filter((slot) => slot.status === "completed").length} من {(match.board?.slots ?? []).length} تحديات في هذا العالم.
      </p>
      <MatchScoreDisplay />
      {next && (
        <p className="rounded-xl bg-amber-100 p-4 text-center">
          التالي: {worlds?.find((world) => world.worldId === next.worldId)?.name ?? shortWorldName(next.worldId, next.occurrenceIndex)}
        </p>
      )}
      {actor === "controller" && canContinue ? (
        <Button
          className="mx-auto flex"
          size="lg"
          disabled={controller.pending || !controller.connected}
          onClick={() => controller.run({ type: "continue-world" })}
        >
          متابعة إلى العالم التالي
        </Button>
      ) : actor !== "controller" ? (
        <p className="text-center text-slate-600">بانتظار المتحكّم للمتابعة.</p>
      ) : null}
      <CommandError controller={controller} />
    </StageCard>
  );
}

function MatchCompleteStage({
  actor,
  participantId,
  worlds,
}: {
  actor: MatchActor;
  participantId?: string;
  worlds?: MatchSelectableWorld[];
}) {
  const { snapshot } = useLiveSession();
  if (!snapshot?.match?.result) return null;
  const result = snapshot.match.result;
  const participant = snapshot.participants.find((item) => item.id === participantId);
  const participantWon = participant?.teamId === result.winnerTeamId;
  const title = result.tie
    ? "المباراة انتهت بالتعادل"
    : actor === "participant"
      ? participantWon
        ? "فاز فريقكم!"
        : `أحسنتم — فاز ${teamName(snapshot, result.winnerTeamId ?? undefined)}`
      : `الفائز: ${teamName(snapshot, result.winnerTeamId ?? undefined)}`;
  return (
    <StageCard
      eyebrow="النتيجة النهائية"
      title={title}
    >
      {result.tie ? (
        <Sparkles className="mx-auto size-20 text-amber-500" aria-hidden />
      ) : (
        <Crown className="mx-auto size-20 text-amber-500" aria-hidden />
      )}
      <div className="mx-auto w-full max-w-xl">
        <MatchScoreDisplay />
      </div>
      <section>
        <h2 className="mb-3 text-xl font-black">نتائج العوالم</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {result.worlds.map((world) => (
            <div key={world.occurrenceIndex} className="rounded-2xl border bg-white p-4">
              <p className="text-xs text-slate-500">العالم {world.occurrenceIndex + 1}</p>
              <p className="font-black">
                {worlds?.find((item) => item.worldId === world.worldId)?.name ?? shortWorldName(world.worldId, world.occurrenceIndex)}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {world.subtotals
                  .map((score) => `${teamName(snapshot, score.teamId)}: ${score.displayTotal}`)
                  .join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </section>
      {actor === "controller" && (
        <Button variant="outline" onClick={() => window.history.back()}>
          العودة إلى لوحة الجلسات
        </Button>
      )}
    </StageCard>
  );
}

function MatchGameplayRenderer({ actor }: { actor: MatchActor }) {
  const { snapshot } = useLiveSession();
  if (!snapshot?.gameplay) return null;
  const runtime =
    actor === "shared-screen"
      ? { ...snapshot.gameplay, availableActions: [] }
      : snapshot.gameplay;
  if (runtime.mode.key === "read-your-opponent") {
    return <RyoGameplayPanel runtime={runtime} />;
  }
  if (runtime.mode.key === "top-10") {
    return <Top10PoisonDeckPanel runtime={runtime} />;
  }
  if (runtime.mode.key === DISTRIBUTED_INFORMATION_MODE_KEY) {
    // A phone gets its own private projection; the screen and the controller
    // watch the public race. The runtime key is the only thing switched on.
    return actor === "participant" ? (
      <DistributedInformationPanel runtime={runtime} />
    ) : (
      <DistributedInformationScreen runtime={runtime} />
    );
  }
  return <GameplayRuntimePanel />;
}

function StageCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-amber-200 bg-[#fffdf8] shadow-sm">
      <CardHeader className="text-center">
        <p className="text-sm font-bold text-amber-700">{eyebrow}</p>
        <CardTitle className="text-3xl font-black sm:text-4xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">{children}</CardContent>
    </Card>
  );
}

function CommandError({
  controller,
}: {
  controller: ReturnType<typeof useMatchController>;
}) {
  if (!controller.error) return null;
  return (
    <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
      <p>{controller.error.message}</p>
      <details className="mt-1 text-xs opacity-70">
        <summary>تفاصيل للمطوّر</summary>
        {controller.error.code}: {controller.error.rawMessage}
      </details>
    </div>
  );
}
