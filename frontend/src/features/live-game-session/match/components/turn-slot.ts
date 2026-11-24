"use client";

import { createContext, useContext } from "react";

/**
 * Where the board's turn sticker goes when a Match shell is around it.
 *
 * The sentence «دور الفريق الأول، اختاروا تحديكم» belongs to the board — only
 * the board knows whether choosing is open — and the swap-turn button belongs
 * to the shell, which owns the host's controls. The design puts them side by
 * side, so the shell lends the board a place in its own row. With no shell
 * (a test, the shared screen on its own) the board simply draws the sticker
 * where it stands.
 */
export const TurnSlotContext = createContext<HTMLElement | null>(null);

export const useTurnSlot = () => useContext(TurnSlotContext);
