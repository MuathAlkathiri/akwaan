import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Top 5 and RYO, played end to end in real browsers against the Docker stack.
 *
 * What only a browser can prove: that the host reaches the challenge at all,
 * that exactly one phone of the acting team is offered the controls while its
 * teammate is read-only, that the rotation moves between a team's phones, that
 * the Match stops on a result screen instead of the board, that the ownership
 * reveal actually runs, and that a refresh mid-result comes back to the reveal.
 *
 * Four phones — two per team — because with one phone a side, "the assigned
 * participant" and "anyone on the team" look identical.
 *
 * Needs a stack whose `E2E_TOP5_WORLD` World is active, carries the canonical
 * `top-5` mechanic on a board position alongside a second phone-required
 * mechanic, and has ready content in four Scopes. `completeSetup` and the board
 * assertions fail loudly if that is not the case, rather than quietly exercising
 * whichever mechanic happens to be listed first.
 *
 *   E2E_BASE_URL=http://localhost:3001 npx playwright test e2e/top5-match.spec.ts
 */

/** The World whose board carries both Top 5 and Read Your Opponent. */
const TOP5_WORLD = process.env.E2E_TOP5_WORLD ?? "كرة قدم";
const HOST = process.env.E2E_HOST_EMAIL ?? "top5smoke@test.com";
const PASSWORD = process.env.E2E_HOST_PASSWORD ?? "Top5Smoke!42";

/**
 * Real Arabic names, including diacritics.
 *
 * "مُعاذ" carries a combining mark, which the old letters-and-numbers validation
 * rejected on both the phone and the server — a player was told their own name
 * was invalid. Using it here keeps that fixed in the browser, not just in a unit
 * test.
 */
const ARABIC_NAMES = ["مُعاذ", "عبدالله", "مُحَمَّد", "خالد"] as const;

/** Join order: two phones on team A, then two on team B. */
const TEAM_OF_PHONE = [0, 0, 1, 1] as const;

