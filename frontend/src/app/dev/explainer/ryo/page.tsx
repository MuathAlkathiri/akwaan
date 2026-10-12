import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Copy, Smartphone, Users } from "lucide-react";
import {
  RyoExplainer,
  RyoExplainerDialog,
  SAMPLE_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";
import { ScannableQr } from "@/components/akwaan/scannable-qr";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "معاينة — شاشة تحضير اقرأ خصمك",
  robots: { index: false, follow: false },
};

/**
 * Development-only preview of the redesigned RYO Challenge Preflight.
 *
 * A faithful reconstruction of the real screen's composition — identity banner,
 * explanation left, joining right, launch across the bottom — so a screenshot
 * of this page is a screenshot of the layout, not of one component in a box.
 *
 * Everything except the explainer is a **static fixture**. The join code is not
 * a real code, the QR points at this preview page rather than any join route, no
 * session exists, and every control here is inert and labelled as such. Only the
 * explainer is the production component, because it is the thing under review.
 *
 * Gated on the build: in a production build this route 404s.
 */

const FIXTURE = {
  world: "كرة قدم",
  occurrence: "العالم الأول",
  challenge: "اقرأ خصمك",
  summary: "فريق يجاوب، والفريق الثاني يقرأه.",
  startingTeam: "الفريق الأول",
  steps: [
    "فريق الدور يختار إجابته بالسر.",
    "بنفس الوقت، الفريق الثاني يقرر: يثق أو يسرق.",
    "تنكشف الإجابة والقرار مع بعض، وتنحسب النقاط تلقائي.",
  ],
  joinCode: "DEMO42",
  teams: [
    { name: "الفريق الأول", connected: 2, target: 3, ready: false },
    { name: "الفريق الثاني", connected: 3, target: 3, ready: true },
  ],
};

