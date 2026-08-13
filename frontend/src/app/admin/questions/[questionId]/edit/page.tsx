"use client";

import { useParams } from "next/navigation";
import { QuestionAuthoringPage } from "@/features/questions/components/question-authoring-page";

export default function EditQuestionPage() {
  const { questionId } = useParams<{ questionId: string }>();
  return <QuestionAuthoringPage questionId={questionId} />;
}