test.describe("@top5 the unified Match in a browser", () => {
  test.setTimeout(300_000);

  test("Top 5: ten cards, one decider each, then an authoritative result", async ({
    page,
    browser,
  }) => {
    const contexts: BrowserContext[] = [];
    const phones: Page[] = [];

    await login(page);
    await completeSetup(page);

    // ── 1. A Match containing the canonical top-5 position ───────────────────
    await expect(page.getByTestId("unified-board")).toBeVisible({
      timeout: 30_000,
    });
    const top5Tiles = page.locator('[data-challenge-key="top-5"]');
    await expect(
      top5Tiles.first(),
      "the created Match must contain a canonical top-5 board position",
    ).toBeVisible({ timeout: 30_000 });
    await expect(top5Tiles.first()).toHaveAttribute(
      "data-position-status",
      "available",
    );

    // ── 2. Two participants per team ─────────────────────────────────────────
    await top5Tiles.first().getByRole("button").first().click();
    const joinCode = (
      await page.getByTestId("preflight-join-code").innerText()
    ).trim();
    expect(joinCode).not.toBe("");
    for (const [index, team] of TEAM_OF_PHONE.entries()) {
      const context = await browser.newContext();
      contexts.push(context);
      const phone = await context.newPage();
      phones.push(phone);
      await joinPhone(phone, joinCode, ARABIC_NAMES[index], team);
    }

    // ── 3. Launch, but only once the server can see all four phones ──────────
    await waitForPairedPhones(page);
    const start = page.getByTestId("preflight-start");
    await expect(start).toBeEnabled({ timeout: 60_000 });
    await start.click();
    await expect(page.getByTestId("unified-challenge")).toBeVisible({
      timeout: 30_000,
    });

    // ── 4-8. Ten cards; one decider per card, everyone else read-only ────────
    const decidedBy: number[] = [];
    for (let card = 1; card <= 10; card += 1) {
      for (const phone of phones) {
        await expect(phone.getByTestId("top5-panel")).toBeVisible({
          timeout: 30_000,
        });
      }
      await expect(page.getByTestId("top5-card-counter")).toContainText(
        `${card} من 10`,
        { timeout: 30_000 },
      );

      // 4. Exactly one participant on the active team holds the decision.
      const decider = await waitForExactlyOne(
        phones,
        "top5-decider-controls",
        `card ${card}: exactly one phone must hold the decision`,
      );
      decidedBy.push(decider);

      // 5 + 6. The decider's teammate and both opponents are read-only, and the
      // teammate is told who decides.
      for (const [index, phone] of phones.entries()) {
        if (index === decider) continue;
        await expect(phone.getByTestId("top5-waiting")).toBeVisible();
        await expect(phone.getByTestId("top5-decider-controls")).toHaveCount(0);
      }
      const teammate = phones.findIndex(
        (_, index) =>
          index !== decider && TEAM_OF_PHONE[index] === TEAM_OF_PHONE[decider],
      );
      await expect(
        phones[teammate].getByTestId("top5-decider-name"),
      ).toBeVisible();

      // 8. Decide, then wait for the server to move the deck on.
      await phones[decider]
        .getByRole("button", {
          name: card % 2 === 0 ? "دسّها للخصم" : "احتفظ بها",
        })
        .click({ timeout: 30_000 });
      if (card < 10) {
        await expect(page.getByTestId("top5-card-counter")).toContainText(
          `${card + 1} من 10`,
          { timeout: 30_000 },
        );
      }
    }

    // 7. The rotation. Teams alternate, and inside a team its two phones take
    // turns. The starting position is randomised server side, so the pattern is
    // asserted rather than a fixed sequence of names.
    const teamSequence = decidedBy.map((index) => TEAM_OF_PHONE[index]);
    for (let card = 1; card < teamSequence.length; card += 1) {
      expect(
        teamSequence[card],
        `card ${card + 1} must be the other team's turn`,
      ).not.toBe(teamSequence[card - 1]);
    }
    for (const team of [0, 1] as const) {
      const forTeam = decidedBy.filter(
        (index) => TEAM_OF_PHONE[index] === team,
      );
      expect(forTeam).toHaveLength(5);
      // Both of that team's phones decided, alternating between them.
      expect(new Set(forTeam).size).toBe(2);
      for (let turn = 1; turn < forTeam.length; turn += 1) {
        expect(forTeam[turn]).not.toBe(forTeam[turn - 1]);
      }
    }

    // ── 9. The host enters CHALLENGE_RESULT, not BOARD ───────────────────────
    await expect(page.getByTestId("unified-challenge-result")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("unified-board")).toHaveCount(0);
    await expect(page.locator("[data-match-stage]")).toHaveAttribute(
      "data-match-stage",
      "challenge_result",
    );

    // ── 10. All ten entries start neutral, with no winner yet ────────────────
    const fields = page.locator('[data-testid^="top5-field-"]');
    await expect(fields).toHaveCount(10);
    const revealedAtFirstLook = await page
      .locator('[data-testid^="top5-field-"][data-revealed="true"]')
      .count();
    expect(
      revealedAtFirstLook,
      "ownership must not be revealed all at once",
    ).toBeLessThan(10);
    expect(await page.getByTestId("top5-winner").count()).toBe(0);

    // ── 11. Ownership reveals incrementally ─────────────────────────────────
    // Generously more samples than the reveal needs: ten fields at
    // TOP5_REVEAL_STEP_MS each, so the window has to outlast the whole walk.
    const observations: number[] = [revealedAtFirstLook];
    for (let sample = 0; sample < 60; sample += 1) {
      await page.waitForTimeout(400);
      observations.push(
        await page
          .locator('[data-testid^="top5-field-"][data-revealed="true"]')
          .count(),
      );
      if (observations.at(-1) === 10) break;
    }
    expect(observations.at(-1)).toBe(10);
    for (let step = 1; step < observations.length; step += 1) {
      expect(observations[step]).toBeGreaterThanOrEqual(observations[step - 1]);
    }
    // More than one intermediate count: it walked, it did not jump.
    expect(new Set(observations).size).toBeGreaterThan(2);

    // ── 12 + 13. Only the five real entries pay, and they total five ─────────
    await expect(page.getByTestId("top5-winner")).toBeVisible({
      timeout: 30_000,
    });
    // Five +1 badges across all ten fields: the five traps paid nothing.
    await expect(page.getByTestId("top5-point-badge")).toHaveCount(5);
    const counters = await page
      .locator('[data-testid^="top5-live-count-"]')
      .allInnerTexts();
    expect(counters).toHaveLength(2);
    expect(
      counters.reduce((sum, value) => sum + Number(value), 0),
      "the five real Top 5 entries must total five",
    ).toBe(5);
    expect(counters[0]).not.toBe(counters[1]);

    // ── 14. The winner receives exactly +1 Match point ───────────────────────
    const winner = page.getByTestId("top5-winner");
    await expect(winner).toContainText("+1 نقطة للمباراة");
    await expect(winner).toContainText(
      `${Math.max(...counters.map(Number))} من أفضل 5`,
    );

    // ── 14b. The Match scoreboard counts the win, not the 3-2 ────────────────
    // The whole point of Match scoring normalisation: whatever the mechanic's
    // internal counters read, one completed challenge moves the board by one.
    expect(
      await matchScores(page),
      "one completed challenge must read as 1-0, never as the mechanic's margin",
    ).toEqual([1, 0]);

    // ── 15. A refresh during the result restores it ──────────────────────────
    await page.reload();
    await expect(page.getByTestId("unified-challenge-result")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("[data-match-stage]")).toHaveAttribute(
      "data-match-stage",
      "challenge_result",
    );
    await expect(page.getByTestId("top5-winner")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("top5-point-badge")).toHaveCount(5);
    expect(
      await page.locator('[data-testid^="top5-live-count-"]').allInnerTexts(),
    ).toEqual(counters);
    // A reload re-imports nothing: the point was awarded once.
    expect(
      await matchScores(page),
      "a refresh must not award the challenge a second time",
    ).toEqual([1, 0]);

    // ── 17. Phones show result/waiting, not the board ────────────────────────
    for (const phone of phones) {
      const waiting = phone.getByTestId("participant-waiting");
      await expect(waiting).toBeVisible({ timeout: 30_000 });
      await expect(waiting).toHaveAttribute("data-showing-result", "true");
      await expect(waiting).toContainText("انتهى التحدي");
      await expect(waiting).toContainText("بانتظار التحدي القادم");
      await expect(phone.getByTestId("unified-board")).toHaveCount(0);
      // Same page it joined on: no redirect anywhere.
      expect(phone.url()).toContain(`/join/live-session/${joinCode}`);
    }

    // ── 16. Continue returns to the board ────────────────────────────────────
    await page.getByTestId("challenge-result-continue").click();
    await expect(page.getByTestId("unified-board")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.locator('[data-challenge-key="top-5"]').first(),
    ).toHaveAttribute("data-position-status", "completed");
    // Continuing past the result is not a second award either.
    expect(await matchScores(page)).toEqual([1, 0]);

    // ── 18. Another phone-required challenge, no reload on the phones ────────
    const loadCounts = phones.map((phone) => {
      const counter = { loads: 0 };
      phone.on("load", () => {
        counter.loads += 1;
      });
      return counter;
    });
    const ryoTile = page.locator('[data-challenge-key="read-your-opponent"]');
    await expect(ryoTile.first()).toBeVisible();
    await ryoTile.first().getByRole("button").first().click();
    await expect(page.getByTestId("preflight-start")).toBeVisible({
      timeout: 30_000,
    });
    for (const [index, phone] of phones.entries()) {
      // The same phones move themselves off result/waiting into the new
      // preflight, on the same page, without a navigation.
      await expect(phone.getByTestId("participant-waiting")).toHaveCount(0, {
        timeout: 30_000,
      });
      expect(phone.url()).toContain(`/join/live-session/${joinCode}`);
      expect(loadCounts[index].loads, "the phone must not reload").toBe(0);
    }

    for (const context of contexts) await context.close();
  });

  test("RYO: one authoritative answerer and one decision-maker per item", async ({
    page,
    browser,
  }) => {
    const contexts: BrowserContext[] = [];
    const phones: Page[] = [];

    await login(page);
    await completeSetup(page);
    await expect(page.getByTestId("unified-board")).toBeVisible({
      timeout: 30_000,
    });

    const ryoTiles = page.locator('[data-challenge-key="read-your-opponent"]');
    await expect(ryoTiles.first()).toBeVisible({ timeout: 30_000 });
    await ryoTiles.first().getByRole("button").first().click();

    const joinCode = (
      await page.getByTestId("preflight-join-code").innerText()
    ).trim();
    for (const [index, team] of TEAM_OF_PHONE.entries()) {
      const context = await browser.newContext();
      contexts.push(context);
      const phone = await context.newPage();
      phones.push(phone);
      await joinPhone(phone, joinCode, ARABIC_NAMES[index], team);
    }
    await waitForPairedPhones(page);
    const start = page.getByTestId("preflight-start");
    await expect(start).toBeEnabled({ timeout: 60_000 });
    await start.click();
    await expect(page.getByTestId("unified-challenge")).toBeVisible({
      timeout: 30_000,
    });

    const answerers: number[] = [];
    const deciders: number[] = [];
    for (let item = 1; item <= 3; item += 1) {
      // The server's own item counter, so the controls sampled below belong to
      // this item rather than to the one that has just resolved.
      await expect(page.getByText(`السؤال ${item} من 3`).first()).toBeVisible({
        timeout: 30_000,
      });

      // Exactly one answerer and exactly one Trust/Steal decision-maker, on
      // opposite teams — not one per *team*.
      const answerer = await waitForExactlyOne(
        phones,
        "ryo-answer-controls",
        `item ${item}: one authoritative answerer`,
      );
      const decider = await waitForExactlyOne(
        phones,
        "ryo-decision-controls",
        `item ${item}: one authoritative decision-maker`,
      );
      expect(TEAM_OF_PHONE[answerer]).not.toBe(TEAM_OF_PHONE[decider]);
      answerers.push(answerer);
      deciders.push(decider);

      // Their teammates are told who acts and offered nothing.
      for (const [index, phone] of phones.entries()) {
        if (index === answerer || index === decider) continue;
        await expect(phone.getByTestId("ryo-waiting")).toBeVisible();
        await expect(phone.getByTestId("ryo-answer-controls")).toHaveCount(0);
        await expect(phone.getByTestId("ryo-decision-controls")).toHaveCount(0);
      }

      // Blind and simultaneous: the answer alone resolves nothing, and the
      // decision-maker's controls are still there after it lands.
      await submitRyoAnswer(phones[answerer]);
      await expect(
        phones[decider].getByTestId("ryo-decision-controls"),
      ).toBeVisible();
      await phones[decider]
        .getByRole("button", { name: "أثق بإجابته" })
        .click({ timeout: 30_000 });
    }

    // The rotation moved on both sides: item 2 used each team's other phone and
    // item 3 came back round.
    expect(answerers[0]).not.toBe(answerers[1]);
    expect(answerers[0]).toBe(answerers[2]);
    expect(deciders[0]).not.toBe(deciders[1]);
    expect(deciders[0]).toBe(deciders[2]);
    expect(new Set([...answerers, ...deciders]).size).toBe(4);

    // RYO stops on its result too, with a readable three-item recap.
    await expect(page.getByTestId("unified-challenge-result")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("ryo-result-recap")).toBeVisible();
    await expect(page.locator('[data-testid^="ryo-result-item-"]')).toHaveCount(
      3,
    );
    await expect(page.getByTestId("ryo-result-winner")).toBeVisible();

    // The mechanic's own signed totals are still shown in full — three items of
    // Trust/Steal payoff, which is where a 2-1 board used to come from.
    await expect(page.getByTestId("ryo-mechanic-totals")).toBeVisible();
    // And the Match point is stated separately, as one point or none.
    const matchPoint = page.getByTestId("ryo-match-point");
    await expect(matchPoint).toBeVisible();
    const tied =
      (await page.getByTestId("ryo-result-winner").getAttribute("data-tie")) ===
      "true";
    await expect(matchPoint).toContainText(
      tied ? "لا نقطة مباراة" : "+1 نقطة للمباراة",
    );

    // However the payoff matrix swung, the board moved by at most one.
    const scores = await matchScores(page);
    expect(
      scores.reduce((sum, value) => sum + value, 0),
      "three signed payoff swings must still be worth one Match point",
    ).toBe(tied ? 0 : 1);
    expect(Math.max(...scores)).toBe(tied ? 0 : 1);

    await page.getByTestId("challenge-result-continue").click();
    await expect(page.getByTestId("unified-board")).toBeVisible({
      timeout: 30_000,
    });

    for (const context of contexts) await context.close();
  });
});

