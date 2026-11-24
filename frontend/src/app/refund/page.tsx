import type { Metadata } from "next";
import { LegalSection, LegalShell } from "@/components/akwaan/legal-shell";
import { SUPPORT_EMAIL } from "@/lib/support";

const SECTIONS = [
  "حالات استرجاع المبلغ كاملًا",
  "بعد لعب الجلسة",
  "تقديم الطلب ومعالجته",
] as const;

export const metadata: Metadata = {
  title: "سياسة الاسترجاع",
  description: "شروط استرجاع مدفوعات جلسات أكوان الرقمية وطريقة تقديم الطلب ومدته.",
};

export default function RefundPage() {
  return (
    <LegalShell
      current="refund"
      title="سياسة الاسترجاع"
      sections={SECTIONS}
    >
        <LegalSection index={0} title="حالات استرجاع المبلغ كاملًا"><ul className="list-disc space-y-2 ps-6"><li>إذا تعذّر لعب جلسة مدفوعة بسبب خلل تقني من جانب أكوان.</li><li>إذا تكرر الخصم أو حدث خصم عن طريق الخطأ.</li><li>إذا لم تُستخدم عملية الشراء خلال 14 يومًا من تاريخها.</li></ul></LegalSection>
        <LegalSection index={1} title="بعد لعب الجلسة"><p>لا يُسترجع المبلغ بعد لعب الجلسة، لأن المحتوى الرقمي يكون قد قُدم واستُهلك عندئذ.</p></LegalSection>
        <LegalSection index={2} title="تقديم الطلب ومعالجته"><p>أرسل طلب الاسترجاع إلى <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> مع مرجع عملية الدفع. نرد على الطلب خلال 3 أيام عمل. يُعاد المبلغ الموافق على استرجاعه إلى وسيلة الدفع الأصلية، وقد يستغرق ظهوره حتى 14 يومًا بحسب البنك.</p></LegalSection>
      </LegalShell>
  );
}
