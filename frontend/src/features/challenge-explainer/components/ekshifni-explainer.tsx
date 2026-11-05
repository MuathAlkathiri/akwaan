"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Check, Eye, LockKeyhole, X } from "lucide-react";
import { EkshifniBoard } from "@/components/akwaan/ekshifni-board";
import {
  PhoneFrame,
  SharedScreenFrame,
} from "@/features/how-to-play/components/device-frames";
import { cn } from "@/lib/utils";
import type { EkshifniTutorialScenario } from "../tutorial-scenario";
import { EKSHIFNI_DEMO_STEPS } from "../ekshifni-demo-scenario";
import { useExplainerTimeline } from "../use-explainer-timeline";
import { ExplainerCaption, ExplainerControls, showsExplainerControls } from "./explainer-controls";
import type { ExplainerMode } from "./ryo-explainer";

export function EkshifniExplainer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: EkshifniTutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const timeline = useExplainerTimeline(EKSHIFNI_DEMO_STEPS, scope);
  const step = EKSHIFNI_DEMO_STEPS[timeline.index];
  const ids = EKSHIFNI_DEMO_STEPS.map((item) => item.id);
  const at = (id: string) => ids.indexOf(step.id) >= ids.indexOf(id as never);
  const final = step.id === "final";
  const fullReveal = step.id === "full-reveal";
  const phoneFocused = [
    "answer-entry",
    "wrong",
    "initiative-transfer",
    "correct-entry",
  ].includes(step.id);
  const revealedCount = at("opponent-reveal")
    ? 3
    : at("second-window")
      ? 2
      : at("first-window")
        ? 1
        : 0;
  const value = Math.max(1, 5 - revealedCount);
  const initiative =
    at("wrong") && !at("correct") ? "الفريق الثاني" : "الفريق الأول";
  const boardRegions = scenario.regions.map((region, index) => ({
    ...region,
    revealed:
      index < 2
        ? index < revealedCount
        : region.id === "r6" && revealedCount >= 3,
  }));
  const openRegionNumbers = boardRegions
    .filter((region) => region.revealed)
    .map((region) => region.number);

  useEffect(() => {
    const element = scope.current;
    if (!element) return;
    const mountCount = Number(element.dataset.ekshifniMountCount ?? "0") + 1;
    element.dataset.ekshifniMountCount = String(mountCount);
    return () => {
      element.dataset.ekshifniUnmountCount = String(
        Number(element.dataset.ekshifniUnmountCount ?? "0") + 1,
      );
    };
  }, []);

  useEffect(() => {
    if (timeline.reducedMotion || !scope.current) return;
    const context = gsap.context(() => {
      if (
        ["first-window", "second-window", "opponent-reveal"].includes(step.id)
      ) {
        gsap.fromTo(
          "[data-ekshifni-value]",
          { scale: 1.4 },
          { scale: 1, duration: 0.65, ease: "back.out(1.8)" },
        );
      }
    }, scope);
    return () => context.revert();
  }, [step.id, timeline.reducedMotion]);

  return (
    <div
      ref={scope}
      dir="rtl"
      data-testid="ekshifni-explainer"
      data-demo-step={step.id}
      className={compact ? "space-y-3" : "space-y-5"}
    >
      {showsExplainerControls(mode, timeline) ? (
        <div className="h-[9rem] sm:h-[7rem]">
          <ExplainerControls
            step={timeline.index}
            total={EKSHIFNI_DEMO_STEPS.length}
            caption={step.caption}
            phase={fullReveal || final ? "resolved" : "simulation"}
            timeline={timeline}
            compact={compact}
            stackOnNarrow
          />
        </div>
      ) : (
        <ExplainerCaption caption={step.caption} compact={compact} />
      )}

      <div
        data-ekshifni-scene
        className={cn(
          "relative grid h-[36rem] gap-3 overflow-hidden lg:h-[40rem] lg:grid-cols-[minmax(0,1.85fr)_minmax(18rem,.75fr)] lg:place-items-stretch",
          phoneFocused &&
            "max-lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] max-lg:items-center",
        )}
      >
        <div
          className={cn(
            "min-w-0 max-lg:flex max-lg:items-center max-lg:justify-center",
            !phoneFocused &&
              "max-lg:absolute max-lg:inset-0 max-lg:justify-center",
          )}
        >
          <SharedScreenFrame
            className={cn("min-w-0", phoneFocused && "max-lg:w-full")}
            stand={!compact && !phoneFocused}
          >
            {final ? (
              <section
                data-testid="ekshifni-final"
                className="flex min-h-[34rem] flex-col items-center justify-center gap-4 text-center sm:min-h-[36rem]"
              >
                <p className="text-sm font-black text-muted-foreground">
                  النتيجة بعد 3 صور
                </p>
                <div className="flex gap-4">
                  <Score name="الفريق الأول" value={6} />
                  <Score name="الفريق الثاني" value={8} winner />
                </div>
                <p className="rounded-full bg-brand-gold/15 px-5 py-2 text-lg font-black text-brand-navy">
                  الفريق الثاني يفوز · +1 نقطة مباراة
                </p>
              </section>
            ) : (
              <section
                className={cn(
                  "flex flex-col p-1",
                  phoneFocused
                    ? "min-h-[19rem] justify-between space-y-1 sm:min-h-[20rem]"
                    : "min-h-[34rem] space-y-2 sm:min-h-[36rem] sm:space-y-3",
                )}
              >
                {phoneFocused ? (
                  <div
                    data-testid="ekshifni-context-status"
                    className="flex flex-wrap items-center justify-center gap-1 text-center text-[0.62rem] font-black leading-tight"
                  >
                    <span className="rounded-full bg-muted px-2 py-1">
                      الصورة 1 من 3
                    </span>
                    <span className="rounded-full border border-brand-gold/50 px-2 py-1 text-brand-navy">
                      {openRegionNumbers.length > 0
                        ? `مفتوح: ${openRegionNumbers.join(" · ")}`
                        : "محجوبة بالكامل"}
                    </span>
                    <span className="w-full text-muted-foreground">
                      {initiative} · {value} نقاط
                    </span>
                  </div>
                ) : (
                  <>
                    <header className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-black">
                        الصورة 1 من 3
                      </span>
                      <span
                        data-ekshifni-value
                        className="rounded-full border px-3 py-1 text-sm font-black"
                      >
                        لو جاوبتم الآن · {value} نقاط
                      </span>
                    </header>
                    {!fullReveal && (
                      <p className="text-center text-sm font-black">
                        <span className="text-brand-navy">{initiative}</span>{" "}
                        يختار النافذة ·{" "}
                        <span className="text-muted-foreground">
                          الإجابة مفتوحة للفريقين
                        </span>
                      </p>
                    )}
                  </>
                )}
                <div
                  data-testid="ekshifni-tutorial-board"
                  className={cn(
                    "mx-auto flex min-h-0 flex-1 items-center",
                    phoneFocused
                      ? "max-lg:max-w-[10rem] lg:max-w-[36rem]"
                      : "max-w-[23rem] lg:max-w-[36rem]",
                  )}
                >
                  <EkshifniBoard
                    url={scenario.image.url}
                    altText={
                      fullReveal ? scenario.image.altText : "صورة مشهورة مخفية"
                    }
                    regions={boardRegions}
                    unmasked={fullReveal}
                    newestRegionId={
                      revealedCount === 3
                        ? "r6"
                        : revealedCount
                          ? `r${revealedCount}`
                          : undefined
                    }
                    imageClassName={cn(
                      "max-h-[46vh] lg:max-h-[54vh]",
                      phoneFocused && "max-h-[25vh]",
                      fullReveal && "lg:max-h-[48vh]",
                    )}
                    presentation={
                      phoneFocused ? "tutorial-compact" : "tutorial"
                    }
                    resolveMediaUrl={false}
                  />
                </div>
                {fullReveal ? (
                  <div className="mt-auto text-center">
                    <p className="text-2xl font-black">
                      {scenario.celebrityIdentity}
                    </p>
                    <p className="font-black text-brand-navy">
                      الفريق الثاني +2
                    </p>
                  </div>
                ) : step.id === "correct" ? (
                  <p className="text-center font-black text-success">
                    <Check className="me-1 inline size-5" />
                    إجابة صحيحة · نقطتان
                  </p>
                ) : null}
              </section>
            )}
          </SharedScreenFrame>
        </div>

        <div
          className={cn(
            "min-w-0 max-lg:flex max-lg:items-center max-lg:justify-center lg:static lg:flex lg:items-center lg:justify-center",
            !phoneFocused &&
              "max-lg:absolute max-lg:inset-0 max-lg:invisible max-lg:pointer-events-none",
          )}
        >
          <PhoneFrame
            className={cn(
              "w-full lg:max-w-[18rem]",
              phoneFocused ? "max-w-[11rem]" : "max-w-[15rem]",
            )}
          >
            <div
              className={cn(
                "flex flex-col justify-center p-3 text-center",
                phoneFocused
                  ? "min-h-[19rem] gap-2 max-lg:p-2"
                  : "min-h-[28rem] gap-3",
              )}
            >
              {step.id === "answer-entry" ? (
                <Answer value="إجابة أولية غير صحيحة" team="الفريق الأول" />
              ) : step.id === "wrong" ? (
                <>
                  <X className="mx-auto size-11 text-destructive" />
                  <p className="text-lg font-black">إجابة غير صحيحة</p>
                  <p className="text-sm text-muted-foreground">
                    مبادرة الكشف انتقلت للفريق الثاني
                  </p>
                </>
              ) : step.id === "initiative-transfer" ? (
                <>
                  <LockKeyhole className="mx-auto size-11 text-brand-gold" />
                  <p className="font-black">الإجابة متوقفة مؤقتًا</p>
                  <p className="text-sm text-muted-foreground">
                    ترجع بعد حركة واحدة من الفريق الثاني
                  </p>
                </>
              ) : step.id === "correct-entry" ? (
                <Answer value="إجابة جاهزة للإرسال" team="الفريق الثاني" />
              ) : (
                <>
                  <Eye className="mx-auto size-10 text-brand-gold" />
                  <p className="font-black">اختاروا رقم النافذة</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[...scenario.regions]
                      .sort((a, b) => a.number - b.number)
                      .map((region) => (
                        <span
                          key={region.id}
                          className="grid size-11 place-items-center rounded-lg border font-black"
                        >
                          {region.number}
                        </span>
                      ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    أو جاوبوا مباشرة
                  </p>
                </>
              )}
            </div>
          </PhoneFrame>
        </div>
      </div>
    </div>
  );
}

function Answer({ value, team }: { value: string; team: string }) {
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs font-black">
        <span>اكشفني</span>
        <span>الصورة 1 من 3</span>
      </div>
      <p className="text-sm font-black text-muted-foreground">
        {team} · الإجابة مفتوحة
      </p>
      <div className="rounded-xl border-2 px-3 py-4 text-lg font-black">
        {value}
      </div>
      <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-black">
        <span>القيمة الآن</span>
        <span className="text-brand-navy">3 نقاط</span>
      </div>
      <div className="rounded-xl bg-primary px-3 py-3 font-black text-primary-foreground">
        إرسال الإجابة
      </div>
    </div>
  );
}

function Score({
  name,
  value,
  winner = false,
}: {
  name: string;
  value: number;
  winner?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-6 py-4",
        winner && "border-brand-gold bg-brand-gold/10",
      )}
    >
      <p className="text-sm font-black text-muted-foreground">{name}</p>
      <p className="text-4xl font-black">{value}</p>
    </div>
  );
}
