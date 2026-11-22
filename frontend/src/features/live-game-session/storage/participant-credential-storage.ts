import type { ParticipantCredential } from "../model";

const prefix = "akwaan.live-participant.";
// Pre-Akwaan prefix, read once so a participant mid-match keeps their
// credential across the rename instead of being bounced to re-join.
const legacyPrefix = "lammah.live-participant.";

function key(joinCode: string): string {
  return `${prefix}${joinCode.trim().toUpperCase()}`;
}

function legacyKey(joinCode: string): string {
  return `${legacyPrefix}${joinCode.trim().toUpperCase()}`;
}

/**
 * Where a player's proof of who they are survives between page loads.
 *
 * This is `localStorage`, and the distinction is the whole point. It was
 * `sessionStorage` until 2026-11-22, which the browser empties the moment the
 * tab closes — so a player who closed their tab lost the credential, could not
 * use the reconnect endpoint, and fell back to joining by name, where the
 * roster still held their name and refused them. They were locked out of their
 * own match. A phone that rings or an app switch never did this; only closing
 * the tab, opening a new one, or private browsing.
 *
 * `sessionStorage` would be the right choice if two people shared one device,
 * since it keeps each tab's identity apart. They do not: every player has their
 * own phone, which is what makes the longer-lived store safe here.
 *
 * Reads fall back to the old locations and migrate what they find, so nobody
 * mid-match is bounced by this change itself.
 */
const readThrough = [
  (joinCode: string) => window.localStorage.getItem(key(joinCode)),
  (joinCode: string) => window.sessionStorage.getItem(key(joinCode)),
  (joinCode: string) => window.localStorage.getItem(legacyKey(joinCode)),
  (joinCode: string) => window.sessionStorage.getItem(legacyKey(joinCode)),
] as const;

function forget(joinCode: string): void {
  window.localStorage.removeItem(key(joinCode));
  window.localStorage.removeItem(legacyKey(joinCode));
  window.sessionStorage.removeItem(key(joinCode));
  window.sessionStorage.removeItem(legacyKey(joinCode));
}

export const participantCredentialStorage = {
  get(joinCode: string): ParticipantCredential | undefined {
    if (typeof window === "undefined") return undefined;

    let value: string | null = null;
    let foundAt = 0;
    for (; foundAt < readThrough.length; foundAt += 1) {
      value = readThrough[foundAt](joinCode);
      if (value !== null) break;
    }
    if (value === null) return undefined;

    try {
      const parsed = JSON.parse(value) as ParticipantCredential;
      if (Date.parse(parsed.credentialExpiresAt) <= Date.now()) {
        forget(joinCode);
        return undefined;
      }
      // Anything found anywhere but the canonical place is moved there, and the
      // old copy dropped, so the migration happens once per player per device.
      if (foundAt > 0) {
        forget(joinCode);
        window.localStorage.setItem(key(joinCode), value);
      }
      return parsed;
    } catch {
      forget(joinCode);
      return undefined;
    }
  },
  set(joinCode: string, value: ParticipantCredential): void {
    window.localStorage.setItem(key(joinCode), JSON.stringify(value));
  },
  remove(joinCode: string): void {
    forget(joinCode);
  },
};
