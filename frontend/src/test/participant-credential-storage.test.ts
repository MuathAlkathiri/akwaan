import { beforeEach, describe, expect, it } from "vitest";
import { participantCredentialStorage } from "@/features/live-game-session/storage/participant-credential-storage";

/**
 * Where a player's identity survives.
 *
 * It moved from `sessionStorage` to `localStorage` on 2026-11-22, because the
 * browser empties `sessionStorage` when the tab closes — and a player whose
 * credential vanished could not reconnect, fell back to joining by name, and
 * was refused because the roster still held it. They were locked out of a match
 * they were still in.
 *
 * The read-through matters as much as the move: a player mid-match when this
 * ships must not be bounced by the change itself.
 */
describe("participant credential storage", () => {
  const joinCode = "ab12cd";
  const key = "akwaan.live-participant.AB12CD";
  const legacyKey = "lammah.live-participant.AB12CD";
  const credential = {
    participantId: "participant-1",
    token: "token-1",
    credentialExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("survives a closed tab", () => {
    participantCredentialStorage.set(joinCode, credential as never);
    // What closing the tab does, and nothing more.
    window.sessionStorage.clear();

    expect(participantCredentialStorage.get(joinCode)?.participantId).toBe(
      "participant-1",
    );
  });

  it("still finds a credential left in the old place, and moves it", () => {
    window.sessionStorage.setItem(key, JSON.stringify(credential));

    expect(participantCredentialStorage.get(joinCode)?.participantId).toBe(
      "participant-1",
    );
    expect(window.localStorage.getItem(key)).not.toBeNull();
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it("still finds one left under the pre-Akwaan name", () => {
    window.sessionStorage.setItem(legacyKey, JSON.stringify(credential));

    expect(participantCredentialStorage.get(joinCode)?.participantId).toBe(
      "participant-1",
    );
    expect(window.localStorage.getItem(key)).not.toBeNull();
  });

  it("drops an expired credential wherever it was found", () => {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        ...credential,
        credentialExpiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    );

    expect(participantCredentialStorage.get(joinCode)).toBeUndefined();
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("clears every location on remove", () => {
    participantCredentialStorage.set(joinCode, credential as never);
    window.sessionStorage.setItem(legacyKey, JSON.stringify(credential));

    participantCredentialStorage.remove(joinCode);

    expect(participantCredentialStorage.get(joinCode)).toBeUndefined();
  });
});
