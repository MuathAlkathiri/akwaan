import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: "سياسة الاسترجاع",
  description: "شروط استرجاع مدفوعات جلسات أكوان الرقمية وطريقة تقديم الطلب ومدته.",
};

export default function RefundPage() {
  return (
    <main className="relative mx-auto max-w-3xl px-4 py-12 text-right sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold text-[hsl(var(--brand-navy))]">سياسة الاسترجاع</h1>
      <div className="mt-8 space-y-8 leading-8 text-[hsl(var(--brand-navy)/.85)]">
        <section><h2 className="text-xl font-semibold">حالات استرجاع المبلغ كاملًا</h2><ul className="list-disc space-y-2 ps-6"><li>إذا تعذّر لعب جلسة مدفوعة بسبب خلل تقني من جانب أكوان.</li><li>إذا تكرر الخصم أو حدث خصم عن طريق الخطأ.</li><li>إذا لم تُستخدم عملية الشراء خلال 14 يومًا من تاريخها.</li></ul></section>
        <section><h2 className="text-xl font-semibold">بعد لعب الجلسة</h2><p>لا يُسترجع المبلغ بعد لعب الجلسة، لأن المحتوى الرقمي يكون قد قُدم واستُهلك عندئذ.</p></section>
        <section><h2 className="text-xl font-semibold">تقديم الطلب ومعالجته</h2><p>أرسل طلب الاسترجاع إلى <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> مع مرجع عملية الدفع. نرد على الطلب خلال 3 أيام عمل. يُعاد المبلغ الموافق على استرجاعه إلى وسيلة الدفع الأصلية، وقد يستغرق ظهوره حتى 14 يومًا بحسب البنك.</p></section>
      </div>
    </main>
  );
}
