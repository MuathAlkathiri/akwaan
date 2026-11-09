/**
 * Queue navigation for the Candidate Review workspace.
 *
 * Pure helpers so the keyboard and Previous/Next behaviour can be tested
 * without rendering the workspace.
 */

/** URL search parameter that carries the selected candidate. */
export const CANDIDATE_URL_PARAM = "candidate";

export interface AdjacentCandidates {
  /** Index of the selection in the current queue, or -1 when it is not in it. */
  index: number;
  previousId?: string;
  nextId?: string;
}

/**
 * Previous and next candidates around the selection.
 *
 * A decision can move the selected candidate out of the filtered queue. When
 * that happens, `lastKnownIndex` is where it used to be: the candidate that slid
 * into that slot becomes "next", so reviewing never jumps back to the start.
 */
export function adjacentCandidates(
  queue: readonly string[],
  selectedId: string | undefined,
  lastKnownIndex = -1,
): AdjacentCandidates {
  const index = selectedId ? queue.indexOf(selectedId) : -1;
  if (index >= 0) {
    return {
      index,
      previousId: index > 0 ? queue[index - 1] : undefined,
      nextId: index < queue.length - 1 ? queue[index + 1] : undefined,
    };
  }
  if (!selectedId) {
    return { index: -1, nextId: queue[0] };
  }
  const anchor = Math.min(Math.max(lastKnownIndex, 0), queue.length);
  return {
    index: -1,
    previousId: anchor > 0 ? queue[anchor - 1] : undefined,
    nextId: queue[anchor],
  };
}

const NATIVE_CONTROLS = "input, textarea, select, button, a[href], summary";

const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "gridcell",
  "link",
  "listbox",
  "menu",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

/**
 * True when a J/K keystroke belongs to whatever has focus rather than to queue
 * navigation: anything the reviewer is typing in or operating, and anything
 * inside an open dialog.
 */
export function isShortcutBlockedTarget(target: EventTarget | null): boolean {
  if (!target || !(target as Element).closest) return false;
  const element = target as Element;
  if (element.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) {
    return true;
  }
  for (
    let node: Element | null = element;
    node && node !== node.ownerDocument?.body;
    node = node.parentElement
  ) {
    if (node.matches(NATIVE_CONTROLS)) return true;
    if ((node as HTMLElement).isContentEditable) return true;
    const editable = node.getAttribute("contenteditable");
    if (editable !== null && editable !== "false") return true;
    const role = node.getAttribute("role");
    if (role && INTERACTIVE_ROLES.has(role.toLowerCase())) return true;
  }
  return false;
}
