# Batch Variety & Set-Level Review Contract

## 0. Core Principle: Advisory Quality Targets vs Hard Errors

Batch Variety audits the collective texture, pacing, and diversity of a question set.
To prevent rigid constraints from breaking mechanic-native authoring, batch variety rules are classified as:

1. **ERROR (Hard Invariant)**: Violates factual truth, schema, or runtime contract (e.g. Zero Answer Leakage, invalid archetype ID, missing mechanic fields).
2. **WARNING (Advisory Quality Target)**: Highlights content clustering, repetitive phrasing, or low diversity that should be reviewed and optimized.
3. **INFO / SCORE (Advisory Metric)**: Evaluates overall batch richness for product QA.

---

## 1. Default Quality Targets (Advisory Warnings)

For standard batches (e.g. 9–15 items), the following default quality targets apply as **advisory warnings**:

| Quality Dimension | Default Target | Advisory Warning Trigger | Mechanic-Specific Adaptation |
| :--- | :--- | :--- | :--- |
| **Max Single Archetype Share** | $\le 35\%$ of batch | Any single archetype $>35\%$ | Mechanics with naturally narrower palettes (e.g. Closest, Bomb) may justify higher share. |
| **Distinct Archetypes Count** | $\ge 4$ distinct archetypes (for $\ge 9$ items) | $<4$ archetypes in a 9–15 item set | Allows specialized mini-pilots to focus on targeted shapes. |
| **Prompt Opening Spread** | $\le 40\%$ starting with `"من / ما"` | $>40\%$ starting with generic `"من / ما"` | Encourages natural, conversational Saudi phrasing. |
| **Consecutive Clustering** | $\le 2$ consecutive items of same archetype | 3+ consecutive items of same archetype | Recommends swapping item order to avoid repetitive feel. |
| **Entity Dimension Spread** | Mix $\ge 3$ distinct content dimensions | Single dimension $>70\%$ (e.g. 100% players) | Rotates across stadiums, clubs, lore, weapons, moments. |

---

## 2. Set Diversity Scoring (Advisory Metric)

When auditing an authored batch of $N$ questions, calculate the **Batch Diversity Score ($D$)**:

$$D = 0.4 \cdot \left(\frac{\text{Unique Archetypes}}{\min(N, 6)}\right) + 0.3 \cdot (1 - \text{Max Archetype Concentration}) + 0.3 \cdot (1 - \text{Generic Opening Share})$$

- **Score $\ge 0.80$**: ✅ **EXCELLENT DIVERSITY** — Varied, dynamic, and multifaceted.
- **Score $0.65 - 0.79$**: 🟡 **ACCEPTABLE WITH ADVISORY NOTICES** — Product-reviewable; minor clustering noted.
- **Score $< 0.65$**: ⚠️ **LOW DIVERSITY NOTICE** — Optimization recommended before final human sign-off.

> **Note:** The diversity score is an advisory product QA metric. It is **not** an automated runtime blocker.
