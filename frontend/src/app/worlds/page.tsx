import type { Metadata } from "next";
import Link from "next/link";
import { SectionTag, Spark, STICKER } from "@/components/akwaan/sticker";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "العوالم",
  description:
    "وش يعني «عالم» في أكوان، ووش يتغيّر في اللعب لما تغيّرون العالم: التحدي الخاص، المجالات، والمحتوى اللي يجيكم في المباراة.",
};

/**
 * The Worlds explainer.
 *
 * `/worlds/[worldId]` sends a player straight into setup, so this index is the
 * one place that answers the question that route cannot: what a World *is*, and
 * what choosing a different one actually changes. Picking Worlds still happens
 * on the home page — this page explains the choice and hands it back there
 * rather than opening a second way to make it.
 *
 * `/worlds` is a journey path in the shell, so it gets no page container and
 * supplies its own padding, exactly like «كيف تلعب».
 */

const CHANGES = [
  {
    title: "التحدي الخاص",
    copy: "كل عالم يملك تحدي خاص فيه، ما تلقاه في أي عالم ثاني. «أفضل 5» لكرة القدم، «الكومبو» للأنمي، «المرحلة» لفيديو قيمز، «ركّبها» لعالم الألغاز. هذا أكبر فرق بين عالم وعالم، وهو اللي يخلي اختياركم مهم.",
  },
  {
    title: "المجالات والمحتوى",
    copy: "داخل كل عالم فيه مجالات فرعية، وأنتم تختارون 4 منها. المجالات هي اللي تحدد نوع المحتوى اللي يجيكم في التحديات — فتقدرون تضيّقون العالم على اللي تعرفونه، أو تفتحونه وتجازفون.",
  },
  {
    title: "الجو والإحساس",
    copy: "التحديات المشتركة نفسها تتقدّم لكم بروح العالم اللي أنتم فيه: الأسماء والصور والإيقاع. نفس التحدي ما يحس نفس الإحساس وأنت في عالم كرة القدم أو في عالم الأنمي.",
  },
] as const;

const CONSTANTS = [
  "فريقان في كل مباراة، وشاشة وحدة مشتركة، وجوال لكل لاعب.",
  "3 عوالم في المباراة، وكل عالم يجيب 4 تحديات — يعني 12 تحدي.",
  "التحديات المشتركة الثلاثة: «اقرأ خصمك» و«مين أقرب» و«القنبلة» موجودة في كل عالم.",
  "الحساب تلقائي بالكامل، ولا أحد يحكم على إجابة أحد.",
] as const;

const TAG = "min-h-[60px] self-center px-[26px] text-[22px] sm:text-[30px]";
const BODY = "text-base leading-[1.9] text-brand-slate sm:text-[17px]";

