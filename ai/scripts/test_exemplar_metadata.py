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
        approved = OPEN + "\nAPPROVED BODY\n" + CLOSE
        withheld = OPEN.replace("sample-one", "sample-two").replace(
            '"APPROVED"', '"WITHHELD"'
        ) + "\nWITHHELD BODY\n" + CLOSE
        document = resolve_exemplar_document("\n".join([approved, withheld]))
        self.assertIn("APPROVED BODY", document.approved_text)
        self.assertIn('"DO_NOT_REGENERATE"', document.approved_text)
        self.assertNotIn("WITHHELD BODY", document.approved_text)
        self.assertIn("WITHHELD BODY", document.historical_text)

    def test_unclassified_legacy_entry_is_excluded_and_diagnosed(self):
        document = resolve_exemplar_document(
            "### 1. Legacy example\n> answer text\n"
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

    def test_all_existing_files_parse(self):
        paths = sorted(Path("ai/.opencode/skills/worlds").glob("**/EXEMPLARS.md"))
        self.assertEqual(len(paths), 8)
        expected_counts = {
            "football/scopes/world-cup": 4,
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
