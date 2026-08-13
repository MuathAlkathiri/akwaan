import { MatchSetupWizard } from "@/features/match-setup";

/**
 * Pre-match setup. Deliberately takes no sessionId: nothing exists on the server
 * until the host confirms the whole configuration on the last step.
 */
export default async function MatchSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ worldId?: string }>;
}) {
  const { worldId } = await searchParams;
  return <MatchSetupWizard initialWorldId={worldId} />;
}
