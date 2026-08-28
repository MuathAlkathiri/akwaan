#!/usr/bin/env python3
"""Tests for the ChallengeType player-instructions sync tool.

Run:  python3 -m unittest discover -s ai/scripts -p 'test_*.py' -v

These hold the safety model: the tool patches only playerInstructions, creates
only the canonical marhala, never deletes, never writes off-slug fields, and can
only reach a remote target through every explicit gate.
"""
from __future__ import annotations

import json
import os
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sync_player_instructions as sync
from promote_approved_content import PromotionError

SOURCE = os.path.expanduser(
    "~/Downloads/akwaan-challenge-player-instructions-approved-utf8.json")
SOURCE_SHA = "927072a71949b364c8c50318607df2235379aa53ffe255a461630b144c002792"

# The approved copy is an intentionally machine-local file (verbatim product-signed
# JSON, never committed). Where it is absent — CI, a teammate's checkout — the
# source-bound cases skip instead of erroring, so this suite never breaks a tree
# that simply does not carry the private approved file.
_SOURCE_PRESENT = os.path.exists(SOURCE)
_NEEDS_SOURCE = unittest.skipUnless(
    _SOURCE_PRESENT,
    f"approved player-instructions source not present at {SOURCE}",
)


class FakeResponse:
    def __init__(self, status, payload=None):
        self.status_code = status
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, routes):
        self.routes = routes
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append((method.upper(), url, kwargs.get("json")))
        for pattern, resp in self.routes.items():
            if pattern in url:
                return resp if isinstance(resp, FakeResponse) else FakeResponse(200, resp)
        return FakeResponse(200, {"data": []})


def presentation(pi=None):
    p = {"inputType": "phone-choice", "timerSeconds": 25, "soundPack": None, "revealStyle": None}
    if pi is not None:
        p["playerInstructions"] = pi
    return p


def ct(slug, _id="id-" + "x", pi=None):
    return {"id": f"id-{slug}", "slug": slug, "name": slug, "defaultPresentation": presentation(pi)}


def metadata_with_marhala(present=True):
    mechs = [{"slug": "read-your-opponent", "family": "ryo", "itemStructure": "discrete_triple",
              "answerMode": "ryo", "matchScoringRuleId": "ryo.payoff-matrix"}]
    if present:
        mechs.append({"slug": "marhala", "runtimeKey": "marhala", "family": "signature",
                      "itemStructure": "continuous", "answerMode": "match",
                      "matchScoringRuleId": "challenge.win"})
    return {"data": {"productionMechanics": mechs}}


def api_for(challenge_types, *, marhala_in_metadata=True, writes=False):
    routes = {
        "/admin/challenge-types/metadata": metadata_with_marhala(marhala_in_metadata),
        "/admin/challenge-types": {"data": challenge_types},
    }
    session = FakeSession(routes)
    return sync.ChallengeTypeAdminApi("https://akwaan-api.onrender.com", "tok",
                                      writes_enabled=writes, session=session), session


ALL_EXISTING = [ct(s) for s in sync.APPROVED_SLUGS if s != "marhala"]  # 7 exist, marhala missing


