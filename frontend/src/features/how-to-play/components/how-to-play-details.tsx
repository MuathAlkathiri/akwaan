import Link from "next/link";

/**
 * The written half of «كيف تلعب».
 *
 * The journey above it shows the room and the four moves in pictures; this is
 * the part a first-time visitor — or a search engine — can actually read. It
 * answers the questions in the order someone new asks them: what do we need,
 * how do we get in, what happens then, and who gets the point.
 *
 * It paints the same cards the journey screens use and adds no new design
 * language: one column of plain sections on the shell's own canvas.
 */

const NEEDS = [
  {
    title: "شاشة يشوفها الجميع",
    copy: "تلفزيون، شاشة عرض، أو لابتوب تحطونه في وسط الجلسة. هذي الشاشة هي لوحة المباراة: منها تتابعون التحدي الحالي والنقاط والنتيجة.",
  },
  {
    title: "جوال لكل لاعب",
    copy: "الجوال هو أداة اللاعب الخاصة. منه يجاوب ويقرر، وما أحد في الغرفة يشوف وش اختار إلا بعد الكشف.",
  },
  {
    title: "متصفح وإنترنت",
    copy: "أكوان لعبة ويب، ما فيه تطبيق تحمّله. أي جوال فيه متصفح حديث يكفي، وتفتحون اللعبة من نفس الرابط.",
  },
  {
    title: "حساب واحد يكفي",
    copy: "اللاعب اللي يفتح المباراة يحتاج حساب في أكوان. بقية اللاعبين ينضمون باسمهم وشخصيتهم فقط، بدون تسجيل ولا كلمة سر.",
  },
] as const;

const STRUCTURE = [
  {
    title: "3 عوالم",
    copy: "تختارون 3 عوالم للمباراة، والترتيب اللي تختارونه هو ترتيب اللعب نفسه.",
  },
  {
    title: "4 مجالات داخل كل عالم",
    copy: "بعد ما تختارون العالم، تختارون 4 مجالات منه. المجالات هي اللي تحدد نوع المحتوى اللي يجيكم.",
  },
  {
    title: "12 تحدي في المباراة",
    copy: "كل عالم يجيب 4 تحديات، يعني 12 تحدي في المباراة الواحدة، وداخل كل تحدي 3 جولات.",
  },
  {
    title: "الترتيب على النظام",
    copy: "ما تختارون التحديات بنفسكم — أكوان هو اللي يركّب اللوحة ويغيّر ترتيب العرض من مباراة لمباراة.",
  },
] as const;

