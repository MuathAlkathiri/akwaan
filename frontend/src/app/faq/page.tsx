import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "الأسئلة الشائعة",
  description:
    "أجوبة سريعة عن أكوان: كم لاعب تحتاج اللعبة، هل كل واحد يحتاج حساب، هل تشتغل على أي جوال، وش يصير لو انقطع أحد، وكم تطول المباراة.",
};

/**
 * The questions a first-time visitor actually asks, in their own words.
 *
 * One array feeds both the page and its `FAQPage` structured data, so a search
 * engine and a reader can never be told two different things. The cost answer
 * follows `claude/akwaan-pricing-launch-decisions.md` and names no date for
 * when buying opens, because that waits on a condition, not a calendar.
 */
const FAQ = [
  {
    question: "كم لاعب تحتاج أكوان؟",
    answer:
      "أكوان تلعب بفريقين، وكل لاعب يحتاج جواله. ما فيه عدد ثابت مفروض عليكم: المضيف هو اللي يحدد سعة الفريق وعدد اللاعبين وقت ما يفتح الانضمام، فتنفع لجلسة صغيرة بين شخصين أو ثلاثة من كل جهة، وتنفع لجلسة أهل أكبر. اللي ما يلعب جولة يبقى في فريقه ويتابع على الشاشة، لأن المباراة بين الفريقين لا بين الأفراد.",
  },
  {
    question: "لازم كل لاعب يسوي حساب؟",
    answer:
      "لا. حساب واحد يكفي: اللاعب اللي يفتح المباراة (المضيف) يحتاج حساب في أكوان، وبقية اللاعبين ينضمون بمسح رمز QR من الشاشة، يكتبون أسماءهم، يختارون شخصياتهم، وخلاص — بدون تسجيل ولا كلمة سر ولا بريد.",
  },
  {
    question: "تحتاج أحمّل تطبيق؟",
    answer:
      "لا. أكوان لعبة ويب كاملة: الشاشة المشتركة تفتحها من متصفح التلفزيون أو اللابتوب، وجوال كل لاعب يفتح رابط الانضمام من متصفحه. ما فيه تطبيق في متجر، وما فيه شيء تنزّله.",
  },
  {
    question: "تشتغل على أي جوال؟",
    answer:
      "أي جوال فيه متصفح حديث واتصال إنترنت يقدر يلعب — أندرويد أو آيفون، ما يفرق. الجوال في أكوان مو نسخة ثانية من اللعبة، هو شاشة إدخال خاصة باللاعب: يستلم دوره، يدخل إجابته، ويظهر له الكشف. الشاشة المشتركة تحتاج شاشة أكبر يشوفها الجميع، مثل تلفزيون أو لابتوب أو بروجكتر.",
  },
  {
    question: "وش يصير لو انقطع اتصال أحد اللاعبين؟",
    answer:
      "ما تنتهي المباراة ولا يحتاج يمسح الرمز من جديد. جواله يحاول يرجع للاتصال تلقائيًا، والسيرفر يرجّعه لنفس فريقه ونفس لحظة اللعب اللي وقفت عندها المباراة. نفس الشيء لو سكّر الصفحة بالغلط أو رجع للخلف أو أعاد تشغيل المتصفح. حالة اللعب كلها محفوظة عند السيرفر، لا على الجوال، فما فيه شيء يضيع بسبب جوال واحد.",
  },
  {
    question: "كم تطول المباراة؟",
    answer:
      "المباراة الكاملة — 3 عوالم و12 تحدي — تأخذ حوالي 40 إلى 45 دقيقة مع النقاش والضحك بين الجولات. ما فيه جولة تطوّل بلا نهاية: كل تحدي له وقته، والانتقال بين التحديات يصير تلقائيًا.",
  },
  {
    question: "مين يحكم على الإجابات؟",
    answer:
      "ولا أحد. هذي أصل فكرة أكوان: ما فيه لاعب يوقف عن اللعب عشان يقرأ الأسئلة ويصحّح. الإجابات تُحسب تلقائيًا، والإجابة اللي ما يفترض أحد يشوفها ما توصل جواله أصلًا قبل وقت الكشف — فما فيه مجال لنقاش على النتيجة.",
  },
  {
    question: "نختار التحديات اللي نلعبها؟",
    answer:
      "تختارون العوالم والمجالات، وأكوان يركّب التحديات. 3 عوالم، و4 مجالات داخل كل عالم، وبعدها لوحة كل عالم جاهزة: 3 تحديات مشتركة في كل العوالم زائد تحدي خاص بالعالم نفسه. ترتيب عرض التحديات يتغيّر من مباراة لمباراة، فالإيقاع ما يصير محفوظ.",
  },
  {
    question: "الأسئلة تتكرر إذا لعبنا مرة ثانية؟",
    answer:
      "المحتوى اللي لعبته في تحدي معيّن ما يرجع لك في نفس التحدي مرة ثانية على نفس الحساب. فالمباراة الجديدة تجيب محتوى جديد، وفتح حساب ثاني ما يفيد في شيء لأن الحساب نفسه هو اللي يُحسب عليه.",
  },
  {
    question: "كم تكلفة أكوان؟",
    answer:
      "أول شهر ببلاش: من 1 ديسمبر 2026 لين 1 يناير 2027 كل حساب له 3 مباريات مجانية كل أسبوع، تتجدد يوم الخميس. وأول مباراة لأي حساب جديد مجانية دايمًا. بعدها الباقات تبدأ من 35 ريال لـ3 مباريات، بدون اشتراك ولا تجديد تلقائي. اللي يحتاج مباريات هو المضيف بس، وباقي اللاعبين ينضمون بدون أي رسوم.",
  },
  {
    question: "متى تنطلق أكوان؟",
    answer:
      "الانطلاق الرسمي يوم 1 ديسمبر 2026 على playakwaan.com.",
  },
] as const;

