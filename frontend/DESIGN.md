# Design Reference: Akwaan (أكوان) frontend

<!--
  Deliberately no YAML token frontmatter. The normative tokens already live in
  src/app/globals.css and tailwind.config.ts, pinned by tests. Copying their
  values here would create a second source of truth that drifts. This file
  points at those sources and records how they are used.
-->

## Overview

**This is a reference, not an authority.** `GAME_NEW_SYSTEM_ROADMAP.md` (the roadmap) decides product and visual
direction, and wins every conflict with this file. The code decides token values. This file only records
what is implemented, where it lives, and which parts the roadmap has approved. If this file disagrees with the
roadmap or with the code, the roadmap or the code is right and this file is stale.

It exists so design tools, including Impeccable, which is advisory only, read Akwaan's existing identity
instead of inventing one. It introduces no tokens, no components, and no design system.

Impeccable is installed per developer (`npx impeccable install --scope=project`; the skill folders are
git-ignored). Its shared project configuration is `.impeccable/config.json` (telemetry off, quiet hook, the
approved detector exception); `frontend/.impeccable/config.json` links to it so the same settings apply when an
agent works from `frontend/`.

**Status labels used below**

| Label | Meaning |
|---|---|
| **Roadmap-approved** | A roadmap section approves it; the section is cited. |
| **Implemented, test-pinned** | It exists in code, and a test asserts it. This is not a product approval. |
| **Implemented** | It exists in code with no test or roadmap backing. |
| **⚠️ Unresolved** | Its status is unclear or it contradicts something else. Do not treat it as approved. |

**Product shape that design must respect** (roadmap §10.1): one shared public screen (laptop or TV browser) and
private player phones, which are separate views built from one codebase. Readability across a living room
matters as much as on a phone.

**World identity** (roadmap §9, World Design Guardrail): a World's identity comes from its artwork and board, and
must be recognizable from a 10-second silent clip. The app shell stays quiet so World artwork carries the colour.

**Approved visual direction:**

- Roadmap **§22.5** How-to-Play, "Visual & responsive direction (approved and implemented)": warm
  cream/off-white page, navy with restrained gold, Arabic RTL, product visuals instead of generic SaaS icons,
  and no new animation framework or parallel design system. The roadmap scopes this evidence to **that page
  only**. The same palette is implemented app-wide in `globals.css`, but app-wide approval is not stated in
  the roadmap.
- Roadmap **§26.5** المرحلة board: tactile cream/soft-blue tiles on a navy-and-gold physical board, with team
  pawns. This is human visually accepted.
- Mechanic-specific visuals belong to each mechanic's own roadmap section (§16.x, §17.x). This file does
  not restate them.

## Colors

**Sources:** `src/app/globals.css` (`:root`, HSL triplets) and `tailwind.config.ts` (utility names).
`src/test/design-tokens.test.ts`, `team-palette.test.ts` and `semantic-colour-scope.test.ts` pin them. Screens
use the semantic utilities and never raw hues.

Akwaan has **three separate colour systems that must not mix.** The header comment in `globals.css` is the
canonical explanation:

### 1. Brand and surfaces (persistent chrome)

| Token | Role | Status |
|---|---|---|
| `--background` | The warm off-white "room" | Roadmap-approved (§22.5, How-to-Play); implemented app-wide |
| `--brand-navy` → `--foreground`, `--primary` | Type and primary action. Navy is deliberately not a team colour. | Roadmap-approved (§22.5, §26.5) |
| `--brand-gold` | Reserved for the timer, system chrome and brand. No team colour may be within 40° of it. | Roadmap-approved ("restrained gold", §22.5, §26.5) |
| `--card`, `--popover`, `--muted`, `--secondary`, `--accent`, `--border`, `--input`, `--ring` | Elevated, recessed, line and focus surfaces | Implemented |
| `--muted-foreground` (`218 15% 40%`) | Secondary and supporting text | Implemented, test-pinned (`challenge-explainer-readability.test.ts`). Darkened from 45% in PR #22: at 45% it measured 4.15–4.42:1 on tints and `bg-muted`; at 40% every measured surface passes AA. |
| `--brand-purple`, `--brand-cyan` | Frame accents. See below. | ⚠️ Unresolved |