/**
 * The Match scoreboard in the shell header, highest first.
 *
 * Read from the shell rather than from any challenge surface: this is the number
 * a room actually reads as "the score", and it must be a count of challenge wins.
 */
async function matchScores(page: Page): Promise<number[]> {
  const numerals = page
    .getByTestId("team-scoreboard")
    .locator(".akwaan-numeral");
  await expect(numerals).toHaveCount(2, { timeout: 30_000 });
  const values = (await numerals.allInnerTexts()).map((text) =>
    Number(text.trim()),
  );
  return values.sort((left, right) => right - left);
}

/**
 * The one phone currently offered a given control, waited for rather than sampled.
 *
 * A phone re-renders when the server's snapshot arrives, so sampling right after
 * a decision can catch the previous card's state. Polling states the real
 * requirement — exactly one phone holds it, once things have settled — and
 * removes the race at the same time.
 */
async function waitForExactlyOne(
  phones: Page[],
  testId: string,
  message: string,
): Promise<number> {
  let holders: number[] = [];
  await expect
    .poll(
      async () => {
        holders = [];
        for (const [index, phone] of phones.entries()) {
          if (
            await phone
              .getByTestId(testId)
              .isVisible()
              .catch(() => false)
          ) {
            holders.push(index);
          }
        }
        return holders.length;
      },
      { message, timeout: 30_000, intervals: [250, 250, 500] },
    )
    .toBe(1);
  return holders[0];
}

