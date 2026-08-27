"use client";

import { useEffect, useState } from "react";

/**
 * Presentation-only: become visible only once `active` has held for `delayMs`.
 *
 * This is how a loader avoids the flash of a 50ms request — the loading UI is not
 * mounted until the wait is genuinely long enough to be worth showing. It carries
 * no gameplay meaning and drives no authoritative state: it is purely when a
 * spinner or branded loader is allowed to appear. A wait that resolves before the
 * delay never shows anything.
 */
export function useDelayedVisible(active: boolean, delayMs = 350): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);
  return visible;
}
