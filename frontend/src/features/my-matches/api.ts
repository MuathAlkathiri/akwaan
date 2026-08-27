import apiClient from "@/lib/api/client";
import type { MyMatchesPage } from "./types";

export async function getMyMatches(page = 1): Promise<MyMatchesPage> {
  const response = await apiClient.get<MyMatchesPage>("/matches/mine", {
    params: { page, limit: 10 },
  });
  return response.data;
}
