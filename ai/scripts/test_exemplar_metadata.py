import json
import unittest
from pathlib import Path

try:
    from exemplar_metadata import (
        ExemplarMetadataError,
        parse_exemplar_metadata,
        resolve_exemplar_document,
    )
except ModuleNotFoundError:
    from ai.scripts.exemplar_metadata import (  # type: ignore
        ExemplarMetadataError,
        parse_exemplar_metadata,
        resolve_exemplar_document,
    )


OPEN = '<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"sample-one","status":"APPROVED","reusePolicy":"DO_NOT_REGENERATE"} -->'
CLOSE = "<!-- /AKWAAN_EXEMPLAR_META -->"
RYO = "read-your-opponent"
KNOWN = ["read-your-opponent", "closest", "one-clue", "bomb"]


def block(fields, body=None):
    """One complete exemplar block with the given metadata and body."""

    payload = {"version": 1, "reusePolicy": "DO_NOT_REGENERATE", **fields}
    body = body if body is not None else f"{str(fields['id']).upper()} BODY"
    return f"<!-- AKWAAN_EXEMPLAR_META {json.dumps(payload)} -->\n{body}\n{CLOSE}"


class ExemplarMetadataTests(unittest.TestCase):
    def test_valid_metadata_and_routing_note(self):
        text = (
            '<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"sample-one",'
            '"status":"APPROVED","reusePolicy":"DO_NOT_REGENERATE",'
            '"routingNote":"Use only for rule inference"} -->\n'
            "Example\n"
            + CLOSE
        )
        entries = parse_exemplar_metadata(text)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].metadata.status, "APPROVED")
        self.assertEqual(
            entries[0].metadata.routing_note, "Use only for rule inference"
        )

    def test_only_approved_content_enters_generation_view(self):
        approved = block(
            {"id": "sample-one", "status": "APPROVED", "mechanics": [RYO]},
            "APPROVED BODY",
        )
        withheld = block(
            {"id": "sample-two", "status": "WITHHELD", "mechanics": [RYO]},
            "WITHHELD BODY",
        )
        document = resolve_exemplar_document(
            "\n".join([approved, withheld]), mechanic_key=RYO
        )
        self.assertIn("APPROVED BODY", document.approved_text)
        self.assertIn('"DO_NOT_REGENERATE"', document.approved_text)
        self.assertNotIn("WITHHELD BODY", document.approved_text)
        self.assertIn("WITHHELD BODY", document.historical_text)

    def test_unclassified_legacy_entry_is_excluded_and_diagnosed(self):
        document = resolve_exemplar_document(
            "### 1. Legacy example\n> answer text\n", mechanic_key=RYO
        )
        self.assertEqual(document.approved_text, "")
        self.assertTrue(
            any("EXEMPLAR_STATUS_UNCLASSIFIED" in item for item in document.diagnostics)
        )

    def test_prose_heading_emoji_and_table_are_not_authoritative(self):
        text = """
## APPROVED: prose heading
**Status**: APPROVED
| State | ✅ APPROVED |
## ⚠️ Every item below is a retired subject
"""
        self.assertEqual(parse_exemplar_metadata(text), [])

    def test_unknown_status_is_rejected(self):
        text = OPEN.replace('"APPROVED"', '"PENDING"') + "\n" + CLOSE
        with self.assertRaisesRegex(ExemplarMetadataError, "unknown review status"):
            parse_exemplar_metadata(text)

    def test_all_contract_statuses_are_accepted(self):
        for status in ("APPROVED", "WITHHELD", "REJECTED", "RETIRED", "INVALID_TEST_SAMPLE"):
            exemplar_id = status.lower().replace("_", "-")
            text = OPEN.replace('"sample-one"', f'"sample-{exemplar_id}"').replace(
                '"APPROVED"', f'"{status}"'
            ) + "\n" + CLOSE
            self.assertEqual(parse_exemplar_metadata(text)[0].metadata.status, status)

    def test_malformed_json_is_rejected(self):
        text = "<!-- AKWAAN_EXEMPLAR_META {not-json} -->\n" + CLOSE
        with self.assertRaisesRegex(ExemplarMetadataError, "malformed metadata JSON"):
            parse_exemplar_metadata(text)

    def test_unknown_fields_are_rejected(self):
        text = OPEN.replace(
            '"reusePolicy":"DO_NOT_REGENERATE"',
            '"reusePolicy":"DO_NOT_REGENERATE","approved":true',
        ) + "\n" + CLOSE
        with self.assertRaisesRegex(ExemplarMetadataError, "unknown metadata field"):
            parse_exemplar_metadata(text)

    def test_unbalanced_and_duplicate_markers_are_rejected(self):
        with self.assertRaisesRegex(ExemplarMetadataError, "missing closing"):
            parse_exemplar_metadata(OPEN)
        duplicate = "\n".join([OPEN, CLOSE, OPEN, CLOSE])
        with self.assertRaisesRegex(ExemplarMetadataError, "duplicate exemplar id"):
            parse_exemplar_metadata(duplicate)

    def test_inline_table_entry_is_supported(self):
        text = (
            "| <!-- AKWAAN_EXEMPLAR_META "
            '{"version":1,"id":"table-row","status":"REJECTED",'
            '"reusePolicy":"DO_NOT_REGENERATE"} --> prompt | reason '
            + CLOSE
            + " |"
        )
        entries = parse_exemplar_metadata(text)
        self.assertEqual([e.metadata.exemplar_id for e in entries], ["table-row"])

    # -- mechanic targeting (mirrors exemplar-metadata.spec.ts) ---------------

    def test_targeted_exemplar_reaches_only_its_mechanic(self):
        ryo_only = block({"id": "ryo-only", "status": "APPROVED", "mechanics": [RYO]})
        self.assertIn("RYO-ONLY BODY", resolve_exemplar_document(ryo_only, mechanic_key=RYO).approved_text)
        for mechanic in ("closest", "one-clue", "bomb"):
            document = resolve_exemplar_document(ryo_only, mechanic_key=mechanic)
            self.assertEqual(document.approved_text, "")
            self.assertEqual(document.diagnostics, ("EXEMPLAR_MECHANIC_EXCLUDED: ryo-only",))
            self.assertIn("RYO-ONLY BODY", document.historical_text)

    def test_explicit_multi_mechanic_targeting(self):
        shared = block({"id": "shared", "status": "APPROVED", "mechanics": [RYO, "closest"]})
        for mechanic in (RYO, "closest"):
            self.assertIn("SHARED BODY", resolve_exemplar_document(shared, mechanic_key=mechanic).approved_text)
        self.assertEqual(resolve_exemplar_document(shared, mechanic_key="one-clue").approved_text, "")

    def test_missing_target_is_never_a_wildcard(self):
        legacy = block({"id": "legacy-approved", "status": "APPROVED"})
        for mechanic in KNOWN:
            document = resolve_exemplar_document(legacy, mechanic_key=mechanic)
            self.assertEqual(document.approved_text, "")
            self.assertEqual(document.diagnostics, ("EXEMPLAR_UNTARGETED_EXCLUDED: legacy-approved",))

    def test_selection_is_per_entry_with_ordered_diagnostics(self):
        document = resolve_exemplar_document(
            "\n".join([
                block({"id": "ryo-only", "status": "APPROVED", "mechanics": [RYO]}),
                block({"id": "closest-only", "status": "APPROVED", "mechanics": ["closest"]}),
                block({"id": "untargeted", "status": "APPROVED"}),
            ]),
            mechanic_key=RYO,
        )
        self.assertIn("RYO-ONLY BODY", document.approved_text)
        self.assertNotIn("CLOSEST-ONLY BODY", document.approved_text)
        self.assertNotIn("UNTARGETED BODY", document.approved_text)
        self.assertEqual(document.diagnostics, (
            "EXEMPLAR_UNTARGETED_EXCLUDED: untargeted",
            "EXEMPLAR_MECHANIC_EXCLUDED: closest-only",
        ))

    def test_non_approved_targeted_entries_are_never_positive(self):
        for status in ("REJECTED", "WITHHELD", "RETIRED", "INVALID_TEST_SAMPLE"):
            document = resolve_exemplar_document(
                block({"id": "not-approved", "status": status, "mechanics": [RYO]}),
                mechanic_key=RYO,
            )
            self.assertEqual(document.approved_text, "")
            self.assertIn("NOT-APPROVED BODY", document.historical_text)

    def test_non_canonical_target_is_rejected(self):
        for target in ("not-a-mechanic", "ryo"):
            with self.assertRaisesRegex(ExemplarMetadataError, "unknown mechanic"):
                resolve_exemplar_document(
                    block({"id": "typo", "status": "APPROVED", "mechanics": [target]}),
                    mechanic_key=RYO,
                    known_mechanics=KNOWN,
                )

    def test_malformed_targeting_is_rejected(self):
        for mechanics in ([], RYO, [7], [""], ["Read-Your-Opponent"], ["read your opponent"], ["closest", "closest"]):
            with self.subTest(mechanics=mechanics):
                with self.assertRaises(ExemplarMetadataError):
                    parse_exemplar_metadata(
                        block({"id": "bad-target", "status": "APPROVED", "mechanics": mechanics})
                    )

    # -- approval provenance --------------------------------------------------

    def _approved(self, **extra):
        return block({"id": "with-provenance", "status": "APPROVED", "mechanics": ["closest"], **extra})

    def test_provenance_is_parsed(self):
        metadata = parse_exemplar_metadata(self._approved(
            approvedBy="product-owner", approvedAt="2026-11-06", sourceRef="reference-library-v11:MM-003",
        ))[0].metadata
        self.assertEqual(metadata.mechanics, ("closest",))
        self.assertEqual(metadata.approved_by, "product-owner")
        self.assertEqual(metadata.approved_at, "2026-11-06")
        self.assertEqual(metadata.source_ref, "reference-library-v11:MM-003")

    def test_provenance_is_optional(self):
        self.assertIsNone(parse_exemplar_metadata(self._approved())[0].metadata.approved_by)

    def test_invalid_provenance_is_rejected(self):
        cases = [
            {"approvedBy": "product-owner"},
            {"approvedAt": "2026-11-06"},
            {"approvedBy": "", "approvedAt": "2026-11-06"},
            {"approvedBy": " po ", "approvedAt": "2026-11-06"},
            {"approvedBy": "a\nb", "approvedAt": "2026-11-06"},
            {"approvedBy": "x" * 121, "approvedAt": "2026-11-06"},
            {"approvedBy": "po", "approvedAt": "06/11/2026"},
            {"approvedBy": "po", "approvedAt": "2026-02-30"},
            {"approvedBy": "po", "approvedAt": "2026-11-06T10:00:00Z"},
            {"sourceRef": ""},
            {"sourceRef": 42},
        ]
        for extra in cases:
            with self.subTest(extra=extra):
                with self.assertRaises(ExemplarMetadataError):
                    parse_exemplar_metadata(self._approved(**extra))

    def test_approval_fields_require_approved_status(self):
        with self.assertRaisesRegex(ExemplarMetadataError, "only valid on APPROVED"):
            parse_exemplar_metadata(block({
                "id": "rejected-with-approver", "status": "REJECTED",
                "approvedBy": "product-owner", "approvedAt": "2026-11-06",
            }))

    def test_source_ref_is_allowed_on_any_status(self):
        metadata = parse_exemplar_metadata(
            block({"id": "rejected-ref", "status": "REJECTED", "sourceRef": "MM-002"})
        )[0].metadata
        self.assertEqual(metadata.source_ref, "MM-002")

    def test_all_existing_files_parse(self):
        paths = sorted(Path("ai/.opencode/skills/worlds").glob("**/EXEMPLARS.md"))
        self.assertEqual(len(paths), 8)
        expected_counts = {
            # 5 since 2026-11-06: owner-rejected first-tournament-year record.
            "football/scopes/world-cup": 5,
            "general-knowledge/scopes/science": 5,
            "puzzles/scopes/numbers-estimation": 12,
            "puzzles/scopes/spot-the-error": 8,
            "video-games/scopes/call-of-duty": 1,
            "video-games/scopes/fifa": 4,
            "video-games/scopes/gta": 1,
            "video-games/scopes/overwatch": 1,
        }
        for path in paths:
            relative = str(path.parent.relative_to("ai/.opencode/skills/worlds"))
            entries = parse_exemplar_metadata(path.read_text(encoding="utf-8"))
            self.assertEqual(len(entries), expected_counts[relative])
            self.assertEqual(
                len({entry.metadata.exemplar_id for entry in entries}), len(entries)
            )


if __name__ == "__main__":
    unittest.main()