/**
 * Waits until the host's preflight shows every phone connected, two per team.
 *
 * The mechanic builds its participant rotation from the players the server can
 * see *at launch*, and readiness only needs one phone a side — so launching the
 * moment the Start button lights up can leave a team with a one-player rotation
 * and nothing to rotate between. Two per team is the whole point of this test,
 * so it is waited for rather than assumed.
 */
async function waitForPairedPhones(page: Page): Promise<void> {
  const teams = page.locator('[data-testid^="preflight-team-"]');
  await expect(teams).toHaveCount(2, { timeout: 60_000 });
  for (const team of await teams.all()) {
    await expect(team.locator('[aria-label="متصل"]')).toHaveCount(2, {
      timeout: 60_000,
    });
  }
}

/**
 * Answers one RYO item from the assigned answerer's phone.
 *
 * The item may be multiple choice or a numeric estimate, and the two render
 * different controls: the estimate's submit button stays disabled until a number
 * is typed, so clicking blindly would wait forever.
 */
async function submitRyoAnswer(phone: Page): Promise<void> {
  const controls = phone.getByTestId("ryo-answer-controls");
  const estimate = controls.locator("input");
  if (await estimate.count()) {
    await estimate.fill("42");
    await controls.getByRole("button").first().click({ timeout: 30_000 });
    return;
  }
  await controls.getByRole("button").first().click({ timeout: 30_000 });
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(HOST);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

/**
 * Walks the setup wizard: three World occurrences, four Scopes each, then teams.
 *
 * The World is addressed as a *world card* (`aria-pressed` + `aria-label`) rather
 * than as any button whose text happens to contain that name, and the step is
 * only left once the wizard itself has moved on — clicking a card that never
 * registered is how this previously configured a World with no Top 5 on its board.
 */
async function completeSetup(page: Page): Promise<void> {
  await page.goto("/matches/new");
  await expect(page.getByTestId("match-setup-wizard")).toBeVisible({
    timeout: 30_000,
  });

  for (let occurrence = 0; occurrence < 3; occurrence += 1) {
    const world = page.locator(
      `button[aria-pressed][aria-label="${TOP5_WORLD}"]`,
    );
    await expect(
      world,
      `the World "${TOP5_WORLD}" must be offered for occurrence ${occurrence + 1}`,
    ).toHaveCount(1, { timeout: 30_000 });
    await world.click();
    // Choosing a World advances straight to that occurrence's Scopes, so the
    // Scope counter arriving is what proves the click registered.
    await expect(page.getByTestId("scope-count")).toBeVisible({
      timeout: 15_000,
    });

    const scopes = page.locator(
      'button[aria-pressed="false"]:not([disabled])[aria-label]',
    );
    for (let scope = 0; scope < 4; scope += 1) {
      await expect(scopes.first()).toBeVisible({ timeout: 30_000 });
      await scopes.first().click();
    }
    await expect(page.getByTestId("scope-count")).toContainText("4/4", {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "متابعة", exact: true }).click();
  }

  await expect(page.getByTestId("review-summary")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "متابعة إلى الفريقين" }).click();
  const start = page.getByRole("button", { name: /ابدأ المباراة/ });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await page.waitForURL(/\/matches\/[^/]+$/, { timeout: 60_000 });
}

async function joinPhone(
  phone: Page,
  joinCode: string,
  displayName: string,
  teamIndex: number,
): Promise<void> {
  await phone.goto(`/join/live-session/${joinCode}`);
  await phone.locator("input[autocomplete='nickname']").fill(displayName);
  // Two large team cards rather than a dropdown: on a phone, choosing a team is
  // the whole interaction, so it is a tap target and not a menu.
  await phone.locator("[data-team-option]").nth(teamIndex).click();
  await expect(
    phone.locator("[data-team-option]").nth(teamIndex),
  ).toHaveAttribute("data-selected", "true");
  await phone.locator('button[type="submit"]').click();
  await expect(phone.locator("body")).not.toContainText("رمز غير صالح", {
    timeout: 30_000,
  });
}
