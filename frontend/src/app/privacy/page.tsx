import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description: "توضح سياسة خصوصية أكوان البيانات المستخدمة في اللعب والدفع وحقوق طلب حذفها.",
};

export default function PrivacyPage() {
  return (
    <main className="relative mx-auto max-w-3xl px-4 py-12 text-right sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold text-[hsl(var(--brand-navy))]">سياسة الخصوصية</h1>
      <div className="mt-8 space-y-8 leading-8 text-[hsl(var(--brand-navy)/.85)]">
        <section><h2 className="text-xl font-semibold">البيانات التي نجمعها وأسباب استخدامها</h2><p>نجمع اسم العرض الذي يدخله اللاعب للانضمام إلى الجلسة، ونستخدمه لتمييزه أمام المشاركين. نجمع بيانات الجلسة واللعب لتشغيل المباراة وتسجيل تقدمها ونتائجها. ونجمع بيانات تقنية أساسية، مثل نوع الجهاز والمتصفح، لتشغيل الخدمة وتشخيص الأعطال.</p></section>
        <section><h2 className="text-xl font-semibold">بيانات الدفع</h2><p>لا تجمع أكوان بيانات البطاقات المصرفية ولا تخزنها مطلقًا. يتولى مزود الدفع المرخص معالجة الدفع بالكامل. قد نتلقى منه مرجع العملية وحالتها لإتمام الشراء ومعالجة طلبات الاسترجاع.</p></section>
        <section><h2 className="text-xl font-semibold">مشاركة البيانات</h2><p>تُشارك البيانات اللازمة لإتمام العملية مع مزود الدفع، وتُستخدم خدمات الاستضافة والبنية التحتية لتشغيل الخدمة وتخزين بياناتها. لا نبيع بيانات اللاعبين، ولا نشاركها لأغراض إعلانية.</p></section>
        <section><h2 className="text-xl font-semibold">الاحتفاظ والحذف</h2><p>نحتفظ ببيانات الجلسة واللعب والبيانات التقنية للمدة اللازمة لتشغيل الخدمة ومعالجة الأعطال والطلبات، وبسجلات الدفع للمدة التي تقتضيها الأنظمة المعمول بها. يمكن للاعب طلب حذف بياناته، مع مراعاة ما يلزم الاحتفاظ به نظامًا.</p></section>
        <section><h2 className="text-xl font-semibold">طلبات الخصوصية</h2><p>لطلب الوصول إلى البيانات أو حذفها، يُرجى مراسلتنا على <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. نتعامل مع البيانات الشخصية وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية.</p></section>
      </div>
    </main>
  );
}
