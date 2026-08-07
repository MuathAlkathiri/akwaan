---
name: question-pattern-mode-objective
description: Identifies game modes and recalls or infers their active objectives.
---

# GAME_MODE_RECOGNITION / OBJECTIVE_RECALL

Infer a mode from objective markers, HUD state, rules in action, or a bounded
clip; or ask for a canonically supported mission/match objective. The Asset or
event must provide observable evidence beyond answer text. Reject generic
scoreboards, invented objectives, and prompts whose setup already names the
mode or objective.

Arabic examples: `أي طور لعب هذا؟` / `وش كان الهدف في هذه اللحظة؟`
