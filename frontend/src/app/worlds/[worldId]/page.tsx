import { redirect } from "next/navigation";
import { matchSetupRouteForWorld } from "@/features/match-setup/routes";

export default async function WorldPage({
  params,
}: {
  params: Promise<{ worldId: string }>;
}) {
  const { worldId } = await params;
  redirect(matchSetupRouteForWorld(worldId));
}
