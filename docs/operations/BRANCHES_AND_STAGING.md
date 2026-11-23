# Branches, staging, and how two sessions share them

Written 2026-11-24. Read this before pushing anything.

## The branches

| Branch | Builds | Who may force-push |
|---|---|---|
| `main` | the live site (`playakwaan.com`) and `akwaan-api` | nobody |
| `staging` | `akwaan-api-staging` + the Vercel `staging` preview | **nobody** |
| `feat/*`, `chore/*` | its own Vercel preview only | its own author |

Flow: `feat/x` → **merge** into `staging` → try it → **merge** into `main`.

## The rule that matters

**`staging` is merged into, never pushed onto.**

Until 2026-11-24 this repository's staging branch was updated with:

```
git push --force-with-lease origin feat/new-identity:staging
```

That **replaces** `staging` with one branch. It was harmless while one session
used it. With two sessions it is not: the first push after somebody else merges
silently deletes their work, with no error and no conflict — the branch simply
stops containing it.

So: no `push <branch>:staging`, and no force-push to `staging`, ever.

## How to get work onto staging

Open a pull request on GitHub with **base `staging`**, and merge it there.

This avoids `git checkout staging` entirely — which has failed silently in this
repository more than once, leaving the commit on the branch the author was
already standing on — and it tells you about a conflict before the merge rather
than after. Render and Vercel both rebuild on the merge commit by themselves.

## Before you open that PR

**Merge `main` into your branch first**, and look at what comes back.

On 2026-11-23 `feat/new-identity` had drifted two commits behind `main`. Merging
it as it stood would have deleted both — reverting `/payments/packs` to a shape
the shop cannot read (a white screen on the live site) and removing wildcard
support from the CORS allowlist (every branch preview cut off from the API).

Neither was visible from the branch: its own tests were green because the branch
was consistent with itself, and its preview worked because it was talking to
production's API, which still had the code. A silent deletion by merge does not
look like a bug until it is one.

## What staging is not

It is **not production with a different URL**. Three things differ on purpose:

- **The free month is over there.** `LAUNCH_CAMPAIGN_ENDS_AT` is set in the past,
  so the shop sells. On production it runs to 31 December and nothing can be
  bought. If staging behaved like production, no purchase could ever be tested.
- **مُيسّر runs on test keys** (`sk_test_`). Charges there move no money.
- **The Content Engine is off.** `OPENROUTER_API_KEY` is deliberately unset, so
  staging cannot spend model budget. Engine work will not run there until
  somebody adds it, knowingly.

Its database is `akwaan_staging` on the same Atlas cluster, reachable by a user
scoped to that database alone. It holds **content only** — no accounts, no
balances, no ledger. `npm run seed:staging` refills it from production's content;
it refuses to write anywhere whose name does not contain `staging`.

Full setup, secrets and gotchas: the project doc "بيئة الستيجنق — أكوان".
