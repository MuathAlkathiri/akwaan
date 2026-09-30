import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import {
  localizeMatchError,
  matchErrorMessage,
} from "@/features/live-game-session/match/errors/match-errors";

/**
 * The anonymous fallback is a diagnostic, not a message.
 *
 * «ما ضبط. تأكد من الحالة وجرّب مرة ثانية.» is what a host sees whenever the
 * server refuses with a code nobody mapped. القنبلة had no mapped code at all,
 * so a real lifecycle defect — a session turn left open by the previous
 * challenge — spent weeks presenting as a random "try again". These tests exist
 * so the next Bomb refusal says what it is.
 */

const FALLBACK = "ما ضبط. تأكد من الحالة وجرّب مرة ثانية.";

const refusal = (code: string) => {
  const error = new AxiosError("Request failed with status code 400");
  error.response = {
    data: { code, message: "backend detail" },
    status: 400,
    statusText: "Bad Request",
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return error;
};

/** Every code a host can actually meet when launching القنبلة from the board. */
const BOMB_LAUNCH_CODES = [
  "BOMB_REQUIRES_TEN_TO_FIFTEEN_ITEMS",
  "BOMB_ITEMS_NOT_DISTINCT",
  "BOMB_RUNTIME_NOT_CREATED",
  "BOMB_LAUNCH_FORBIDDEN",
  "BOMB_SLOT_INVALID",
  "BOMB_CONTENT_INVALID",
  "BOMB_REQUIRES_TWO_TEAMS",
  "BOMB_REPRESENTATIVE_REQUIRED",
  "ACTIVE_CLOCK_CANNOT_BE_REALLOCATED",
] as const;

describe("a القنبلة launch refusal", () => {
  it.each(BOMB_LAUNCH_CODES)("says something specific for %s", (code) => {
    const message = matchErrorMessage(code);
    expect(message).toBeTruthy();
    expect(message).not.toBe(FALLBACK);
  });

  /**
   * The code that carried the sequential-launch bug. It should be unreachable
   * in ordinary play now that board return releases the turn, which is exactly
   * why the message has to explain itself if it ever shows up again.
   */
  it("explains a turn left open by an earlier challenge", () => {
    const { code, message, rawMessage } = localizeMatchError(
      refusal("ACTIVE_CLOCK_CANNOT_BE_REALLOCATED"),
    );
    expect(code).toBe("ACTIVE_CLOCK_CANNOT_BE_REALLOCATED");
    expect(message).not.toBe(FALLBACK);
    expect(message).toContain("دور");
    // The server's own wording is kept for whoever is reading logs.
    expect(rawMessage).toBe("backend detail");
  });

  it("still falls back for a code nobody has mapped", () => {
    expect(localizeMatchError(refusal("SOME_UNMAPPED_CODE")).message).toBe(
      FALLBACK,
    );
  });
});
