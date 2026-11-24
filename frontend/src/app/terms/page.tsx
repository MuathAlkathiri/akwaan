import type { Metadata } from "next";
import { LegalSection, LegalShell } from "@/components/akwaan/legal-shell";
import { SUPPORT_EMAIL } from "@/lib/support";

const SECTIONS = [
  "الخدمة ومقدمها",
  "الشراء والدفع",
  "الاستخدام المقبول",
  "الملكية الفكرية",
  "توافر الخدمة والمسؤولية",
  "القانون والتغييرات",
] as const;

export const metadata: Metadata = {
  title: "شروط الاستخدام",
  description:
    "شروط استخدام لعبة أكوان الرقمية، بما في ذلك الدفع والاستخدام المقبول.",
};

export default function TermsPage() {
  return (
    <LegalShell
      current="terms"
      title="شروط الاستخدام"
      sections={SECTIONS}
    >
        <LegalSection index={0} title="الخدمة ومقدمها">
          <p>
            أكوان لعبة جماعية رقمية تُلعب على شاشة مشتركة باستخدام هواتف
            اللاعبين. يتاح الوصول إلى الجلسة الرقمية فور الشراء، ولا تُشحن أي
            منتجات مادية.
          </p>
          <p>
            تُقدّم خدمة أكوان من عبدالمجيد بدر تيسير الفيصل، بموجب وثيقة العمل
            الحر رقم FL-926195063 الصادرة من وزارة الموارد البشرية والتنمية
            الاجتماعية. للتواصل:{" "}
            <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </LegalSection>
        <LegalSection index={1} title="الشراء والدفع">
          <p>
            تُعرض الأسعار بالريال السعودي. يشتري المستخدم حق الوصول إلى جلسة لعب
            رقمية وفق السعر المعروض عند إتمام الدفع. تسري{" "}
            <a className="underline" href="/refund">
              سياسة الاسترجاع
            </a>{" "}
            على هذا الشراء.
          </p>
        </LegalSection>
        <LegalSection index={2} title="الاستخدام المقبول">
          <p>
            يُحظر إساءة معاملة اللاعبين الآخرين، أو محاولة تعطيل الخدمة أو
            اختبار ثغراتها أو الوصول إليها بغير تصريح، أو إعادة بيع حق الوصول
            إليها.
          </p>
        </LegalSection>
        <LegalSection index={3} title="الملكية الفكرية">
          <p>
            تعود حقوق الأسئلة والألغاز والرسومات واسم أكوان إلى أكوان. لا يمنح
            شراء الجلسة حق نسخ هذه المواد أو توزيعها.
          </p>
        </LegalSection>
        <LegalSection index={4} title="توافر الخدمة والمسؤولية">
          <p>
            تُقدم الخدمة بحالتها المتاحة. قد تحدث انقطاعات أو أعطال تقنية. إذا
            تعذّر لعب جلسة مدفوعة بسبب خلل من جانب أكوان، يجوز طلب استرجاع
            المبلغ وفق سياسة الاسترجاع.
          </p>
        </LegalSection>
        <LegalSection index={5} title="القانون والتغييرات">
          <p>
            تخضع هذه الشروط لأنظمة المملكة العربية السعودية. قد تُعدّل الشروط من
            وقت لآخر، ويُعد استمرار استخدام الخدمة بعد نشر التعديل قبولًا للشروط
            المعدّلة.
          </p>
        </LegalSection>
      </LegalShell>
  );
}