**`brand-purple` / `brand-cyan`:** these are implemented and test-pinned. `design-tokens.test.ts` calls them "the
approved Akwaan palette", but **no roadmap section approves them.** There are only two uses:
`src/features/worlds/components/world-card.tsx` (`worldCardAccent`: a 40% to 70% opacity border that tells
the Football card (cyan) and the Anime card (purple) apart), and `--chart-5` (cyan). Neither is used as a
fill, a gradient or text. Treat them as low-intensity frame accents with unresolved product status. Do not
widen their use until the roadmap decides.

### 2. Team colour (persistent: says *who*)

- Slot-named, never hue-named: `--team-{1,2}-{base,on-light,on-dark,tint,text,fill,fill-foreground}`.
  The utilities are `team-1`, `team-2`, and so on.
- `src/lib/team-palette.ts` is the only place a team colour is written as a number. It has a cool pool for slot 1
  and a warm pool for slot 2, and it enforces contrast and reserved-hue distance. Screens read
  `src/lib/team-identity.ts`.
- A team colour may never be success, error or brand gold. Brand colours are never team colours.
- On a team's own 12% tint, label **text** is navy (`text-foreground`); the team is carried by the tint, the
  border and any team-coloured marker. A team hue is not guaranteed 4.5:1 against its own tint (measured
  3.75–3.95:1 before PR #22). Team-coloured text on a plain card is fine: `on-light` is validated for that.

### 3. Semantic reveal colour (transient: says *how it went*)

- `--sem-success` and `--sem-error` are the full-surface reveal at the moment an answer resolves, and nothing
  else. `--destructive` and `--success` alias them for form and admin status.
- `semantic-colour-scope.test.ts` enforces this on player-facing Match surfaces.
- `--warning`, `--selected` and `--completed` are board and progress states. Implemented.
- Text on a 10% semantic tint (`bg-sem-success/10`, `bg-sem-error/10`) is `text-foreground`; the tint and border
  carry the meaning. Brand gold is never readable text on light surfaces (1.7–2.0:1); it stays a tint, border
  or decorative icon accent (`challenge-explainer-colour.test.ts`).
- The Match countdown's warning state uses `--warning` on the large numeral and navy digits on the small chip,
  plus a static alarm icon so urgency never relies on colour alone (PR #21).

### Not a theme

- There is **no `.dark` theme block** in `globals.css`. `THEME_BACKGROUNDS.dark` (`team-palette.ts`) and the
  `--team-*-on-dark` tokens exist so team contrast can be validated against the shared screen's dark room, but
  `--team-*-text` always resolves to `on-light`. ⚠️ Unresolved: how a dark shared-screen room is applied, if
  at all.
- **Retired:** the old purple canvas and glow. `design-tokens.test.ts` asserts it stays out of `globals.css`,
  and the `body` comment explains why.

## Typography

**Sources:** `src/app/layout.tsx` (`next/font/google`), `tailwind.config.ts` `fontFamily`, and the `globals.css`
base layer. Status: Implemented. The roadmap does not name the typefaces.

| Role | Family | Variable / utility | Weights | Use |
|---|---|---|---|---|
| Display | Noto Kufi Arabic (Arabic subset) | `--font-display`, `font-display` | 600, 700 | `h1` to `h3` by default; identity at display scale |
| Body | Readex Pro (Arabic and Latin) | `--font-body`, `font-body`, `font-sans` | 400 to 700 | Everything else: reading and interaction |
| Numerals | Readex Pro | `.akwaan-numeral` | — | Tabular, LTR-isolated Western digits for scores inside Arabic UI |

`globals.css` states the rule as "Two voices, one hierarchy". There is no custom type-size scale: Tailwind's
default scale is used.

**Explainer step captions** (the instruction a room reads off the shared screen) are body size: 16px from `sm`
(14px below) in both the production player caption and the preview controls caption, with measured
`min-height` floors so steps do not jump (`explainer-controls.tsx`, PR #22). Mock-phone text inside explainers
is intentionally small and was not enlarged.

## Layout

- **Direction:** `<html lang="ar" dir="rtl">` (`layout.tsx`). Arabic-first RTL is roadmap-approved (§22.5).
  Both logical (`start`, `end`, `ps`, `ms`) and physical (`left`, `pl`) utilities appear in the code, and no
  rule enforces either. ⚠️ Unresolved as a convention. Whatever is used must render correctly in RTL.
- **Spacing:** Tailwind's default scale. There is no custom spacing token. The container is centred, with 2rem
  padding and a `2xl` maximum of 1400px.
- **`.stage-center`:** single-focus Match stages (question, decision, reveal) are centred in the space left
  under the Match bar so a TV is not half empty. Dense stages, such as the board and recaps, deliberately
  start at the top.
- **Responsive:** no horizontal overflow on mobile (§22.5, How-to-Play). The shared screen and the phones are
  different views, not one responsive layout (§10.1).

## Elevation & Depth

- `.surface-card` is "the one elevated surface treatment": the `--radius` corner, a border, `bg-card`, and a
  soft navy-tinted two-layer shadow. Screens compose it rather than re-inventing a border, shadow and radius
  trio.
- Shadows are neutral and navy-tinted (`hsl(var(--foreground) / …)`), never coloured glows.
- `.cn-toast` is a small light toast with a thin hairline. Errors take a `--sem-error` hairline.
- `.akwaan-portal` is the World portal's soft radial halo: navy on hover, and gold when selected
  (`aria-pressed`).

## Shapes

- `--radius: 0.875rem` maps to `rounded-lg`, with `md` and `sm` at −2px and −4px. Board tiles use `rounded-xl`.
- Pills and markers use `rounded-full`.

## Components

Signature components only. Their behaviour is owned by their roadmap sections.

- **Unified Match board tile** (`match/components/unified-board-tile.tsx`): a rounded-xl tile with a uniform
  1px border and a **2px bottom edge in the same state colour**, which acts as a tactile key or pressable depth
  cue. Its states are default, in-progress (`selected` plus a ring), completed (`completed-subtle`) and
  unplayable (`muted`). When interactive it lifts 2px on hover. See Approved Exceptions.
- **World card** (`worlds/components/world-card.tsx`): the World artwork carries identity, and the call to
  action is always `primary`. Frame accents are covered under Colors (unresolved).
- **Mechanic explainers** (`features/challenge-explainer/`): GSAP-driven tutorials. Every GSAP effect is
  gated on `timeline.reducedMotion`.
- **Closest slider** (`.closest-slider` in `globals.css`): gold track and thumb. ⚠️ It uses a literal gold
  (`#d6a928`, with `#fff6df`), not `--brand-gold`. Unresolved whether this is an intentional variant.

## Do's and Don'ts

### Do

- Check the roadmap section for the surface first. This file defers to it.
- Use semantic utilities (`primary`, `card`, `muted`, `team-1`, `sem-*`, and so on), never raw hues.
- Keep the three colour systems apart: brand chrome, team (who), and semantic reveal (how it went).
- Let World artwork carry colour. Keep the shell cream, navy and restrained gold.
- Use the motion tokens and the `akwaan-*` animation family, and honour reduced motion (see below).
- Validate at TV distance and on a phone, in RTL.

### Don't

- Don't add tokens, typefaces or a parallel design system because of this file or a design tool.
- Don't use a team colour for success or error, or brand gold for a team.
- Don't restore the retired purple canvas or glow, or add purple and violet gradients.
- Don't treat anything marked ⚠️ Unresolved here as approved.

## Motion

**Sources:** the `globals.css` "Motion language" section. Status: Implemented. The roadmap's constraint is
"no new animation framework" (§22.5).

- Tokens: `--motion-fast` 140ms, `--motion-base` 240ms, `--motion-slow` 460ms, `--motion-ease`
  `cubic-bezier(0.22, 0.61, 0.36, 1)`. The utilities are `duration-fast`, `duration-base`, `duration-slow` and
  `ease-akwaan`.
- The vocabulary is used only where movement carries meaning: `akwaan-rise` (arrival), `akwaan-pop` (a +1
  landing), `akwaan-claim` (a field taking its owner's colour), `akwaan-shake`, the hero and focus entrances,
  `akwaan-soft-pop`, and ambient `akwaan-orbit` and `akwaan-float`. View transitions run at 280 to 360ms.
- GSAP is used for the mechanic explainers (`features/challenge-explainer/`).
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` stops every `akwaan-*` animation, removes the
  primary-action lift, cuts transitions to 1ms, and shortens view transitions. Explainers gate GSAP on
  `timeline.reducedMotion`. Tailwind `animate-*` utilities are *not* covered by that block, so they take
  `motion-reduce:animate-none` (the existing pattern in Match screens and explainers).
- **Reduced-motion tutorials:** under reduced motion an explainer never plays on its own, so
  `showsExplainerControls()` shows its Previous / Next transport in the production player too (PR #22). Normal
  motion keeps the controls-free host presentation.

## Approved Exceptions

These are exceptions to Impeccable detector rules, recorded with their evidence. Config exceptions live in
`.impeccable/config.json`.

| Detector rule | Where | Evidence | Mechanism |
|---|---|---|---|
| `cream-palette` (rendered scans) | App background `--background` | Roadmap §22.5 ("warm cream/off-white page") and §26.5 (cream tiles) | Documented here. The rule has no value-level ignore, and source scans do not raise it. |
| `ai-color-palette` | `frontend/src/legacy/**` | Retired classic game. `legacy-detachment.test.ts` keeps it out of routes and the bundle. | `.impeccable/config.json` file-scoped ignore |
| `border-accent-on-rounded` | `unified-board-tile.tsx` 2px bottom edge | Same colour as the tile border, not an accent. It is a tactile depth cue consistent with the board's "tactile tile" language (§26.5, by analogy). | ⚠️ Pending product confirmation. No ignore has been added yet. |

## Unresolved

1. Product status of `brand-purple` and `brand-cyan` (test-pinned only, with no roadmap approval).
2. App-wide approval of the cream, navy and gold identity beyond How-to-Play (§22.5 scopes its evidence to that page).
3. Whether a dark shared-screen theme is applied (the `on-dark` tokens exist, but there is no `.dark` block).
4. The Closest slider's literal gold (`#d6a928`) versus `--brand-gold`.
5. Remaining raw Tailwind greens and reds in explainers: Bomb's correct chips and La Tahriqha's
   `emerald-800`/`emerald-50` pairs (the `--success` token would lower their contrast), the Odd-Piece winner card,
   photo tap-markers, and Odd-Piece's rose "intruder part" highlight (not an error colour). Product review.
6. Top 5 writes team colours as raw `blue-700` / `rose-700` instead of the team-identity tokens. Product review.
7. The site footer tagline (navy at 60% on white, 4.4:1) on every public page.
8. Logical versus physical direction utilities: no convention is enforced.

Resolved since this file was first written: the undefined `text-brand-dark` (PR #21), the ungated
`animate-bounce`/`animate-pulse` in Odd-Piece (PR #21), the clear one-to-one correct-answer colour migrations
(PR #22), and the reduced-motion tutorial navigation bug (PR #22).
