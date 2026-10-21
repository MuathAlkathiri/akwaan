#!/usr/bin/env python3
"""Regression checks for the canonical ContentItem reference boundary."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


AI_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = Path(__file__).resolve().parents[3]
AUDIT = AI_ROOT / ".opencode" / "validators" / "audit_active_architecture.py"
SCHEMA = AI_ROOT / ".opencode" / "validators" / "CONTENTITEM.schema.json"
MODEL = AI_ROOT / ".opencode" / "knowledge" / "architecture" / "CONTENTITEM-MODEL.md"
BIBLE = AI_ROOT / ".opencode" / "knowledge" / "AKWAAN-CONTENT-BIBLE.md"
MANIFEST = AI_ROOT / ".opencode" / "authoring-manifest.json"
HISTORICAL_MANIFEST = AI_ROOT / ".opencode" / "manifest.json"

CANONICAL_SOURCES = (
    REPO_ROOT / "backend/src/modules/world-content/dto/content-item.dto.ts",
    REPO_ROOT / "backend/src/modules/world-content/schemas/content-item.schema.ts",
    REPO_ROOT
    / "backend/src/modules/world-content/domain/content-item-compatibility.policy.ts",
)


class CanonicalReferenceAlignmentTests(unittest.TestCase):
    def test_backend_is_the_current_content_item_authority(self) -> None:
        for source in CANONICAL_SOURCES:
            self.assertTrue(source.exists(), source)
        dto = CANONICAL_SOURCES[0].read_text(encoding="utf-8")
        schema = CANONICAL_SOURCES[1].read_text(encoding="utf-8")
        policy = CANONICAL_SOURCES[2].read_text(encoding="utf-8")
        for field in ("compatibleChallengeTypeIds", "answerPayload", "mechanicPayload"):
            self.assertIn(field, dto)
            self.assertIn(field, schema)
        self.assertIn("ContentItemCompatibilityPolicy", policy)

    def test_historical_json_schema_is_retained_but_not_active_audit_input(self) -> None:
        historical = json.loads(SCHEMA.read_text(encoding="utf-8"))
        self.assertIn("patternId", historical["properties"])
        self.assertIn("interactionPayload", historical["properties"])
        self.assertIn("resolutionPayload", historical["properties"])

        audit = AUDIT.read_text(encoding="utf-8")
        self.assertIn("HISTORICAL_VALIDATOR_ASSETS", audit)
        self.assertIn('ACTIVE / "validators" / "CONTENTITEM.schema.json"', audit)
        self.assertNotIn("item_schema = json.loads", audit)
        self.assertNotIn("mode_set = {", audit)

    def test_active_references_use_current_content_item_vocabulary(self) -> None:
        model = MODEL.read_text(encoding="utf-8")
        bible = BIBLE.read_text(encoding="utf-8")
        for field in ("answerPayload", "mechanicPayload", "compatibleChallengeTypeIds"):
            self.assertIn(field, model)
            self.assertIn(field, bible)
        for obsolete in ("interactionPayload", "resolutionPayload", '"patternId"'):
            self.assertNotIn(obsolete, model)
        self.assertIn("ContentItemCompatibilityPolicy", model)

    def test_canonical_and_legacy_manifests_remain_distinct(self) -> None:
        self.assertTrue(MANIFEST.exists())
        self.assertTrue(HISTORICAL_MANIFEST.exists())
        audit = AUDIT.read_text(encoding="utf-8")
        self.assertIn('ACTIVE / "authoring-manifest.json"', audit)
        self.assertNotIn('ACTIVE / "manifest.json"', audit)


if __name__ == "__main__":
    unittest.main()
