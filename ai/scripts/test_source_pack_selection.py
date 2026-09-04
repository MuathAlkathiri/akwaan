#!/usr/bin/env python3
"""Tests for the forward source-pack selector.

Run:  python3 -m unittest discover -s ai/scripts -p 'test_*.py' -v

The thing being held down is that a *record* of authoring cannot be replayed as
a worklist. A final pack keeps replaced items beside their replacements, so any
consumer that treats `pack["items"]` as "things to promote" revives retired
content. These tests drive the real selector against both synthetic packs and
the four real Music packs; nothing here touches a network, a runtime or a DB.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from source_pack_selection import (  # noqa: E402
    KNOWN_STATUSES,
    SourcePackSelectionError,
    select_forward_items,
    selection_summary,
)

REPO_ROOT = Path(__file__).resolve().parents[2]

#: Where the Music batches live when they are present at all.
#:
#: They are *generated authoring artifacts*, not source: Git holds code, reusable
#: tooling and taxonomy, while the promoted content lives in the runtime DB. So
#: they sit in the git-ignored workbench and the pack-backed cases below skip
#: when they are absent, rather than turning a checkout without them into a red
#: suite. The synthetic cases carry the contract; these confirm one real batch.
PACK_DIR = REPO_ROOT / "ai" / "workbench" / "artifacts" / "music-2026-09"

#: The invariant the Music rebalance has to hold, per pack.
MUSIC_EXPECTED = {
    "music-ryo-batch-01.source.json": 12,
    "music-closest-batch-01.source.json": 12,
    "music-bomb-batch-01.source.json": 14,
    "music-first-note-batch-01.source.json": 12,
}


def item(ident: str, status: str | None = "ready", **extra) -> dict:
    made = {"id": ident, "prompt": {"ar": ident}}
    if status is not None:
        made["status"] = status
    made.update(extra)
    return made


class ArchivedIsExcluded(unittest.TestCase):
    """A — an archived item is never selected and never rewritten to ready."""

    def test_archived_item_is_not_selected(self):
        pack = {"items": [item("keep"), item("gone", "archived")]}
        forward = select_forward_items(pack)
        self.assertEqual([i["id"] for i in forward], ["keep"])

    def test_archived_item_is_not_converted_to_ready(self):
        archived = item("gone", "archived")
        select_forward_items({"items": [item("keep"), archived]})
        # The selector must not mutate the record it declined.
        self.assertEqual(archived["status"], "archived")

    def test_draft_is_excluded_too(self):
        pack = {"items": [item("keep"), item("wip", "draft")]}
        self.assertEqual([i["id"] for i in select_forward_items(pack)], ["keep"])


class ReadyIsSelectedOnce(unittest.TestCase):
    """B — a forward item is selected exactly once, in pack order."""

    def test_selected_once_and_in_order(self):
        pack = {"items": [item("a"), item("b"), item("c")]}
        self.assertEqual([i["id"] for i in select_forward_items(pack)], ["a", "b", "c"])


class ReplacementPair(unittest.TestCase):
    """C — only the `-v2` survives a replacement pair."""

    def test_only_the_replacement_is_selected(self):
        pack = {
            "items": [
                item("mus-not-002", "archived", authoring={"replacedBy": "mus-not-002-v2"}),
                item("mus-not-002-v2", "ready"),
            ]
        }
        self.assertEqual(
            [i["id"] for i in select_forward_items(pack)], ["mus-not-002-v2"]
        )

    def test_a_forward_item_claiming_a_successor_is_a_hard_error(self):
        # Supersession is (archived + replacedBy). A ready row pointing at a
        # successor means the pack disagrees with itself — fail, never resolve.
        pack = {"items": [item("old", "ready", authoring={"replacedBy": "old-v2"})]}
        with self.assertRaises(SourcePackSelectionError):
            select_forward_items(pack)


class FailClosed(unittest.TestCase):
    """E — unknown or missing lifecycle status must not become ready."""

    def test_unknown_status_raises(self):
        pack = {"items": [item("weird", "published")]}
        with self.assertRaises(SourcePackSelectionError):
            select_forward_items(pack)

    def test_non_string_status_raises(self):
        pack = {"items": [item("weird", None), item("other", "ready")]}
        pack["items"][0]["status"] = 1
        with self.assertRaises(SourcePackSelectionError):
            select_forward_items(pack)

    def test_missing_status_in_a_lifecycle_aware_pack_raises(self):
        pack = {"items": [item("marked", "ready"), item("unmarked", None)]}
        with self.assertRaises(SourcePackSelectionError):
            select_forward_items(pack)

    def test_legacy_pack_with_no_status_anywhere_is_selected_whole(self):
        # The `questions[]` packs under ai/scripts/data/ predate the field; the
        # carve-out is all-or-nothing and documented in the module.
        pack = {"questions": [item("a", None), item("b", None)]}
        self.assertEqual([i["id"] for i in select_forward_items(pack)], ["a", "b"])

    def test_pack_without_a_recognised_list_raises(self):
        with self.assertRaises(SourcePackSelectionError):
            select_forward_items({"rows": []})

    def test_known_statuses_match_the_backend_enum(self):
        # backend/src/modules/world-content/domain/world-content.constants.ts
        self.assertEqual(KNOWN_STATUSES, frozenset({"draft", "ready", "archived"}))


class ProductApprovalIsNotALifecycleGate(unittest.TestCase):
    """F — approval metadata must not be mistaken for the lifecycle signal."""

    def test_archived_item_stays_excluded_even_when_approved(self):
        # 8 real archived Music items carry productApproval: YES.
        pack = {
            "items": [
                item("gone", "archived",
                     authoring={"productApproval": "YES", "replacedBy": "gone-v2"}),
                item("gone-v2", "ready", authoring={"productApproval": "YES"}),
            ]
        }
        self.assertEqual([i["id"] for i in select_forward_items(pack)], ["gone-v2"])

    def test_forward_item_without_approval_metadata_is_still_selected(self):
        # 13 real forward Music items carry no productApproval field at all, so
        # gating on it would silently drop them.
        pack = {"items": [item("plain", "ready")]}
        self.assertEqual([i["id"] for i in select_forward_items(pack)], ["plain"])


class MusicPacksHoldTheInvariant(unittest.TestCase):
    """D + G — the four real packs resolve to 50 forward, 0 archived, every run."""

    def packs(self):
        for name, expected in MUSIC_EXPECTED.items():
            path = PACK_DIR / name
            if not path.exists():
                self.skipTest(
                    f"generated pack not present locally: {path.relative_to(REPO_ROOT)}"
                )
            yield name, expected, json.loads(path.read_text(encoding="utf-8"))

    def test_per_pack_forward_counts(self):
        for name, expected, pack in self.packs():
            with self.subTest(pack=name):
                self.assertEqual(len(select_forward_items(pack, source=name)), expected)

    def test_total_is_fifty_forward_and_zero_archived(self):
        total_forward = 0
        total_archived = 0
        for name, _expected, pack in self.packs():
            forward = select_forward_items(pack, source=name)
            total_forward += len(forward)
            total_archived += sum(1 for i in forward if i.get("status") == "archived")
        self.assertEqual(total_forward, 50)
        self.assertEqual(total_archived, 0)

    def test_no_selected_item_is_superseded(self):
        for name, _expected, pack in self.packs():
            for entry in select_forward_items(pack, source=name):
                with self.subTest(pack=name, item=entry["id"]):
                    self.assertIsNone((entry.get("authoring") or {}).get("replacedBy"))

    def test_no_archived_base_is_selected_beside_its_v2(self):
        for name, _expected, pack in self.packs():
            selected = {i["id"] for i in select_forward_items(pack, source=name)}
            for entry in pack["items"]:
                successor = (entry.get("authoring") or {}).get("replacedBy")
                if successor:
                    with self.subTest(pack=name, retired=entry["id"]):
                        self.assertNotIn(entry["id"], selected)
                        self.assertIn(successor, selected)

    def test_bomb_forward_carries_no_audio(self):
        path = PACK_DIR / "music-bomb-batch-01.source.json"
        if not path.exists():
            self.skipTest(f"generated pack not present locally: {path.name}")
        pack = json.loads(path.read_text(encoding="utf-8"))
        audio = [
            i for i in select_forward_items(pack)
            if (i.get("media") or {}).get("type") == "audio"
        ]
        self.assertEqual(audio, [], "no historically rejected Audio Bomb item may be selected")

    def test_repeated_selection_is_identical(self):
        """G — idempotency: same input twice, same deterministic output."""
        for name, _expected, pack in self.packs():
            first = [i["id"] for i in select_forward_items(pack, source=name)]
            second = [i["id"] for i in select_forward_items(pack, source=name)]
            with self.subTest(pack=name):
                self.assertEqual(first, second)
                self.assertEqual(len(set(first)), len(first), "duplicate ids selected")

    def test_summary_matches_selection(self):
        for name, expected, pack in self.packs():
            summary = selection_summary(pack, source=name)
            with self.subTest(pack=name):
                self.assertEqual(summary["forward"], expected)
                self.assertEqual(
                    summary["physical"], summary["forward"] + summary["excluded"]
                )


if __name__ == "__main__":
    unittest.main()
