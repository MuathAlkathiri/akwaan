"use client";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";
import type { MatchActor } from "../match/types";
import {
  FIRST_NOTE_NAME,
  readFirstNoteView,
} from "../match/first-note.presentation";

export function FirstNoteGameplayPanel({
  runtime,
  actor,
}: {
  runtime: GameplayRuntimeSnapshot;
  actor: MatchActor;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const view = useMemo(
    () => readFirstNoteView(runtime.modeState),
    [runtime.modeState],
  );
  const [bid, setBid] = useState("");
  const [answer, setAnswer] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const can = (a: string) => runtime.availableActions.includes(`mode:${a}`);
  const send = (
    commandType: string,
    payload: Record<string, string | number> = {},
  ) =>
    gameplayCommand("gameplay-command", {
      roundId: runtime.activeRound?.id,
      commandType,
      payload,
    });
  const team = (id?: string | null) =>
    snapshot?.teams.find((t) => t.id === id)?.name ?? "الفريق";
  const phone = actor === "participant";
  const live = connection === "connected";
  const max = (view.currentBidSeconds ?? 16) - 1;
  return (
    <ChallengeFrame
      eyebrow={FIRST_NOTE_NAME}
      title={
        view.phase === "completed"
          ? "نتيجة التحدي"
          : `الأغنية ${view.songIndex + 1} من ${view.songCount}`
      }
      progressValue={
        view.phase === "completed"
          ? 100
          : ((view.songIndex + 1) / view.songCount) * 100
      }
      className="mx-auto max-w-4xl"
    >
      <div dir="rtl" className="space-y-5" data-testid="first-note-panel">
        {view.phase === "preparing" && (
          <p className="text-center font-bold">جارٍ تجهيز المقطع…</p>
        )}
        {view.phase !== "preparing" && view.phase !== "completed" && (
          <section
            className="rounded-[var(--radius)] border bg-card p-5 text-center"
            data-testid="first-note-clue"
          >
            {view.clueLabel?.ar && (
              <p className="text-sm text-muted-foreground">
                {view.clueLabel.ar}
              </p>
            )}
            <p className="text-2xl font-black">{view.clue.ar}</p>
          </section>
        )}
        {view.phase === "auction" && (
          <section
            className="space-y-4 text-center"
            data-testid="first-note-auction"
          >
            {!phone && view.audio?.assets[0] && (
              <audio
                className="hidden"
                preload="auto"
                src={view.audio.assets[0].url}
                data-testid="first-note-audio-preload"
              />
            )}
            <p className="text-lg font-bold">
              أقل مزايدة:{" "}
              <strong>
                {view.currentBidSeconds
                  ? `${view.currentBidSeconds} ثانية · ${team(view.currentBidTeamId)}`
                  : "لم تبدأ"}
              </strong>
            </p>
            <p>
              {team(view.biddingTeamId)} عليه الدور · المسموح 1–{max} ثانية
            </p>
            {phone && view.canBid && can("submit-first-note-bid") ? (
              <div className="mx-auto flex max-w-sm gap-2">
                <Input
                  type="number"
                  min={1}
                  max={max}
                  value={bid}
                  onChange={(e) => setBid(e.target.value)}
                  data-testid="first-note-bid-input"
                />
                <Button
                  disabled={
                    !live ||
                    !Number.isInteger(Number(bid)) ||
                    Number(bid) < 1 ||
                    Number(bid) > max
                  }
                  onClick={() =>
                    send("submit-first-note-bid", { seconds: Number(bid) })
                  }
                  data-testid="first-note-submit-bid"
                >
                  زايد
                </Button>
              </div>
            ) : phone ? (
              <p>بانتظار الفريق الآخر</p>
            ) : null}
            {phone && view.canPass && can("pass-first-note-bid") && (
              <Button
                variant="outline"
                disabled={!live}
                onClick={() => send("pass-first-note-bid")}
                data-testid="first-note-pass"
              >
                توقف عن المزايدة
              </Button>
            )}
          </section>
        )}
        {(view.phase === "answering" || view.phase === "steal") && (
          <section
            className="space-y-4 text-center"
            data-testid="first-note-answer-phase"
          >
            <p className="text-xl font-black">
              {view.phase === "steal"
                ? "فرصة سرقة واحدة"
                : `${team(view.answerOwnerTeamId)} قال يقدر يعرفها من ${view.finalBidSeconds} ثانية`}
            </p>
            {view.audio?.assets[0] && !phone && (
              <audio
                ref={audioRef}
                controls
                autoPlay
                preload="auto"
                src={view.audio.assets[0].url}
                data-clip-seconds={view.finalBidSeconds}
                data-testid="first-note-audio"
                onTimeUpdate={(event) => {
                  if (
                    event.currentTarget.currentTime >=
                    (view.finalBidSeconds ?? 0)
                  ) {
                    event.currentTarget.pause();
                    event.currentTarget.currentTime = view.finalBidSeconds ?? 0;
                  }
                }}
              />
            )}
            <p>مدة المقطع: {view.finalBidSeconds} ثانية</p>
            {phone && view.canAnswer && can("submit-first-note-answer") ? (
              <div className="mx-auto flex max-w-md gap-2">
                <Input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  data-testid="first-note-answer-input"
                />
                <Button
                  disabled={!live || !answer.trim()}
                  onClick={() =>
                    send("submit-first-note-answer", { answer: answer.trim() })
                  }
                >
                  إرسال
                </Button>
              </div>
            ) : phone ? (
              <p>بانتظار الفريق المجيب</p>
            ) : null}
          </section>
        )}
        {view.phase === "resolved" && view.reveal && (
          <section
            className="space-y-2 text-center"
            data-testid="first-note-reveal"
          >
            <h2 className="text-3xl font-black">{view.reveal.title}</h2>
            <p>المزايدة الأخيرة: {view.reveal.finalBidSeconds} ثانية</p>
            <p>
              {view.reveal.winnerTeamId
                ? `${team(view.reveal.winnerTeamId)} · ${view.reveal.points[view.reveal.winnerTeamId]} نقاط`
                : "بدون فائز"}
            </p>
            {actor === "controller" && can("advance-first-note") && (
              <Button onClick={() => send("advance-first-note")}>
                الأغنية التالية
              </Button>
            )}
          </section>
        )}
        {view.phase === "completed" && view.result && (
          <section className="text-center" data-testid="first-note-recap">
            {Object.entries(view.result.points).map(([id, points]) => (
              <p key={id} className="text-xl font-black">
                {team(id)}: {points}
              </p>
            ))}
          </section>
        )}
      </div>
    </ChallengeFrame>
  );
}