export function HowToPlayDetails() {
  return (
    <section
      aria-labelledby="how-to-play-details-title"
      className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-4 sm:px-6"
    >
      <h2
        id="how-to-play-details-title"
        className="text-center text-2xl font-black text-[hsl(var(--brand-navy))] sm:text-3xl"
      >
        من الصفر إلى أول نقطة
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-loose text-[hsl(var(--brand-navy)/.7)] sm:text-lg">
        أكوان لعبة جماعية تلعبونها وأنتم في نفس الجلسة: شاشة وحدة قدامكم، وكل
        لاعب يمسك جواله. فكرة اللعبة إن المعرفة وحدها ما تكفي — تحتاج تقرأ
        خصمك، وتعرف العالم اللي اخترتوه.
      </p>

      <div className="mt-12 space-y-12">
        <article aria-labelledby="needs-title">
          <h3
            id="needs-title"
            className="text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl"
          >
            وش تحتاجون قبل ما تبدأون؟
          </h3>
          <ul className="mt-5 grid list-none gap-4 sm:grid-cols-2">
            {NEEDS.map(({ title, copy }) => (
              <li
                key={title}
                className="rounded-3xl border border-[hsl(var(--brand-navy)/.1)] bg-white/80 p-5 shadow-[0_10px_30px_rgba(24,16,54,.05)]"
              >
                <h4 className="text-base font-black text-[hsl(var(--brand-navy))]">
                  {title}
                </h4>
                <p className="mt-2 text-sm leading-7 text-[hsl(var(--brand-navy)/.66)]">
                  {copy}
                </p>
              </li>
            ))}
          </ul>
        </article>

        <article aria-labelledby="join-title">
          <h3
            id="join-title"
            className="text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl"
          >
            كيف ينضم اللاعبون؟
          </h3>
          <div className="mt-4 space-y-4 text-base leading-loose text-[hsl(var(--brand-navy)/.72)]">
            <p>
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
        </article>

        <article aria-labelledby="structure-title">
          <h3
            id="structure-title"
            className="text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl"
          >
            كيف تتكوّن المباراة؟
          </h3>
          <ol className="mt-5 list-none space-y-4">
            {STRUCTURE.map(({ title, copy }, index) => (
              <li key={title} className="flex items-start gap-4">
                <span
                  aria-hidden
                  className="akwaan-numeral mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-[hsl(var(--brand-gold)/.45)] bg-[hsl(var(--brand-gold)/.12)] text-sm font-black text-[hsl(var(--brand-navy))]"
                >
                  {index + 1}
                </span>
                <div>
                  <h4 className="text-base font-black text-[hsl(var(--brand-navy))]">
                    {title}
                  </h4>
                  <p className="mt-1 text-sm leading-7 text-[hsl(var(--brand-navy)/.66)] sm:text-base">
                    {copy}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-base leading-loose text-[hsl(var(--brand-navy)/.72)]">
            المباراة الكاملة تأخذ منكم حوالي 40 إلى 45 دقيقة مع النقاش
            والضحك، وتنتهي بشاشة نتيجة تبيّن الفريق الفايز.
          </p>
        </article>

        <article aria-labelledby="challenges-title">
          <h3
            id="challenges-title"
            className="text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl"
          >
            التحديات اللي تلعبونها
          </h3>
          <p className="mt-4 text-base leading-loose text-[hsl(var(--brand-navy)/.72)]">
            3 تحديات مشتركة تلقونها في كل العوالم، ويضاف لها تحدي خاص يميّز كل
            عالم عن الثاني:
          </p>
          <dl className="mt-5 space-y-4">
            <div className="rounded-3xl border border-[hsl(var(--brand-navy)/.1)] bg-white/80 p-5">
              <dt className="text-base font-black text-[hsl(var(--brand-navy))]">
                اقرأ خصمك
              </dt>
              <dd className="mt-2 text-sm leading-7 text-[hsl(var(--brand-navy)/.66)]">
                فريق يجاوب بسرية، والفريق الثاني — في نفس الوقت — يقرر: يثق
                فيهم، أو يراهن إنهم غلطوا ويسرق. الكشف يصير مرة وحدة: الإجابة
                وقرار الخصم معًا.
              </dd>
            </div>
            <div className="rounded-3xl border border-[hsl(var(--brand-navy)/.1)] bg-white/80 p-5">
              <dt className="text-base font-black text-[hsl(var(--brand-navy))]">
                مين أقرب
              </dt>
              <dd className="mt-2 text-sm leading-7 text-[hsl(var(--brand-navy)/.66)]">
                السؤال جوابه رقم، وكل فريق يقدّر تقديره بسرية. بعد ما يقفل
                التقديران، نقيس مين أقرب للرقم الصحيح.
              </dd>
            </div>
            <div className="rounded-3xl border border-[hsl(var(--brand-navy)/.1)] bg-white/80 p-5">
              <dt className="text-base font-black text-[hsl(var(--brand-navy))]">
                القنبلة
              </dt>
              <dd className="mt-2 text-sm leading-7 text-[hsl(var(--brand-navy)/.66)]">
                مواجهة 1 ضد 1: لاعب من كل فريق — والفريق هو اللي يقرر مين
                يطلع. الإجابة الصحيحة ترمي الضغط على الخصم، والساعة ما ترجع من
                جديد مع كل إجابة.
              </dd>
            </div>
            <div className="rounded-3xl border border-[hsl(var(--brand-gold)/.35)] bg-[hsl(var(--brand-gold)/.08)] p-5">
              <dt className="text-base font-black text-[hsl(var(--brand-navy))]">
                التحدي الخاص بكل عالم
              </dt>
              <dd className="mt-2 text-sm leading-7 text-[hsl(var(--brand-navy)/.66)]">
                كل عالم يملك تحدي ما تلقاه في غيره — مثل «أفضل 5» في عالم كرة
                القدم، و«الكومبو» في الأنمي، و«المرحلة» في فيديو قيمز،
                و«ركّبها» في عالم الألغاز. تفاصيل أكثر في{" "}
                <Link
                  href="/worlds"
                  className="font-black text-[hsl(var(--brand-navy))] underline decoration-[hsl(var(--brand-gold))] decoration-2 underline-offset-4"
                >
                  صفحة العوالم
                </Link>
                .
              </dd>
            </div>
          </dl>
        </article>

        <article aria-labelledby="scoring-title">
          <h3
            id="scoring-title"
            className="text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl"
          >
            كيف تُحسب النقاط؟
          </h3>
          <div className="mt-4 space-y-4 text-base leading-loose text-[hsl(var(--brand-navy)/.72)]">
            <p>
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
        </article>

        <article aria-labelledby="repeat-title">
          <h3
            id="repeat-title"
            className="text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl"
          >
            ولا سؤال يتكرر عليك
          </h3>
          <p className="mt-4 text-base leading-loose text-[hsl(var(--brand-navy)/.72)]">
            أي محتوى لعبته في تحدي معيّن ما يرجع لك في نفس التحدي مرة ثانية على
            نفس الحساب. يعني المباراة الجديدة تجيب لكم شيء جديد، لا إعادة لنفس
            الأسئلة. عندك سؤال ثاني؟ جوابه موجود في{" "}
            <Link
              href="/faq"
              className="font-black text-[hsl(var(--brand-navy))] underline decoration-[hsl(var(--brand-gold))] decoration-2 underline-offset-4"
            >
              الأسئلة الشائعة
            </Link>
            .
          </p>
        </article>
      </div>
    </section>
  );
}
