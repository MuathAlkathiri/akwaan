import { MatchSetupWizard } from "@/features/match-setup";

/**
 * Pre-match setup. Deliberately takes no sessionId: nothing exists on the server
 * until the host confirms the whole configuration on the last step.
 */
export default function MatchSetupPage() {
  return <MatchSetupWizard />;
}
