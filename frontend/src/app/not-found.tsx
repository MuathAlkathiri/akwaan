import Link from "next/link";
import { STATE_ACTION, StateCard } from "@/components/akwaan/state-card";

export default function NotFound() {
  return (
    <main className="flex min-h-[70dvh] items-center px-4 py-12">
      <StateCard
        data-testid="state-404"
        title="هالصفحة ضايعة في الفضاء"
        line="الرابط اللي فتحته ما يودّي لشي عندنا. ممكن انكتب غلط، أو الصفحة انشالت."
        actions={
          <>
            <Link href="/" className={STATE_ACTION.primary}>
              الرئيسية
            </Link>
            <Link href="/how-to-play" className={STATE_ACTION.secondary}>
              كيف تلعب
            </Link>
          </>
        }
      />
    </main>
  );
}