export default function RyoPreflightPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
            معاينة تطوير · غير منشورة
          </p>
          <h1 className="text-xl font-black text-foreground sm:text-2xl">
            شاشة تحضير التحدي — اقرأ خصمك
          </h1>
        </div>
        <p
          data-testid="preview-fixture-notice"
          className="rounded-full border-2 border-brand-gold/40 bg-brand-gold/10 px-3 py-1 text-[0.7rem] font-black text-foreground"
        >
          كل شيء عدا الشرح بيانات تجريبية — لا يوجد جلسة ولا انضمام حقيقي
        </p>
      </header>

      <div className="space-y-3" data-testid="preview-preflight">
        {/* Identity banner */}
        <section className="surface-card overflow-hidden">
          <div className="grid gap-0 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
            <div className="grid h-20 place-items-center bg-[hsl(var(--brand-navy))] text-center sm:h-full sm:min-h-[6rem]">
              <span className="px-3">
                <span className="block text-[0.6rem] font-bold text-white/70">
                  {FIXTURE.occurrence}
                </span>
                <span className="block text-sm font-black text-white">
                  {FIXTURE.world}
                </span>
              </span>
            </div>
            <div className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
              <div className="min-w-0 space-y-1">
                <h2 className="text-xl font-black leading-tight text-foreground sm:text-2xl">
                  {FIXTURE.challenge}
                </h2>
                <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
                  {FIXTURE.summary}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">
                  <Smartphone className="size-3" aria-hidden />
                  يحتاج جوالات
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-bold text-muted-foreground">
                  <Users className="size-3" aria-hidden />
                  {FIXTURE.startingTeam} يبدأ
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2.6fr)_minmax(16rem,1fr)]">
          {/* LEFT — the only production component on this page */}
          <section className="surface-card space-y-2.5 p-3 sm:p-4">
            {/* The real Preflight composition: a title, the authored steps, and
                the demonstration one click away — so what is reviewed here is
                the production surface, not an approximation of it. */}
            <header className="flex items-start justify-between gap-3">
              <span className="min-w-0 space-y-0.5">
                <h3 className="text-base font-black text-foreground">شرح التحدي</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  اقروا الخطوات قبل ما تبدأون.
                </p>
              </span>
              <RyoExplainerDialog mechanicKey="read-your-opponent" />
            </header>
            <ol className="list-none space-y-2">
              {FIXTURE.steps.map((step, index) => (
                <li
                  key={step}
                  className="preflight-secondary-surface flex min-h-11 items-start gap-3 rounded-xl p-2"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="text-sm leading-6 font-black">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* RIGHT — joining + readiness, all fixture */}
          <aside className="surface-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-3">
              <span className="flex items-center gap-2 text-sm font-black text-foreground">
                <Smartphone className="size-4 text-primary" aria-hidden />
                انضمام اللاعبين
              </span>
            </div>
            <div className="space-y-2 border-t border-border/70 p-3">
              <p className="text-xs font-bold leading-5 text-muted-foreground">
                امسحوا الرمز للانضمام إلى المباراة. لا تحتاجون لإعادة المسح بين
                التحديات.
              </p>
              <div className="preflight-secondary-surface flex items-center gap-3 rounded-[var(--radius)] p-2.5">
                <span className="flex shrink-0 flex-col items-center gap-1">
                  {/* Points at this preview page, never at a join route. */}
                  <ScannableQr value="https://example.invalid/preview" size={80} />
                  <span className="text-[0.6rem] font-bold text-muted-foreground">
                    رمز تجريبي
                  </span>
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block text-[0.65rem] font-black text-muted-foreground">
                    قولوا للاعبين: ادخلوا الكود
                  </span>
                  <span className="akwaan-numeral block text-2xl font-black tracking-[0.22em] text-foreground">
                    {FIXTURE.joinCode}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled
                    className="h-8 px-2 text-xs font-black disabled:opacity-70"
                  >
                    <Copy className="size-3.5" aria-hidden />
                    نسخ الرابط (معطّل)
                  </Button>
                </span>
              </div>
            </div>
            <div className="space-y-2 border-t border-border/70 p-3">
              <h3 className="flex items-center gap-2 text-sm font-black text-foreground">
                <Users className="size-4 text-muted-foreground" aria-hidden />
                جاهزية اللاعبين
              </h3>
              <ul className="list-none space-y-2">
                {FIXTURE.teams.map((team) => (
                  <li
                    key={team.name}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-sm font-black text-foreground">
                      {team.name}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="akwaan-numeral text-sm font-black text-muted-foreground">
                        {team.connected}/{team.target}
                      </span>
                      <span
                        className={
                          team.ready
                            ? "text-xs font-black text-sem-success"
                            : "text-xs font-black text-muted-foreground"
                        }
                      >
                        {team.ready ? "جاهزين" : "ناقص لاعب"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        {/* The editor's view of the same scenario: identical demonstration,
            with the transport an author needs to step through beats. */}
        <section
          className="surface-card space-y-2.5 p-3 sm:p-4"
          data-testid="preview-mode-sample"
        >
          <header className="space-y-0.5">
            <h3 className="text-base font-black text-foreground">
              وضع المعاينة (الأدمن والتطوير)
            </h3>
            <p className="text-xs leading-5 text-muted-foreground">
              نفس العرض، مع أدوات التنقل بين اللقطات — للمراجعة فقط.
            </p>
          </header>
          <RyoExplainer
            scenario={SAMPLE_TUTORIAL_SCENARIO}
            compact
            mode="preview"
          />
        </section>

        {/* Bottom action — disabled fixture, matching a not-yet-ready state */}
        <section className="surface-card p-3">
          <p className="mb-2 text-center text-sm font-bold text-muted-foreground">
            بانتظار {FIXTURE.teams[0].name}
          </p>
          <Button
            type="button"
            size="lg"
            disabled
            className="w-full gap-2 font-black disabled:opacity-70"
          >
            ابدأ التحدي (معطّل في المعاينة)
          </Button>
        </section>
      </div>
    </main>
  );
}
