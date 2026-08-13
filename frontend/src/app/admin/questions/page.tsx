import { Suspense } from "react";
import { QuestionAdminScreen } from "@/features/questions";
export default function AdminQuestionsPage() {
  return (
    <Suspense fallback={null}>
      <QuestionAdminScreen />
    </Suspense>
  );
}
