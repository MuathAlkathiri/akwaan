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
 * engine and a reader can never be told two different things. Anything the
 * product has not settled — pricing in particular — is answered honestly as
 * unannounced rather than guessed at.
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
      "تفاصيل الأسعار ما انعلنت بعد، وما نحب نعطيكم رقم قبل ما يستقر. الانطلاق الرسمي يوم 1 ديسمبر 2026، وتفاصيل الاشتراك تُنشر على الموقع قبلها.",
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

  return (
    <div className="mx-auto w-full max-w-3xl">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <h1 className="text-center text-3xl font-black leading-[1.3] text-[hsl(var(--brand-navy))] sm:text-4xl">
        الأسئلة الشائعة
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-loose text-[hsl(var(--brand-navy)/.72)] sm:text-lg">
        كل اللي يسأل عنه أي أحد قبل أول مباراة، بأقصر جواب ممكن. وإذا تبغى
        الشرح الكامل من الصفر، فيه صفحة{" "}
        <Link
          href="/how-to-play"
          className="font-black text-[hsl(var(--brand-navy))] underline decoration-[hsl(var(--brand-gold))] decoration-2 underline-offset-4"
        >
          كيف تلعب
        </Link>
        .
      </p>

      <dl className="mt-10 space-y-5">
        {FAQ.map(({ question, answer }) => (
          <div
            key={question}
            className="rounded-3xl border border-[hsl(var(--brand-navy)/.1)] bg-white/80 p-6 shadow-[0_10px_30px_rgba(24,16,54,.05)]"
          >
            <dt className="text-lg font-black text-[hsl(var(--brand-navy))]">
              {question}
            </dt>
            <dd className="mt-3 text-sm leading-8 text-[hsl(var(--brand-navy)/.7)] sm:text-base">
              {answer}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-10 text-center text-base leading-loose text-[hsl(var(--brand-navy)/.72)]">
        باقي سؤال؟ شوف{" "}
        <Link
          href="/worlds"
          className="font-black text-[hsl(var(--brand-navy))] underline decoration-[hsl(var(--brand-gold))] decoration-2 underline-offset-4"
        >
          صفحة العوالم
        </Link>{" "}
        أو راسلنا على{" "}
        <a
          href="mailto:support@playakwaan.com"
          className="font-black text-[hsl(var(--brand-navy))] underline decoration-[hsl(var(--brand-gold))] decoration-2 underline-offset-4"
        >
          support@playakwaan.com
        </a>
        .
      </p>
    </div>
  );
}
