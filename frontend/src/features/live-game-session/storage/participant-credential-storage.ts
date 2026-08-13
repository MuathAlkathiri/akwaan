import type { ParticipantCredential } from "../model";

const prefix = "lammah.live-participant.";

function key(joinCode: string): string {
  return `${prefix}${joinCode.trim().toUpperCase()}`;
}

export const participantCredentialStorage = {
  get(joinCode: string): ParticipantCredential | undefined {
    if (typeof window === "undefined") return undefined;
    const value = window.sessionStorage.getItem(key(joinCode));
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
  },
};
