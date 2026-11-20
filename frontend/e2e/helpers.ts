import { expect, Page, request } from "@playwright/test";

/**
 * Seeded integration accounts. The password form they used to be typed into is
 * gone — players sign in with a one-time code now — but the backend still
 * accepts email + password, which is what keeps these usable here.
 */
const accounts = {
  admin: { email: "admin@integration.invalid", password: "TestAdmin!42" },
  user: { email: "user@integration.invalid", password: "TestUser!42" },
  expired: { email: "expired@integration.invalid", password: "TestUser!42" },
} as const;

/** Where the app keeps a signed-in session; see features/auth/storage. */
const TOKEN_KEY = "akwaan_access_token";
const USER_KEY = "akwaan_user";

const apiBaseUrl = () =>
  process.env.E2E_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3000";

/**
 * Signs a spec in without driving the sign-in screen.
 *
 * It used to fill an email and a password on `/login`. That form is now
 * passwordless: a code is mailed out and typed back, which a test cannot do
 * without reading the mailbox or the OTP collection. So this authenticates
 * against the API and writes the session the app would have written itself.
 *
 * That makes it independent of how signing in looks, which is the point: these
 * specs are here to test what comes after it.
 */
export async function login(page: Page, role: keyof typeof accounts) {
  const { email, password } = accounts[role];
  await loginAs(page, email, password);
}

/**
 * The same sign-in for a spec that carries its own account, usually from its
 * own E2E_* variables. Kept as one implementation so the next change to how a
 * session is stored is one edit, not eleven.
 */
export async function loginAs(page: Page, email: string, password: string) {
  const api = await request.newContext({ baseURL: apiBaseUrl() });
  let session: { accessToken: string; user: unknown };
  try {
    const response = await api.post("/auth/login", {
      data: { email, password },
    });
    if (!response.ok()) {
      throw new Error(
        `login failed for ${email}: ${response.status()} ${await response.text()}`,
      );
    }
    session = await response.json();
  } finally {
    await api.dispose();
  }

  // Before any script of the page runs, so the first render is already signed in.
  await page.addInitScript(
    ([tokenKey, userKey, token, user]) => {
      window.localStorage.setItem(tokenKey, token);
      window.localStorage.setItem(userKey, user);
    },
    [TOKEN_KEY, USER_KEY, session.accessToken, JSON.stringify(session.user)],
  );
  await page.goto("/");
  await expect(page).not.toHaveURL(/\/login/);
}

export function assertSafePage(page: Page) {
  return expect(page.locator("body")).not.toContainText(
    /__v|localPath|\/Users\/|stack trace|rawProvider|rawPrompt|Bearer\s/i,
  );
}
