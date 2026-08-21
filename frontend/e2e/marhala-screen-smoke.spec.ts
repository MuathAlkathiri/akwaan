import { execFileSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * The shared screen of a *live* race, in the shipped bundle.
 *
 * The race is created through the product's own APIs, the page is the real host
 * screen at :3001 talking to the real backend, and the turn that moves a token is
 * played by an actual phone over the websocket from a child process — so what is
 * asserted here is the board a room would be looking at, not a render fixture.
 */

const EMAIL = process.env.SMOKE_EMAIL ?? "marhala-smoke@local.invalid";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "SmokePass!42";
const API = process.env.SMOKE_API ?? "http://localhost:3002";
const WORLD = process.env.SMOKE_WORLD_ID ?? "";
const SCOPES = (process.env.SMOKE_SCOPES ?? "").split(",").filter(Boolean);
const SCRATCH = process.env.SMOKE_SCRATCH ?? "/tmp";

test("@game the shared screen shows a live المرحلة board and replays a real turn", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const request = page.request;
  const login = await request.post(`${API}/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  const session = await login.json();
  const auth = { Authorization: `Bearer ${session.accessToken}` };
  const unwrap = async (response: import("@playwright/test").APIResponse) => {
    const body = await response.json();
    return body?.data ?? body;
  };

  /* a real session, two real phones, a real Match, a real launch */
  const created = await unwrap(
    await request.post(`${API}/live-game-sessions`, {
      headers: auth,
      data: { modeKey: "core-timed-turns", modeVersion: 1, teamNames: ["ألفا", "بيتا"] },
    }),
  );
  const sessionId = created.snapshot.sessionId as string;
  const teams = created.snapshot.teams as Array<{ id: string; name: string }>;
  const access = await unwrap(
    await request.post(`${API}/live-game-sessions/${sessionId}/join-access`, {
      headers: auth,
      data: { assignmentPolicy: "explicit" },
    }),
  );
  const phones = [];
  for (const [index, team] of teams.entries()) {
    const joined = await unwrap(
      await request.post(`${API}/live-game-session-join/${access.joinCode}`, {
        data: { displayName: `لاعب ${index + 1}`, requestedTeamId: team.id, joinRequestId: crypto.randomUUID() },
      }),
    );
    phones.push({ teamId: team.id, credential: joined.credential, participantId: joined.participantId });
  }
  const revision = async () => {
    const body = await (await request.get(`${API}/live-game-sessions/${sessionId}`, { headers: auth })).json();
    return (body?.data ?? body).revision as number;
  };
  writeFileSync(`${SCRATCH}/screen-session.json`, JSON.stringify({ sessionId, phones }));
  // Real phones stay connected for the whole challenge, so a long-lived child
  // holds both sockets — a phone-required mechanic re-checks presence at launch.
  const holder = spawn("node", [`${SCRATCH}/hold-phones.mjs`], {
    env: { ...process.env, SESSION_FILE: `${SCRATCH}/screen-session.json`, SMOKE_TOKEN_FILE: `${SCRATCH}/token.txt` },
  });
  await new Promise<void>((resolve, reject) => {
    holder.stdout.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("PHONES_CONNECTED")) resolve();
    });
    holder.on("exit", (code) => reject(new Error(`phone holder exited ${code}`)));
    setTimeout(() => reject(new Error("phones did not connect")), 30_000);
  });

  // Ready only once the sockets are up: presence is what readiness attaches to.
  for (const phone of phones) {
    const response = await request.post(`${API}/live-game-participants/${phone.participantId}/ready`, {
      headers: { Authorization: `Bearer ${phone.credential}` },
      data: { commandId: crypto.randomUUID(), expectedRevision: await revision() },
    });
    if (!response.ok()) throw new Error(`participant ready -> ${response.status()} ${await response.text()}`);
  }
  await request.post(`${API}/live-game-sessions/${sessionId}/ready`, {
    headers: auth, data: { commandId: crypto.randomUUID(), expectedRevision: await revision() },
  });
  const started = await request.post(`${API}/live-game-sessions/${sessionId}/start`, {
    headers: auth, data: { commandId: crypto.randomUUID(), expectedRevision: await revision() },
  });
  if (!started.ok()) throw new Error(`start -> ${started.status()} ${await started.text()}`);
  const unified = await request.post(`${API}/live-game-sessions/${sessionId}/match/unified`, {
    headers: auth,
    data: { occurrences: [0, 1, 2].map((occurrenceIndex) => ({ occurrenceIndex, worldId: WORLD, selectedScopeIds: SCOPES })) },
  });
  if (!unified.ok()) throw new Error(`unified match -> ${unified.status()} ${await unified.text()}`);
  const matchRevision = async () => {
    const body = await (await request.get(`${API}/live-game-sessions/${sessionId}/match`, { headers: auth })).json();
    return (body?.data ?? body).match.revision as number;
  };
  for (const step of ["prepare", "launch"]) {
    const response = await request.post(`${API}/live-game-sessions/${sessionId}/match/unified/challenges/${step}`, {
      headers: auth,
      data: { commandId: crypto.randomUUID(), expectedMatchRevision: await matchRevision(), occurrenceIndex: 0, slotKey: "slot_4" },
    });
    if (!response.ok()) throw new Error(`${step} -> ${response.status()} ${await response.text()}`);
  }

  /* the host screen, as a room sees it */
  await page.addInitScript(
    ([token, user]) => {
      window.localStorage.setItem("akwaan_access_token", token as string);
      window.localStorage.setItem("akwaan_user", JSON.stringify(user));
    },
    [session.accessToken, session.user],
  );
  await page.goto(`/live-sessions/${sessionId}/screen`);

  const board = page.getByTestId("marhala-board");
  await expect(board).toBeVisible({ timeout: 30_000 });
  // Sixteen tiles, and no seventeenth.
  await expect(page.getByTestId(/^marhala-tile-\d+$/)).toHaveCount(16);
  await expect(page.getByTestId("marhala-tile-17")).toHaveCount(0);
  // Both tokens, on the opening tile.
  const tile1 = page.getByTestId("marhala-tile-1");
  await expect(tile1.getByTestId(/^marhala-token-/)).toHaveCount(2);
  // Tile identities and the legend that explains them.
  await expect(page.getByTestId("marhala-tile-3")).toHaveAttribute("data-tile-kind", "boost");
  await expect(page.getByTestId("marhala-tile-4")).toHaveAttribute("data-tile-kind", "trap");
  await expect(page.getByTestId("marhala-tile-16")).toHaveAttribute("data-tile-kind", "finish");
  await expect(page.getByTestId("marhala-board-legend")).toContainText("قفزة");
  // The decision the mechanic is built on, with real landing previews.
  const decision = page.getByTestId("marhala-decision");
  await expect(decision).toBeVisible();
  // All three bands are always listed; which of them the server still has content
  // for is its call, and a spent band says so rather than disappearing. This owner
  // has already played several races, so صعب may legitimately be exhausted here.
  const availability: Record<string, string | null> = {};
  for (const band of ["easy", "medium", "hard"]) {
    const card = page.getByTestId(`marhala-band-${band}`);
    await expect(card).toBeVisible();
    availability[band] = await card.getAttribute("data-band-available");
    if (availability[band] === "false") {
      await expect(page.getByTestId(`marhala-band-${band}-spent`)).toContainText("لا أسئلة جديدة");
    }
  }
  console.log("server availability on screen:", JSON.stringify(availability));
  expect(Object.values(availability)).toContain("true");
  console.log("decision panel:", (await decision.textContent())?.replace(/\s+/g, " ").trim().slice(0, 220));

  /* a real phone plays a hard turn while this page is open */
  const output = execFileSync("node", [`${SCRATCH}/phone-turn.mjs`], {
    env: { ...process.env, SESSION_FILE: `${SCRATCH}/screen-session.json`, SMOKE_TOKEN_FILE: `${SCRATCH}/token.txt`, BAND: "hard", THINK_MS: "3500" },
    encoding: "utf8",
  });
  console.log(output.trim().split("\n").slice(-2).join("\n"));

  // The token left tile 1 for the tile the server's roll bought it.
  await expect
    .poll(async () => tile1.getByTestId(/^marhala-token-/).count(), { timeout: 30_000 })
    .toBeLessThan(2);
  const occupied: number[] = [];
  for (let position = 1; position <= 16; position += 1) {
    if ((await page.getByTestId(`marhala-tile-${position}`).getByTestId(/^marhala-token-/).count()) > 0) {
      occupied.push(position);
    }
  }
  console.log("tokens now on tiles:", occupied.join(", "));
  expect(occupied.length).toBeGreaterThan(0);
  expect(Math.max(...occupied)).toBeLessThanOrEqual(16);
  // The board is still the screen, and the last turn is narrated in Arabic.
  await expect(board).toBeVisible();
  const narration = page.getByTestId("marhala-last-turn");
  if (await narration.count()) {
    console.log("last turn line:", (await narration.textContent())?.trim());
  }
  const bodyText = (await page.locator("body").textContent()) ?? "";
  for (const leak of ["marhalaDifficulty", "endedBy", "winnerTeamId", "question-pending"]) {
    expect(bodyText).not.toContain(leak);
  }
  holder.kill("SIGTERM");
});