export default function FaqPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  const link =
    "font-bold text-brand-navy underline decoration-2 underline-offset-4 hover:text-brand-bronze";

  return (
    <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 pb-20 pt-8 sm:px-8 sm:pt-12">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <h1 className="font-display text-[36px] font-black leading-[1.3] text-brand-navy sm:text-[56px]">
        الأسئلة <span className="text-brand-purple">الشائعة</span>
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-[1.9] text-brand-slate sm:text-lg">
        كل اللي يسأل عنه أي أحد قبل أول مباراة، بأقصر جواب ممكن. وإذا تبغى
        الشرح الكامل من الصفر، فيه صفحة{" "}
        <Link href="/how-to-play" className={link}>
          كيف تلعب
        </Link>
        .
      </p>

      <div className="mt-10 flex flex-col items-start gap-8 lg:flex-row">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
          {FAQ.map(({ question, answer }, index) => (
            // Native disclosure: it opens with a keyboard, a screen reader
            // announces its state, and it needs no script to work.
            <details
              key={question}
              open={index === 0}
              className="group rounded-[20px] border-[3px] border-brand-navy bg-brand-paper open:bg-brand-lavender open:shadow-[6px_7px_0_hsl(var(--brand-navy))]"
            >
              <summary className="flex min-h-[4.25rem] cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-display text-lg font-extrabold text-brand-navy sm:px-6 sm:text-xl [&::-webkit-details-marker]:hidden">
                {question}
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full border-[3px] border-brand-navy bg-white text-xl font-bold leading-none group-open:bg-brand-gold"
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <p className="px-5 pb-6 text-base leading-[1.95] text-brand-navy sm:px-6 sm:text-[17px]">
                {answer}
              </p>
            </details>
          ))}
        </div>

        <aside className="w-full shrink-0 rounded-3xl border-[3px] border-brand-navy bg-brand-navy p-6 text-white shadow-[6px_7px_0_hsl(var(--brand-gold))] lg:sticky lg:top-28 lg:w-[320px]">
          <h2 className="font-display text-2xl font-extrabold">باقي سؤال؟</h2>
          <p className="mt-2 text-base leading-[1.8] text-white/85">
            راسلنا ونرد عليك.
          </p>
          <a
            href="mailto:support@playakwaan.com"
            dir="ltr"
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full border-[3px] border-brand-navy bg-brand-gold px-4 text-[15px] font-bold text-brand-navy no-underline"
          >
            support@playakwaan.com
          </a>
          <p className="mt-4 text-[15px] leading-[1.8] text-white/85">
            وتبغى تعرف العوالم وتحدياتها؟ شوف{" "}
            <Link
              href="/worlds"
              className="font-bold text-brand-gold underline decoration-2 underline-offset-4"
            >
              صفحة العوالم
            </Link>
            .
          </p>
        </aside>
      </div>
    </div>
  );
}