export default function WorldsIndexPage() {
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-col gap-14 px-4 pb-20 pt-8 sm:px-8 lg:gap-[72px] lg:pt-12">
      <section className="flex max-w-[760px] flex-col items-start">
        <h1 className="font-display text-[40px] font-black leading-[1.3] text-brand-navy sm:text-[62px]">
          عوالم <span className="text-brand-purple">أكوان</span>
        </h1>
        <p className="mt-5 text-base leading-[1.9] text-brand-slate sm:text-lg">
          أكوان مو قائمة تصنيفات تختار منها سؤال. «العالم» هو الموضوع الكبير
          اللي تلعبون داخله — كرة قدم، أنمي، فيديو قيمز، ألغاز وغيرها — وكل
          عالم يجي معه أسلوب لعب يميّزه، لا مجرد أسئلة بلون ثاني. تختارون 3
          عوالم في كل مباراة، والترتيب اللي تختارونه هو ترتيب اللعب.
        </p>
      </section>

      <section
        aria-labelledby="worlds-what-title"
        className="flex flex-col gap-[30px]"
      >
        <SectionTag tone="gold" tilt={-1.5} className={TAG}>
          <h2 id="worlds-what-title">وش يعني «عالم» في أكوان؟</h2>
        </SectionTag>
        <div
          className={cn(
            "flex flex-col gap-4 rounded-3xl bg-brand-lavender p-6 sm:p-8",
            STICKER.base,
            BODY,
          )}
        >
          <p className="text-brand-navy">
            العالم عند أكوان وحدة كاملة: موضوع، ومجالات فرعية تحته، ولوحة
            تحديات خاصة به. لما تختارون عالم، أنتم ما تختارون «نوع أسئلة»
            بس — تختارون شكل الجولة نفسها، والتحدي اللي ما يتكرر في غيره،
            والطريقة اللي بيتنافس بها فريقكم.
          </p>
          <p>
            عشان كذا اختيار العوالم هو القرار الوحيد المهم قبل بداية
            المباراة. كل شيء بعده — ترتيب التحديات ولوحة كل عالم — يرتّبه
            أكوان لكم، فما تحتاجون تعرفون أسماء التحديات قبل ما تلعبونها
            أول مرة.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="worlds-changes-title"
        className="flex flex-col gap-[30px]"
      >
        <SectionTag tone="purple" tilt={1} className={TAG}>
          <h2 id="worlds-changes-title">وش يتغيّر لما يتغيّر العالم؟</h2>
        </SectionTag>
        <ul className="m-0 grid list-none gap-6 p-0 lg:grid-cols-3">
          {CHANGES.map(({ title, copy }, index) => (
            <li
              key={title}
              className={cn(
                "flex flex-col gap-2.5 rounded-[20px] p-6",
                STICKER.base,
                index === 0 ? "bg-brand-gold" : "bg-brand-paper",
              )}
            >
              <h3 className="font-display text-[21px] font-extrabold text-brand-navy">
                {title}
              </h3>
              <p
                className={cn(
                  "text-base leading-[1.85]",
                  index === 0 ? "text-brand-navy" : "text-brand-slate",
                )}
              >
                {copy}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="worlds-constant-title"
        className="flex flex-col gap-[30px]"
      >
        <SectionTag tone="white" tilt={-1} className={TAG}>
          <h2 id="worlds-constant-title">ووش ما يتغيّر؟</h2>
        </SectionTag>
        <div className="flex flex-col gap-4 rounded-3xl border-[3px] border-brand-navy bg-brand-paper px-6 py-7 shadow-[6px_7px_0_hsl(var(--brand-gold))] sm:px-9 sm:py-8">
          <p className={cn(BODY, "text-brand-navy")}>
            هيكل المباراة ثابت، عشان ما تحتاجون تتعلمون اللعبة من جديد كل
            مرة:
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {CONSTANTS.map((line) => (
              <li key={line} className={cn("flex items-start gap-3", BODY)}>
                <Spark className="mt-2 size-3.5 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="worlds-choose-title"
        className="flex flex-col gap-[30px]"
      >
        <SectionTag tone="gold" tilt={1.5} className={TAG}>
          <h2 id="worlds-choose-title">كيف تختارون عوالمكم؟</h2>
        </SectionTag>
        <div className={cn("mx-auto flex max-w-[860px] flex-col gap-4", BODY)}>
          <p className="text-brand-navy">
            من الصفحة الرئيسية تختارون 3 عوالم، وبعد كل عالم تختارون 4
            مجالات منه. نصيحة من التجربة: نوّعوا بين عالم يعرفه فريقكم
            زين وعالم محايد بينكم وبين خصومكم — المباراة اللي كل عوالمها
            في اتجاه واحد تصير متوقعة.
          </p>
          <p>
            قائمة العوالم المتاحة تكبر، وفيه عوالم تحت التجهيز تشوفونها في
            الرئيسية تحت «العوالم القادمة». المتاح الآن والجديد
            يظهران هناك أول بأول، فالرئيسية هي المرجع لوش تقدرون تلعبونه
            اليوم.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-5">
          <Link
            href="/#worlds"
            className={cn(
              "inline-flex min-h-[3.5rem] items-center justify-center rounded-full bg-brand-gold px-10 font-display text-[19px] font-extrabold text-brand-navy no-underline transition-transform duration-150 hover:-translate-y-0.5 sm:min-h-[4.25rem] sm:text-[22px]",
              STICKER.base,
            )}
          >
            شوف العوالم واختر
          </Link>
          <Link
            href="/how-to-play"
            className="text-base font-bold text-brand-navy underline decoration-2 underline-offset-4 hover:text-brand-bronze"
          >
            كيف تلعب أكوان؟
          </Link>
        </div>
      </section>
    </div>
  );
}
