import Link from "next/link";
import {
  ArrowLeftRight,
  Bomb,
  Eye,
  Globe,
  Monitor,
  QrCode,
  Smartphone,
  Sparkles,
  Target,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionTag, STICKER } from "@/components/akwaan/sticker";

/**
 * The written half of «كيف تلعب».
 *
 * The steps above show the four moves in pictures; this is the part a
 * first-time visitor — or a search engine — can actually read. It answers the
 * questions in the order someone new asks them: what do we need, how do we get
 * in, what happens then, and who gets the point.
 *
 * The copy is the live page's copy, unchanged. Only the shapes are new.
 */

const NEEDS: { Icon: LucideIcon; title: string; copy: string }[] = [
  {
    Icon: Monitor,
    title: "شاشة يشوفها الجميع",
    copy: "تلفزيون، شاشة عرض، أو لابتوب تحطونه في وسط الجلسة. هذي الشاشة هي لوحة المباراة: منها تتابعون التحدي الحالي والنقاط والنتيجة.",
  },
  {
    Icon: Smartphone,
    title: "جوال لكل لاعب",
    copy: "الجوال هو أداة اللاعب الخاصة. منه يجاوب ويقرر، وما أحد في الغرفة يشوف وش اختار إلا بعد الكشف.",
  },
  {
    Icon: Globe,
    title: "متصفح وإنترنت",
    copy: "أكوان لعبة ويب، ما فيه تطبيق تحمّله. أي جوال فيه متصفح حديث يكفي، وتفتحون اللعبة من نفس الرابط.",
  },
  {
    Icon: User,
    title: "حساب واحد يكفي",
    copy: "اللاعب اللي يفتح المباراة يحتاج حساب في أكوان. بقية اللاعبين ينضمون باسمهم وشخصيتهم فقط، بدون تسجيل ولا كلمة سر.",
  },
];

const STRUCTURE = [
  {
    figure: "3",
    title: "عوالم",
    copy: "تختارون 3 عوالم للمباراة، والترتيب اللي تختارونه هو ترتيب اللعب نفسه.",
  },
  {
    figure: "4",
    title: "مجالات داخل كل عالم",
    copy: "بعد ما تختارون العالم، تختارون 4 مجالات منه. المجالات هي اللي تحدد نوع المحتوى اللي يجيكم.",
  },
  {
    figure: "12",
    title: "تحدي في المباراة",
    copy: "كل عالم يجيب 4 تحديات، يعني 12 تحدي في المباراة الواحدة، وداخل كل تحدي 3 جولات.",
  },
] as const;

const CHALLENGES: {
  Icon: LucideIcon;
  title: string;
  copy: string;
  surface: string;
}[] = [
  {
    Icon: Eye,
    title: "اقرأ خصمك",
    copy: "فريق يجاوب بسرية، والفريق الثاني — في نفس الوقت — يقرر: يثق فيهم، أو يراهن إنهم غلطوا ويسرق. الكشف يصير مرة وحدة: الإجابة وقرار الخصم معًا.",
    surface: "bg-[hsl(var(--brand-purple))] text-white",
  },
  {
    Icon: Target,
    title: "مين أقرب",
    copy: "السؤال جوابه رقم، وكل فريق يقدّر تقديره بسرية. بعد ما يقفل التقديران، نقيس مين أقرب للرقم الصحيح.",
    surface: "bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]",
  },
  {
    Icon: Bomb,
    title: "القنبلة",
    copy: "مواجهة 1 ضد 1: لاعب من كل فريق — والفريق هو اللي يقرر مين يطلع. الإجابة الصحيحة ترمي الضغط على الخصم، والساعة ما ترجع من جديد مع كل إجابة.",
    surface: "bg-white text-[hsl(var(--brand-navy))]",
  },
];

const TAG = "min-h-[60px] self-center px-[26px] text-[22px] sm:text-[30px]";
const CARD = cn("rounded-[20px] p-6", STICKER.base);
const LINK =
  "font-bold text-[hsl(var(--brand-navy))] underline decoration-2 underline-offset-4 hover:text-brand-bronze";

function ChallengeCard({
  Icon,
  title,
  surface,
  children,
}: {
  Icon: LucideIcon;
  title: string;
  surface: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-[18px] rounded-[22px] p-5 sm:p-[26px]",
        "border-[3px] border-[hsl(var(--brand-navy))] shadow-[7px_8px_0_hsl(var(--brand-navy))]",
        surface,
      )}
    >
      <span
        aria-hidden
        className="grid size-16 shrink-0 place-items-center rounded-full bg-[hsl(var(--brand-navy))]"
      >
        <Icon className="size-8 text-[hsl(var(--brand-gold))]" strokeWidth={2} />
      </span>
      <div className="flex flex-col gap-2">
        <dt className="font-display text-[21px] font-extrabold sm:text-2xl">
          {title}
        </dt>
        <dd className="m-0 text-base leading-[1.85]">{children}</dd>
      </div>
    </div>
  );
}

