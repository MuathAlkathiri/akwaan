import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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

export default function WorldsIndexPage() {
  return (
    <div className="relative pb-16 pt-10 lg:pt-14">
      <section className="relative z-10 mx-auto w-full max-w-3xl px-4 sm:px-6">
        <h1 className="text-center text-3xl font-black leading-[1.25] text-[hsl(var(--brand-navy))] sm:text-4xl">
          عوالم أكوان
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-loose text-[hsl(var(--brand-navy)/.72)] sm:text-lg">
          أكوان مو قائمة تصنيفات تختار منها سؤال. «العالم» هو الموضوع الكبير
          اللي تلعبون داخله — كرة قدم، أنمي، فيديو قيمز، ألغاز وغيرها — وكل
          عالم يجي معه أسلوب لعب يميّزه، لا مجرد أسئلة بلون ثاني. تختارون 3
          عوالم في كل مباراة، والترتيب اللي تختارونه هو ترتيب اللعب.
        </p>

        <div className="mt-12 space-y-12">
          <article aria-labelledby="worlds-what-title">
            <h2
              id="worlds-what-title"
              className="text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl"
            >
              وش يعني «عالم» في أكوان؟
            </h2>
            <div className="mt-4 space-y-4 text-base leading-loose text-[hsl(var(--brand-navy)/.72)]">
              <p>
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
          </article>

          <article aria-labelledby="worlds-changes-title">
            <h2
              id="worlds-changes-title"
              className="text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl"
            >
              وش يتغيّر لما يتغيّر العالم؟
            </h2>
            <ul className="mt-5 list-none space-y-4">
              {CHANGES.map(({ title, copy }) => (
                <li
                  key={title}
                  className="rounded-3xl border border-[hsl(var(--brand-navy)/.1)] bg-white/80 p-5 shadow-[0_10px_30px_rgba(24,16,54,.05)]"
                >
                  <h3 className="text-base font-black text-[hsl(var(--brand-navy))]">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-[hsl(var(--brand-navy)/.66)] sm:text-base">
                    {copy}
                  </p>
                </li>
              ))}
            </ul>
          </article>

          <article aria-labelledby="worlds-constant-title">
            <h2
              id="worlds-constant-title"
              className="text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl"
            >
              ووش ما يتغيّر؟
            </h2>
            <p className="mt-4 text-base leading-loose text-[hsl(var(--brand-navy)/.72)]">
              هيكل المباراة ثابت، عشان ما تحتاجون تتعلمون اللعبة من جديد كل
              مرة:
            </p>
            <ul className="mt-4 list-none space-y-3">
              {CONSTANTS.map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-3 text-sm leading-7 text-[hsl(var(--brand-navy)/.7)] sm:text-base"
                >
                  <span
                    aria-hidden
                    className="mt-2.5 size-1.5 shrink-0 rotate-45 bg-[hsl(var(--brand-gold))]"
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </article>

          <article aria-labelledby="worlds-choose-title">
            <h2
              id="worlds-choose-title"
              className="text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl"
            >
              كيف تختارون عوالمكم؟
            </h2>
            <div className="mt-4 space-y-4 text-base leading-loose text-[hsl(var(--brand-navy)/.72)]">
              <p>
                من الصفحة الرئيسية تختارون 3 عوالم، وبعد كل عالم تختارون 4
                مجالات منه. نصيحة من التجربة: نوّعوا بين عالم يعرفه فريقكم
                زين وعالم محايد بينكم وبين خصومكم — المباراة اللي كل عوالمها
                في اتجاه واحد تصير متوقعة.
              </p>
              <p>
                قائمة العوالم المتاحة تكبر، وفيه عوالم تحت التجهيز تشوفونها في
                الرئيسية تحت «عوالم جديدة في الطريق». المتاح الآن والجديد
                يظهران هناك أول بأول، فالرئيسية هي المرجع لوش تقدرون تلعبونه
                اليوم.
              </p>
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
              <Button
                asChild
                size="lg"
                className="akwaan-primary-action rounded-full border border-[hsl(var(--brand-gold)/.32)] bg-[hsl(var(--brand-navy))] px-9 py-6 text-base font-black text-white shadow-[0_16px_34px_-18px_hsl(var(--brand-navy)/.8)] hover:border-[hsl(var(--brand-gold)/.72)] hover:bg-[hsl(var(--brand-navy)/.96)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold))] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              >
                <Link href="/#worlds">شوف العوالم واختر</Link>
              </Button>
              <Link
                href="/how-to-play"
                className="text-base font-black text-[hsl(var(--brand-navy))] underline decoration-[hsl(var(--brand-gold))] decoration-2 underline-offset-4"
              >
                كيف تلعب أكوان؟
              </Link>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
