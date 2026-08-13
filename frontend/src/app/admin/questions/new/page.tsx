import { QuestionAuthoringPage } from "@/features/questions/components/question-authoring-page";

export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<{ worldId?: string; challengeTypeId?: string }>;
}) {
  const params = await searchParams;

  return (
    <QuestionAuthoringPage
      initialWorldId={params.worldId}
      initialChallengeTypeId={params.challengeTypeId}
    />
  );
}
