import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: "شروط الاستخدام | أكوان",
  description: "شروط استخدام لعبة أكوان الرقمية، بما في ذلك الدفع والاستخدام المقبول.",
};

export default function TermsPage() {
  return (
    <main className="relative mx-auto max-w-3xl px-4 py-12 text-right sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold text-[hsl(var(--brand-navy))]">شروط الاستخدام</h1>
      <div className="mt-8 space-y-8 leading-8 text-[hsl(var(--brand-navy)/.85)]">
        <section><h2 className="text-xl font-semibold">الخدمة ومقدمها</h2><p>أكوان لعبة جماعية رقمية تُلعب على شاشة مشتركة باستخدام هواتف اللاعبين. يتاح الوصول إلى الجلسة الرقمية فور الشراء، ولا تُشحن أي منتجات مادية.</p><p>تُقدم الخدمة باسم أكوان. {/* TODO: يزوّد المالك الاسم القانوني لمقدم الخدمة قبل النشر. */}للتواصل: <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p></section>
        <section><h2 className="text-xl font-semibold">الشراء والدفع</h2><p>تُعرض الأسعار بالريال السعودي. يشتري المستخدم حق الوصول إلى جلسة لعب رقمية وفق السعر المعروض عند إتمام الدفع. تسري <a className="underline" href="/refund">سياسة الاسترجاع</a> على هذا الشراء.</p></section>
        <section><h2 className="text-xl font-semibold">الاستخدام المقبول</h2><p>يُحظر إساءة معاملة اللاعبين الآخرين، أو محاولة تعطيل الخدمة أو اختبار ثغراتها أو الوصول إليها بغير تصريح، أو إعادة بيع حق الوصول إليها.</p></section>
        <section><h2 className="text-xl font-semibold">الملكية الفكرية</h2><p>تعود حقوق الأسئلة والألغاز والرسومات واسم أكوان إلى أكوان. لا يمنح شراء الجلسة حق نسخ هذه المواد أو توزيعها.</p></section>
        <section><h2 className="text-xl font-semibold">توافر الخدمة والمسؤولية</h2><p>تُقدم الخدمة بحالتها المتاحة. قد تحدث انقطاعات أو أعطال تقنية. إذا تعذّر لعب جلسة مدفوعة بسبب خلل من جانب أكوان، يجوز طلب استرجاع المبلغ وفق سياسة الاسترجاع.</p></section>
        <section><h2 className="text-xl font-semibold">القانون والتغييرات</h2><p>تخضع هذه الشروط لأنظمة المملكة العربية السعودية. قد تُعدّل الشروط من وقت لآخر، ويُعد استمرار استخدام الخدمة بعد نشر التعديل قبولًا للشروط المعدّلة.</p></section>
      </div>
    </main>
  );
}