export function HowToPlayDetails() {
  return (
    <>
      <section aria-labelledby="needs-title" className="flex flex-col gap-[30px]">
        <SectionTag tone="white" tilt={1} className={TAG}>
          <h2 id="needs-title">وش تحتاجون قبل ما تبدأون؟</h2>
        </SectionTag>
        <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {NEEDS.map(({ Icon, title, copy }) => (
            <li key={title} className={cn(CARD, "flex flex-col gap-2.5 bg-brand-paper")}>
              <span
                aria-hidden
                className="grid size-14 shrink-0 place-items-center rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-brand-lavender"
              >
                <Icon className="size-7 text-[hsl(var(--brand-navy))]" strokeWidth={2} />
              </span>
              <h3 className="font-display text-[21px] font-extrabold text-[hsl(var(--brand-navy))]">
                {title}
              </h3>
              <p className="text-base leading-[1.85] text-brand-slate">{copy}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="join-title" className="flex flex-col gap-[30px]">
        <SectionTag tone="purple" tilt={-1.5} className={TAG}>
          <h2 id="join-title">كيف ينضم اللاعبون؟</h2>
        </SectionTag>
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-10 gap-y-8 rounded-3xl bg-brand-lavender p-6 sm:p-8",
            STICKER.base,
          )}
        >
          <div className="flex flex-[1_1_420px] flex-col gap-4 text-base leading-[1.85] text-brand-slate sm:text-[17px]">
            <p className="text-[hsl(var(--brand-navy))]">
              المضيف يفتح المباراة على الشاشة المشتركة، وتظهر غرفة انتظار فيها
              رمز QR. كل لاعب يمسح الرمز بكاميرا جواله، يكتب اسمه، يختار شخصيته
              وفريقه، ويطلع اسمه على الشاشة مباشرة قدام الجميع.
            </p>
            <p>
              المسح مرة وحدة بس لكل مباراة. بعدها جوال اللاعب يبقى مربوط طول
              الوقت، ولو سكّر الصفحة بالغلط أو انقطع عنه النت، يرجع لنفس فريقه
              ونفس اللحظة من غير ما يمسح الرمز من جديد.
            </p>
            <p>
              أكوان تلعب بفريقين، والمضيف هو اللي يحدد سعة كل فريق وعدد
              اللاعبين وقت ما يفتح الانضمام — فتنفع للجلسة الصغيرة ولجلسة
              الأهل الكبيرة.
            </p>
          </div>
          {/* A drawing of a code, never a real one: there is no Match to join
              from this page. */}
          <div
            aria-hidden
            className="mx-auto flex size-[200px] shrink-0 -rotate-3 flex-col items-center justify-center gap-2.5 rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] bg-white shadow-[5px_6px_0_hsl(var(--brand-navy))]"
          >
            <QrCode className="size-24 text-[hsl(var(--brand-navy))]" strokeWidth={1.8} />
            <span className="text-sm font-bold text-[hsl(var(--brand-navy))]">
              امسحوا الرمز للانضمام
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="structure-title" className="flex flex-col gap-[30px]">
        <SectionTag tone="gold" tilt={1.5} className={TAG}>
          <h2 id="structure-title">كيف تتكوّن المباراة؟</h2>
        </SectionTag>
        <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {STRUCTURE.map(({ figure, title, copy }, index) => (
            <li
              key={title}
              className={cn(
                CARD,
                "flex flex-col gap-2.5",
                index % 2 === 0 ? "bg-[hsl(var(--brand-gold))]" : "bg-white",
              )}
            >
              <h3 className="flex items-baseline gap-3 text-[hsl(var(--brand-navy))]">
                <span className="text-[64px] font-bold leading-none">{figure}</span>
                <span className="font-display text-[21px] font-extrabold">
                  {title}
                </span>
              </h3>
              <p
                className={cn(
                  "text-base leading-[1.85]",
                  index % 2 === 0 ? "text-[hsl(var(--brand-navy))]" : "text-brand-slate",
                )}
              >
                {copy}
              </p>
            </li>
          ))}
          <li className={cn(CARD, "flex flex-col gap-2.5 bg-brand-paper")}>
            <ArrowLeftRight
              aria-hidden
              className="size-14 text-[hsl(var(--brand-navy))]"
              strokeWidth={1.9}
            />
            <h3 className="font-display text-[21px] font-extrabold text-[hsl(var(--brand-navy))]">
              الترتيب على النظام
            </h3>
            <p className="text-base leading-[1.85] text-brand-slate">
              ما تختارون التحديات بنفسكم — أكوان هو اللي يركّب اللوحة ويغيّر
              ترتيب العرض من مباراة لمباراة.
            </p>
          </li>
        </ul>
        <p className="max-w-[760px] self-center text-center text-[17px] leading-[1.9] text-[hsl(var(--brand-navy))] sm:text-lg">
          المباراة الكاملة تأخذ منكم حوالي{" "}
          <b className="font-extrabold">40 إلى 45 دقيقة</b> مع النقاش والضحك،
          وتنتهي بشاشة نتيجة تبيّن الفريق الفايز.
        </p>
      </section>

      <section aria-labelledby="challenges-title" className="flex flex-col gap-[30px]">
        <SectionTag tone="purple" tilt={-1} className={TAG}>
          <h2 id="challenges-title">التحديات اللي تلعبونها</h2>
        </SectionTag>
        <p className="max-w-[720px] self-center text-center text-[17px] leading-[1.8] text-brand-slate sm:text-lg">
          3 تحديات مشتركة تلقونها في كل العوالم، ويضاف لها تحدي خاص يميّز كل
          عالم عن الثاني:
        </p>
        <dl className="m-0 grid gap-7 lg:grid-cols-2">
          {CHALLENGES.map(({ copy, ...card }) => (
            <ChallengeCard key={card.title} {...card}>
              {copy}
            </ChallengeCard>
          ))}
          <ChallengeCard
            Icon={Sparkles}
            title="التحدي الخاص بكل عالم"
            surface="bg-brand-lavender text-[hsl(var(--brand-navy))]"
          >
            كل عالم يملك تحدي ما تلقاه في غيره — مثل «أفضل 5» في عالم كرة
            القدم، و«الكومبو» في الأنمي، و«المرحلة» في فيديو قيمز، و«ركّبها» في
            عالم الألغاز. تفاصيل أكثر في{" "}
            <Link href="/worlds" className={LINK}>
              صفحة العوالم
            </Link>
            .
          </ChallengeCard>
        </dl>
      </section>

      <section aria-labelledby="scoring-title" className="flex flex-col gap-[30px]">
        <SectionTag tone="white" tilt={1.5} className={TAG}>
          <h2 id="scoring-title">كيف تُحسب النقاط؟</h2>
        </SectionTag>
        <div className="flex flex-col gap-4 rounded-3xl border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper px-6 py-7 text-base leading-[1.85] text-brand-slate shadow-[6px_7px_0_hsl(var(--brand-gold))] sm:px-9 sm:py-8 sm:text-[17px]">
          <p className="text-[hsl(var(--brand-navy))]">
            ما فيه حكم ولا شخص يوقف عن اللعب عشان يصحّح. كل إجابة تتحسب
            تلقائيًا، وما أحد يشوف إجابة غيره قبل الكشف — عشان كذا ما تحتاجون
            تتفقون على شيء ولا تتناقشون في النتيجة.
          </p>
          <p>
            في «اقرأ خصمك» النقطة معلّقة بقراءتك لخصمك مثل ما هي معلّقة
            بالإجابة: لو قرأته صح تكسب نقطة، ولو قرأته غلط تخسر نقطة. وإذا
            وثقت فيهم وطلعوا صح فعلًا، الفريق المجاوب يأخذ نقطته كذلك.
          </p>
          <p>
            في بقية التحديات، النقطة تروح للفريق اللي ينجح في الجولة، وفيه
            نقطة إضافية للفريق اللي يكمل جولات التحدي الثلاث كلها — هذي
            النقطة الإضافية ما تنطبق على «اقرأ خصمك»، لأن حسابه أصلًا معلّق
            بقرار الخصم.
          </p>
          <p>
            المجموع المعروض على الشاشة ما ينزل تحت 0، وبعد آخر تحدي تطلع
            شاشة النتيجة بمجموع الفريقين.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="repeat-title"
        className={cn(
          "flex flex-col gap-2.5 rounded-3xl bg-[hsl(var(--brand-gold))] px-6 py-7 sm:px-8",
          STICKER.base,
        )}
      >
        <h2
          id="repeat-title"
          className="font-display text-[22px] font-extrabold text-[hsl(var(--brand-navy))] sm:text-[26px]"
        >
          ولا سؤال يتكرر عليك
        </h2>
        <p className="text-base leading-[1.85] text-[hsl(var(--brand-navy))] sm:text-[17px]">
          أي محتوى لعبته في تحدي معيّن ما يرجع لك في نفس التحدي مرة ثانية على
          نفس الحساب. يعني المباراة الجديدة تجيب لكم شيء جديد، لا إعادة لنفس
          الأسئلة. عندك سؤال ثاني؟ جوابه موجود في{" "}
          <Link href="/faq" className={LINK}>
            الأسئلة الشائعة
          </Link>
          .
        </p>
      </section>
    </>
  );
}