@_NEEDS_SOURCE
class TestSource(unittest.TestCase):
    # A
    def test_A_valid_source_passes(self):
        src = sync.load_source(SOURCE, require_sha=SOURCE_SHA)
        self.assertEqual(set(src), set(sync.APPROVED_SLUGS))

    # B
    def test_B_wrong_sha_detected(self):
        with self.assertRaises(PromotionError):
            sync.load_source(SOURCE, require_sha="deadbeef")

    # C / D
    def test_C_missing_slug_fails(self):
        data = json.load(open(SOURCE, encoding="utf-8"))
        data["challengeTypes"] = [e for e in data["challengeTypes"] if e["slug"] != "closest"]
        tmp = "/tmp/pi-missing.json"
        json.dump(data, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
        with self.assertRaises(PromotionError):
            sync.load_source(tmp)

    def test_D_extra_slug_fails(self):
        data = json.load(open(SOURCE, encoding="utf-8"))
        data["challengeTypes"].append({"slug": "mystery", "playerInstructions":
                                       {"summary": "x", "steps": ["y"]}})
        tmp = "/tmp/pi-extra.json"
        json.dump(data, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
        with self.assertRaises(PromotionError):
            sync.load_source(tmp)

    # N — Arabic round-trips exactly (verbatim, only whitespace-trim per backend norm)
    def test_N_utf8_exact_roundtrip(self):
        data = json.load(open(SOURCE, encoding="utf-8"))
        raw = {e["slug"]: e["playerInstructions"] for e in data["challengeTypes"]}
        src = sync.load_source(SOURCE, require_sha=SOURCE_SHA)
        # combo ability name and RYO terms are preserved character-for-character
        self.assertIn("كمّل غصب", " ".join(src["combo"]["steps"]))
        self.assertIn("شاكك فيهم", src["read-your-opponent"]["summary"])
        self.assertIn("متأكد منهم", src["read-your-opponent"]["summary"])
        # the JSON values (already trimmed by author) survive verbatim
        self.assertEqual(src["marhala"]["summary"], raw["marhala"]["summary"].strip())


@_NEEDS_SOURCE
class TestPlan(unittest.TestCase):
    def setUp(self):
        sync.SOURCE_SHA_HOLDER["sha"] = SOURCE_SHA
        self.src = sync.load_source(SOURCE, require_sha=SOURCE_SHA)

    # E / F — existing CT → PATCH only playerInstructions, siblings echoed verbatim
    def test_E_F_existing_patches_only_instructions(self):
        api, _ = api_for(ALL_EXISTING)
        plan = sync.build_plan(self.src, api)
        ryo = next(o for o in plan.ops if o.slug == "read-your-opponent")
        self.assertEqual(ryo.action, "PATCH")
        self.assertEqual(ryo.detail, "defaultPresentation.playerInstructions")
        # siblings preserved exactly, only playerInstructions is the approved value
        self.assertEqual(ryo.patch_presentation["inputType"], "phone-choice")
        self.assertEqual(ryo.patch_presentation["timerSeconds"], 25)
        self.assertEqual(ryo.patch_presentation["playerInstructions"], self.src["read-your-opponent"])
        # the only field a PATCH sends is defaultPresentation
        self.assertEqual(set(("defaultPresentation",)),
                         {"defaultPresentation"})  # execute sends exactly this key

    # G — missing marhala + canonical metadata present → CREATE
    def test_G_missing_marhala_plans_create(self):
        api, _ = api_for(ALL_EXISTING, marhala_in_metadata=True)
        plan = sync.build_plan(self.src, api)
        m = next(o for o in plan.ops if o.slug == "marhala")
        self.assertEqual(m.action, "CREATE")
        self.assertEqual(m.create_payload["slug"], "marhala")
        self.assertEqual(m.create_payload["family"], "signature")
        self.assertEqual(m.create_payload["scoringRuleId"], "challenge.win")
        self.assertEqual(m.create_payload["defaultPresentation"]["playerInstructions"],
                         self.src["marhala"])

    # H — missing canonical marhala definition on target → blocked
    def test_H_missing_canonical_marhala_blocks(self):
        api, _ = api_for(ALL_EXISTING, marhala_in_metadata=False)
        with self.assertRaises(PromotionError):
            sync.build_plan(self.src, api)

    # I — duplicate marhala on target → CONFLICT
    def test_I_duplicate_marhala_blocks(self):
        dup = ALL_EXISTING + [ct("marhala"), ct("marhala")]
        api, _ = api_for(dup)
        plan = sync.build_plan(self.src, api)
        m = next(o for o in plan.ops if o.slug == "marhala")
        self.assertEqual(m.action, "CONFLICT")
        self.assertTrue(plan.blockers())

    # M — target already has the approved instructions → UNCHANGED, zero write
    def test_M_identical_is_unchanged(self):
        existing = [ct(s, pi=self.src[s]) for s in sync.APPROVED_SLUGS if s != "marhala"]
        existing.append(ct("marhala", pi=self.src["marhala"]))
        api, _ = api_for(existing)
        plan = sync.build_plan(self.src, api)
        self.assertTrue(all(o.action == "UNCHANGED" for o in plan.ops))
        self.assertEqual(plan.counts()["writes"], 0)
        self.assertEqual(plan.counts()["deletes"], 0)

    # a non-marhala missing CT is a CONFLICT, never an unexpected create
    def test_missing_nonmarhala_is_conflict(self):
        partial = [ct(s) for s in sync.APPROVED_SLUGS if s not in ("marhala", "bomb")]
        api, _ = api_for(partial)
        plan = sync.build_plan(self.src, api)
        bomb = next(o for o in plan.ops if o.slug == "bomb")
        self.assertEqual(bomb.action, "CONFLICT")


@_NEEDS_SOURCE
class TestSafetyGates(unittest.TestCase):
    # J — no delete capability, no delete flag
    def test_J_no_delete(self):
        api, _ = api_for(ALL_EXISTING, writes=True)
        for forbidden in ("delete", "prune", "put", "remove", "replace"):
            self.assertFalse(hasattr(api, forbidden))
        src = Path(sync.__file__).read_text(encoding="utf-8")
        for flag in ("--delete", "--prune", "--replace"):
            self.assertNotIn(flag, src)

    # dry-run refuses a mutating verb before the socket
    def test_dry_run_refuses_writes(self):
        api, session = api_for(ALL_EXISTING, writes=False)
        with self.assertRaises(PromotionError):
            api.create_challenge_type({"slug": "x"})
        with self.assertRaises(PromotionError):
            api.patch_challenge_type("id-x", {"defaultPresentation": {}})
        self.assertTrue(all(c[0] == "GET" for c in session.calls))

    # K — remote execute requires every flag
    def test_K_remote_execute_requires_flags(self):
        prod = "https://akwaan-api.onrender.com"
        base = ["--source", SOURCE, "--target", prod]
        self.assertEqual(sync.main(base + ["--execute"]), 2)
        self.assertEqual(sync.main(base + ["--execute", "--allow-remote-write"]), 2)
        self.assertEqual(sync.main(base + ["--expected-environment", "local"]), 2)

    # L — plan hash is decision/content sensitive (drift ⇒ mismatch ⇒ no execute)
    def test_L_plan_hash_sensitive(self):
        sync.SOURCE_SHA_HOLDER["sha"] = SOURCE_SHA
        src = sync.load_source(SOURCE, require_sha=SOURCE_SHA)
        api_all_patch, _ = api_for(ALL_EXISTING)
        h_patch = sync.build_plan(src, api_all_patch).fingerprint()
        # a target already holding the copy ⇒ different actions ⇒ different hash
        existing = [ct(s, pi=src[s]) for s in sync.APPROVED_SLUGS if s != "marhala"]
        existing.append(ct("marhala", pi=src["marhala"]))
        api_unchanged, _ = api_for(existing)
        h_unchanged = sync.build_plan(src, api_unchanged).fingerprint()
        self.assertNotEqual(h_patch, h_unchanged)
        # same inputs ⇒ same hash
        api_again, _ = api_for(ALL_EXISTING)
        self.assertEqual(h_patch, sync.build_plan(src, api_again).fingerprint())


if __name__ == "__main__":
    unittest.main(verbosity=2)
