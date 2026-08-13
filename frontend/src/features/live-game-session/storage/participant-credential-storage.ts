import type { ParticipantCredential } from "../model";

const prefix = "akwaan.live-participant.";
// Pre-Akwaan prefix, read once so a participant mid-match in an already-open tab
// keeps their credential across the rename instead of being bounced to re-join.
const legacyPrefix = "lammah.live-participant.";

function key(joinCode: string): string {
  return `${prefix}${joinCode.trim().toUpperCase()}`;
}

function legacyKey(joinCode: string): string {
  return `${legacyPrefix}${joinCode.trim().toUpperCase()}`;
}

export const participantCredentialStorage = {
  get(joinCode: string): ParticipantCredential | undefined {
    if (typeof window === "undefined") return undefined;
    let value = window.sessionStorage.getItem(key(joinCode));
    if (value === null) {
      value = window.sessionStorage.getItem(legacyKey(joinCode));
      if (value !== null) {
        window.sessionStorage.setItem(key(joinCode), value);
        window.sessionStorage.removeItem(legacyKey(joinCode));
      }
    }
    if (!value) return undefined;
    try {
      const parsed = JSON.parse(value) as ParticipantCredential;
      if (Date.parse(parsed.credentialExpiresAt) <= Date.now()) {
        window.sessionStorage.removeItem(key(joinCode));
        return undefined;
      }
      return parsed;
    } catch {
      window.sessionStorage.removeItem(key(joinCode));
      return undefined;
    }
  },
  set(joinCode: string, value: ParticipantCredential): void {
    window.sessionStorage.setItem(key(joinCode), JSON.stringify(value));
  },
  remove(joinCode: string): void {
    window.sessionStorage.removeItem(key(joinCode));
    window.sessionStorage.removeItem(legacyKey(joinCode));
  },
};
