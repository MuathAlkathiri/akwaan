import { redirect } from "next/navigation";
import { MATCH_SETUP_ROUTE } from "@/features/match-setup";

/**
 * The former entry point, which created a session first and then asked for Worlds
 * inside the Match. Setup now happens entirely before the Match exists, so this
 * path forwards to the wizard rather than lingering as a second way in.
 */
export default function LegacyMatchWorldsEntry() {
  redirect(MATCH_SETUP_ROUTE);
}
