"use client";
import { useEffect, useMemo, useState } from "react";

import type { World } from "../types";

// Keeps the selected World valid as the list loads or changes: picks the first
// World once data arrives, and re-selects a fallback if the current selection
// disappears.
export function useWorldSelection(worlds: World[]) {
  const [selectedWorldId, setSelectedWorldId] = useState<string>();

  useEffect(() => {
    if (!worlds.length) {
      if (selectedWorldId) setSelectedWorldId(undefined);
      return;
    }
    const stillExists = worlds.some((world) => world.id === selectedWorldId);
    if (!selectedWorldId || !stillExists) setSelectedWorldId(worlds[0].id);
  }, [worlds, selectedWorldId]);

  const selectedWorld = useMemo(
    () => worlds.find((world) => world.id === selectedWorldId),
    [worlds, selectedWorldId],
  );

  return { selectedWorldId, selectedWorld, selectWorld: setSelectedWorldId };
}
