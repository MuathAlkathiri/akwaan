"""Regression tests for recording Human Product rejections as canonical exemplars.

Every test runs the real recorder against a throwaway authoring root built from
real repository files (the manifest, real Scope EXEMPLARS.md files and the
concept history), so nothing in the repository is written.
"""

from __future__ import annotations

import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
REPO = SCRIPTS.parents[1]
sys.path.insert(0, str(SCRIPTS))

import record_human_product_decision as recorder  # noqa: E402
from exemplar_metadata import (  # noqa: E402
    parse_exemplar_metadata,
    resolve_exemplar_document,
)

MANIFEST = "ai/.opencode/authoring-manifest.json"
HISTORY = "ai/.opencode/authoring-concept-history.json"
GTA = "ai/.opencode/skills/worlds/video-games/scopes/gta/EXEMPLARS.md"
SPOT = "ai/.opencode/skills/worlds/puzzles/scopes/spot-the-error/EXEMPLARS.md"
NUMBERS = "ai/.opencode/skills/worlds/puzzles/scopes/numbers-estimation/EXEMPLARS.md"
PREMIER = "ai/.opencode/skills/worlds/football/scopes/premier-league/EXEMPLARS.md"

PROMPT = "وش اسم هذي السيارة الرياضية اللي يسوقها فرانكلين في بداية القصة؟"


class RecordRejectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="akwaan-recorder-"))
        for relative in (MANIFEST, HISTORY, GTA, SPOT, NUMBERS):
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(REPO / relative, target)
        self.manifest = json.loads((REPO / MANIFEST).read_text(encoding="utf-8"))

    def tearDown(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)

    def source(self, item_id: str = "gta-r1-07", prompt: str = PROMPT, **extra) -> str:
        item = {
            "id": item_id,
            "metadata": {"conceptKey": {"subject": "franklin-first-car"}},
            "presentation": {"prompt": prompt},
            **extra,
        }
        path = self.root / f"pack-{item_id}.source.json"
        path.write_text(json.dumps({"items": [item]}, ensure_ascii=False), encoding="utf-8")
        return str(path)

    def record(self, source: str, *extra: str, status: str = "REJECTED") -> tuple[int, str]:
        argv = [
            "--source", source,
            "--status", status,
            "--reuse-policy", "DO_NOT_REGENERATE",
            "--lesson", "Shallow identification of a prop.",
            "--root", str(self.root),
            *extra,
        ]
        out = io.StringIO()
        with redirect_stdout(out):
            code = recorder.main(argv)
        return code, out.getvalue()

    def text(self, relative: str) -> str:
        path = self.root / relative
        return path.read_text(encoding="utf-8") if path.exists() else ""

    def snapshot(self) -> dict[str, str]:
        return {rel: self.text(rel) for rel in (GTA, SPOT, NUMBERS, HISTORY, PREMIER)}

    def gta(self, *extra: str, **kw) -> tuple[int, str]:
        return self.record(self.source(**kw), "--world", "video-games", "--scope", "gta", *extra)

    # 1-3 -------------------------------------------------------------------
    def test_rejection_becomes_a_canonical_rejected_entry(self) -> None:
        code, _ = self.gta()
        self.assertEqual(code, 0)
        entries = {e.metadata.exemplar_id: e for e in parse_exemplar_metadata(self.text(GTA))}
        entry = entries["gta-rejected-gta-r1-07"]
        self.assertEqual(entry.metadata.status, "REJECTED")
        self.assertEqual(entry.metadata.reuse_policy, "DO_NOT_REGENERATE")
        self.assertTrue(entry.metadata.source_ref.endswith("#gta-r1-07"))
        self.assertIsNone(entry.metadata.mechanics)
        self.assertIsNone(entry.metadata.approved_by)
        self.assertIn(f"> {PROMPT}", entry.content)
        self.assertIn("- Lesson: Shallow identification of a prop.", entry.content)
        # The historical entry is untouched.
        self.assertIn("gta-grove-street-ambiguity", entries)
        self.assertTrue(self.text(GTA).startswith((REPO / GTA).read_text(encoding="utf-8").rstrip("\n")))

    def test_validator_accepts_the_recorded_file(self) -> None:
        self.gta()
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "validate_exemplar_metadata.py"),
             str(self.root / GTA), "--manifest", str(self.root / MANIFEST)],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["untargetedApproved"], [])

    # 4-5 -------------------------------------------------------------------
    def test_rejection_is_never_a_positive_exemplar_for_any_mechanic(self) -> None:
        before = self.text(GTA)
        self.gta()
        after = self.text(GTA)
        for mechanic in self.manifest["mechanics"]:
            old = resolve_exemplar_document(before, mechanic_key=mechanic, known_mechanics=self.manifest["mechanics"])
            new = resolve_exemplar_document(after, mechanic_key=mechanic, known_mechanics=self.manifest["mechanics"])
            self.assertEqual(new.approved_text, old.approved_text, mechanic)
            self.assertNotIn(PROMPT, new.approved_text, mechanic)
            self.assertIn(PROMPT, new.historical_text, mechanic)

    # 9 ---------------------------------------------------------------------
    def test_recording_the_same_decision_again_changes_nothing(self) -> None:
        source = self.source()
        args = ("--world", "video-games", "--scope", "gta")
        self.assertEqual(self.record(source, *args)[0], 0)
        first = self.snapshot()
        code, out = self.record(source, *args)
        self.assertEqual(code, 0)
        self.assertIn("1 already recorded", out)
        self.assertEqual(self.snapshot(), first)
        self.assertEqual(self.text(GTA).count("gta-rejected-gta-r1-07"), 1)

    def test_a_different_status_for_the_same_item_is_refused(self) -> None:
        source = self.source()
        args = ("--world", "video-games", "--scope", "gta")
        self.record(source, *args)
        first = self.snapshot()
        code, out = self.record(source, *args, status="INVALID_TEST_SAMPLE")
        self.assertEqual(code, 1)
        self.assertIn("already recorded as REJECTED", out)
        self.assertEqual(self.snapshot(), first)

    def test_an_exemplar_id_already_in_use_is_refused(self) -> None:
        self.gta()
        first = self.snapshot()
        # Same item id from a different source: same exemplar id, other sourceRef.
        other = self.source()
        moved = Path(other).with_name("other-pack.source.json")
        Path(other).rename(moved)
        code, out = self.record(str(moved), "--world", "video-games", "--scope", "gta")
        self.assertEqual(code, 1)
        self.assertIn("already used by another entry", out)
        self.assertEqual(self.snapshot(), first)

    # 10 --------------------------------------------------------------------
    def test_existing_approved_and_withheld_entries_are_unchanged(self) -> None:
        targets = (("puzzles", "spot-the-error", SPOT), ("puzzles", "numbers-estimation", NUMBERS))
        for world, scope, relative in targets:
            before = self.text(relative)
            statuses = [(e.metadata.exemplar_id, e.metadata.status, e.metadata.mechanics)
                        for e in parse_exemplar_metadata(before)]
            code, _ = self.record(self.source(item_id=f"{scope}-x1"), "--world", world, "--scope", scope)
            self.assertEqual(code, 0)
            after = self.text(relative)
            self.assertEqual(
                [(e.metadata.exemplar_id, e.metadata.status, e.metadata.mechanics)
                 for e in parse_exemplar_metadata(after)][: len(statuses)],
                statuses,
            )
            for mechanic in self.manifest["mechanics"]:
                self.assertEqual(
                    resolve_exemplar_document(after, mechanic_key=mechanic).approved_text,
                    resolve_exemplar_document(before, mechanic_key=mechanic).approved_text,
                )

    def test_approved_decisions_never_touch_exemplars(self) -> None:
        before = self.snapshot()
        code, _ = self.record(self.source(), "--world", "video-games", "--scope", "gta", status="APPROVED")
        self.assertEqual(code, 0)
        self.assertEqual(self.text(GTA), before[GTA])

    # Fail-closed paths ------------------------------------------------------
    def test_a_rejection_without_a_known_scope_is_refused_not_skipped(self) -> None:
        before = self.snapshot()
        code, out = self.record(self.source())
        self.assertEqual(code, 1)
        self.assertIn("unknown World/Scope", out)
        self.assertEqual(self.snapshot(), before)

    def test_a_rejection_must_keep_do_not_regenerate(self) -> None:
        before = self.snapshot()
        argv = ["--source", self.source(), "--status", "REJECTED", "--reuse-policy", "REFERENCE_ONLY",
                "--world", "video-games", "--scope", "gta", "--root", str(self.root)]
        with redirect_stdout(io.StringIO()):
            self.assertEqual(recorder.main(argv), 1)
        self.assertEqual(self.snapshot(), before)

    def test_a_comment_marker_in_recorded_text_is_refused(self) -> None:
        before = self.snapshot()
        code, _ = self.gta(prompt="سؤال --> يكسر العلامة")
        self.assertEqual(code, 1)
        self.assertEqual(self.snapshot(), before)

    def test_context_and_flags_must_agree(self) -> None:
        source = self.source(_authoringContext={"worldKey": "video-games", "scopeKey": "gta"})
        code, out = self.record(source, "--world", "video-games", "--scope", "fifa")
        self.assertEqual(code, 1)
        self.assertIn("contradicts _authoringContext", out)

    # History ----------------------------------------------------------------
    def test_history_keeps_its_format_and_records_the_item_once(self) -> None:
        original = json.loads(self.text(HISTORY))
        source = self.source()
        self.record(source, "--world", "video-games", "--scope", "gta")
        self.record(source, "--world", "video-games", "--scope", "gta")
        written = self.text(HISTORY)
        history = json.loads(written)
        self.assertEqual(written, json.dumps(history))
        self.assertEqual(len(history["concepts"]), len(original["concepts"]) + 1)
        self.assertEqual(history["concepts"][-1]["itemId"], "gta-r1-07")

    def test_a_scope_without_exemplars_gets_a_canonical_file(self) -> None:
        code, _ = self.record(self.source(item_id="pl-01"), "--world", "football", "--scope", "premier-league")
        self.assertEqual(code, 0)
        entries = parse_exemplar_metadata(self.text(PREMIER))
        self.assertEqual([(e.metadata.exemplar_id, e.metadata.status) for e in entries],
                         [("premier-league-rejected-pl-01", "REJECTED")])

    # On-demand file creation --------------------------------------------------
    def files(self) -> set[str]:
        return {str(p.relative_to(self.root)) for p in self.root.rglob("*") if p.is_file()}

    def test_no_exemplars_file_exists_until_an_actual_rejection(self) -> None:
        self.assertFalse((self.root / PREMIER).exists())
        source = self.source(item_id="pl-01")
        # An approval writes history only.
        self.record(source, "--world", "football", "--scope", "premier-league", status="APPROVED")
        self.assertFalse((self.root / PREMIER).exists())
        # A refused rejection writes nothing.
        argv = ["--source", source, "--status", "REJECTED", "--reuse-policy", "REFERENCE_ONLY",
                "--world", "football", "--scope", "premier-league", "--root", str(self.root)]
        with redirect_stdout(io.StringIO()):
            self.assertEqual(recorder.main(argv), 1)
        self.assertFalse((self.root / PREMIER).exists())

    def test_created_file_is_canonical_validated_and_not_duplicated(self) -> None:
        source = self.source(item_id="pl-01")
        before = self.files()
        args = ("--world", "football", "--scope", "premier-league")
        self.assertEqual(self.record(source, *args)[0], 0)
        # Only the manifest-defined file is new; history already existed.
        self.assertEqual(self.files() - before, {PREMIER})
        text = self.text(PREMIER)
        self.assertTrue(text.startswith("# Scope Exemplars: premier-league\n"))
        [entry] = parse_exemplar_metadata(text)
        self.assertEqual(entry.metadata.status, "REJECTED")
        self.assertIsNone(entry.metadata.mechanics)
        self.assertIsNone(entry.metadata.approved_by)
        self.assertIsNone(entry.metadata.approved_at)
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "validate_exemplar_metadata.py"),
             str(self.root / PREMIER), "--manifest", str(self.root / MANIFEST)],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(self.record(source, *args)[0], 0)
        self.assertEqual(self.text(PREMIER), text)

    def test_unknown_or_mismatched_world_and_scope_are_refused(self) -> None:
        source = self.source()
        before, files = self.snapshot(), self.files()
        for world, scope in (("nope", "premier-league"), ("football", "nope"),
                             ("football", "gta"), ("..", "gta"), ("video-games", "../gta")):
            code, out = self.record(source, "--world", world, "--scope", scope)
            self.assertEqual(code, 1, (world, scope))
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.files(), files)

    def test_an_escaping_or_redirected_manifest_path_is_refused(self) -> None:
        manifest_path = self.root / MANIFEST
        original = manifest_path.read_text(encoding="utf-8")
        for bad in ("../../escape/EXEMPLARS.md",
                    "ai/.opencode/skills/worlds/video-games/scopes/gta/EXEMPLARS.md",
                    str(self.root / PREMIER) + "/../../../outside.md"):
            manifest = json.loads(original)
            manifest["scopes"]["football/premier-league"]["exemplarsPath"] = bad
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            source = self.source(item_id="pl-01")
            before, files = self.snapshot(), self.files()
            code, out = self.record(source, "--world", "football", "--scope", "premier-league")
            self.assertEqual(code, 1, bad)
            self.assertIn("not the canonical Scope location", out)
            self.assertEqual(self.snapshot(), before)
            self.assertEqual(self.files(), files)
        self.assertFalse((self.root.parent / "escape").exists())

    # Partial-write recovery ---------------------------------------------------
    def test_a_failed_history_write_is_completed_by_rerunning(self) -> None:
        source = self.source()
        args = ("--world", "video-games", "--scope", "gta")
        history_before = json.loads(self.text(HISTORY))
        real_write = recorder.write_atomic

        def fail_history(path, text):
            if path.name == "authoring-concept-history.json":
                raise OSError("disk full")
            real_write(path, text)

        recorder.write_atomic = fail_history
        try:
            code, out = self.record(source, *args)
        finally:
            recorder.write_atomic = real_write
        self.assertEqual(code, 1)
        self.assertIn("Re-run the same command", out)
        self.assertEqual(self.text(GTA).count("gta-rejected-gta-r1-07"), 1)
        self.assertEqual(json.loads(self.text(HISTORY)), history_before)

        code, out = self.record(source, *args)
        self.assertEqual(code, 0)
        self.assertEqual(self.text(GTA).count("gta-rejected-gta-r1-07"), 1)
        history = json.loads(self.text(HISTORY))
        self.assertEqual(len(history["concepts"]), len(history_before["concepts"]) + 1)
        self.assertEqual(history["concepts"][-1]["itemId"], "gta-r1-07")

    def test_a_missing_exemplar_block_is_restored_without_duplicating_history(self) -> None:
        source = self.source()
        args = ("--world", "video-games", "--scope", "gta")
        original = self.text(GTA)
        self.record(source, *args)
        history = self.text(HISTORY)
        (self.root / GTA).write_text(original, encoding="utf-8")  # block lost, history kept
        code, out = self.record(source, *args)
        self.assertEqual(code, 0)
        self.assertIn("1 already recorded", out)
        self.assertEqual(self.text(GTA).count("gta-rejected-gta-r1-07"), 1)
        self.assertEqual(self.text(HISTORY), history)


if __name__ == "__main__":
    unittest.main()
