#!/usr/bin/env python3
"""Read-only regression checks for canonical registry and Puzzles families."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from validate_moving_xo import FAMILIES, RETIRED_SCOPES  # noqa: E402


MANIFEST = AI_ROOT / ".opencode" / "authoring-manifest.json"
SKILLS = AI_ROOT / ".opencode" / "skills"


class CanonicalAuthoringRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    def test_canonical_manifest_inventory(self) -> None:
        self.assertEqual(len(self.manifest["worlds"]), 12)
        self.assertEqual(len(self.manifest["scopes"]), 59)
        self.assertEqual(
            sum(len(world["scopes"]) for world in self.manifest["worlds"].values()),
            59,
        )
        for combo, scope in self.manifest["scopes"].items():
            world, slug = combo.split("/", 1)
            self.assertEqual(scope["world"], world)
            self.assertIn(slug, self.manifest["worlds"][world]["scopes"])
            self.assertTrue((REPO_ROOT / scope["scopePath"]).exists())
            self.assertTrue((REPO_ROOT / scope["knowledgePath"]).exists())

    def test_mechanic_aliases_and_statuses_are_unchanged(self) -> None:
        mechanics = self.manifest["mechanics"]
        self.assertEqual(mechanics["moving-xo"]["status"], "AUTHORABLE")
        self.assertEqual(mechanics["moving-xo"]["boundWorld"], "puzzles")
        self.assertEqual(mechanics["distributed-information"]["status"], "AUTHORABLE")
        self.assertIn("rakkibha", mechanics["distributed-information"]["aliases"])
        self.assertEqual(mechanics["one-clue"]["status"], "LEGACY")

    def test_active_audit_and_readme_use_canonical_manifest(self) -> None:
        audit = (AI_ROOT / ".opencode" / "validators" / "audit_active_architecture.py").read_text(
            encoding="utf-8"
        )
        readme = (AI_ROOT / ".opencode" / "README.md").read_text(encoding="utf-8")
        self.assertIn('ACTIVE / "authoring-manifest.json"', audit)
        self.assertIn("authoring-manifest.json` is the sole canonical", readme)
        self.assertIn("historical/compatibility material", readme)

    def test_moving_xo_has_exactly_78_unique_scope_owned_families(self) -> None:
        self.assertEqual(set(FAMILIES), set(self.manifest["worlds"]["puzzles"]["scopes"]))
        family_ids = [family for scope in FAMILIES.values() for family in scope]
        self.assertEqual(len(family_ids), 78)
        self.assertEqual(len(set(family_ids)), 78)
        self.assertTrue(
            {"quantity-intuition", "numeric-pattern", "dot-count"}.isdisjoint(family_ids)
        )
        self.assertTrue(RETIRED_SCOPES.isdisjoint(FAMILIES))

    def test_exemplar_approval_states_remain_explicit(self) -> None:
        numbers = (
            SKILLS / "worlds" / "puzzles" / "scopes" / "numbers-estimation" / "EXEMPLARS.md"
        ).read_text(encoding="utf-8")
        self.assertEqual(numbers.count("⬜ **WITHHELD**"), 4)
        self.assertIn("`missing-number-pattern` | ✅ **APPROVED**", numbers)
        self.assertNotIn("`quantity-intuition` | ✅ **APPROVED**", numbers)
        self.assertNotIn("`numeric-pattern` | ✅ **APPROVED**", numbers)


if __name__ == "__main__":
    unittest.main()
