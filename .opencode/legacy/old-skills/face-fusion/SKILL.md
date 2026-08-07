# Face Fusion Skill

## Purpose

Create enjoyable "Who are these two?" puzzles by blending two recognizable faces into one realistic portrait.

Players must identify both original people.

The objective is immediate recognition, not visual confusion.

---

# Gameplay

The player sees one merged face.

Question:

Who are these two people?

The correct answer consists of exactly two names.

---

# Workflow

1. Select two candidates.
2. Validate that both are widely recognizable.
3. Verify that they belong to the same category.
4. Create a provider-neutral `generated_image` Asset task.
5. Stop as incomplete unless a separately configured future provider returns a
   real local image.
6. Validate recognizability and local readability.
7. Reject weak blends.
8. Return the final local image only after validation.

---

# Hard Rules

Never merge more than two people.

Never mix categories unless explicitly requested.

Never use obscure people.

Both faces must remain identifiable.

If either face becomes difficult to recognize, regenerate.
