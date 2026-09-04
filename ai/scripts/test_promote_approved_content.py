#!/usr/bin/env python3
"""Tests for the selective production content importer.

Run:  python3 -m unittest discover -s ai/scripts -p 'test_*.py' -v

What these hold down is the *safety model*, not the happy path: a remote target
cannot be written to by accident, a dry-run cannot reach a mutating verb, and the
allowlist cannot be widened by whatever happens to be sitting in the source
runtime. Every test drives the real code with fake transports — no runtime, no
network, no database.
"""

from __future__ import annotations

import json
import os
import tempfile
import unittest
import unittest.mock
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import promote_approved_content as promoter


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #

class FakeResponse:
    def __init__(self, status: int, payload=None, headers=None):
        self.status_code = status
        self._payload = payload if payload is not None else {}
        self.headers = headers or {}
        self.content = b"x" * 10
        self.text = json.dumps(self._payload)

    def json(self):
        return self._payload

    def close(self):
        pass


class FakeSession:
    """Records every request (and body) and answers from a routing table."""

    def __init__(self, routes: dict[str, object] | None = None):
        self.routes = routes or {}
        self.calls: list[tuple[str, str]] = []
        self.bodies: list[dict] = []

    def request(self, method, url, **kwargs):
        self.calls.append((method.upper(), url))
        if kwargs.get("json") is not None:
            self.bodies.append(kwargs["json"])
        for pattern, response in self.routes.items():
            if pattern in url:
                return response if isinstance(response, FakeResponse) else FakeResponse(200, response)
        return FakeResponse(200, {"data": []})

    def get(self, url, **kwargs):
        return self.request("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self.request("POST", url, **kwargs)


def api(base="http://localhost:3002", *, writes=False, routes=None):
    session = FakeSession(routes)
    client = promoter.AdminApi(base, "token", writes_enabled=writes, session=session)
    return client, session


def item(marker="anime-scope-expansion-2026-08-20:x-1", scope="dragon-ball",
         mechanics=("read-your-opponent",), media=None, payload=None):
    return promoter.ManifestItem(
        source_marker=marker,
        world_slug="world-1785615381449",
        scope_slug=scope,
        mechanic_slugs=tuple(mechanics),
        payload=payload or {"prompt": {"ar": "س"}, "answerPayload": {"mode": "match", "acceptedAnswers": ["ج"]},
                            "mechanicPayload": None, "media": None, "status": "ready",
                            "metadata": {"source": marker}},
        media_path=media,
    )


def manifest(milestone_key="anime-expansion", items=None):
    milestone = promoter.MILESTONES[milestone_key]
    return promoter.Manifest(milestone=milestone, world_slugs=("world-1785615381449",),
                             scope_slugs=milestone.scope_slugs, items=items or [])


# --------------------------------------------------------------------------- #

class TestRemoteWriteProtection(unittest.TestCase):
    """1. A remote target refuses writes without the explicit flags."""

    def test_remote_execute_without_flag_is_refused(self):
        code = promoter.main([
            "--milestone", "anime-expansion",
            "--target", "https://akwaan-api.onrender.com",
            "--execute",
        ])
        self.assertEqual(code, 2)

    def test_remote_execute_requires_expected_environment(self):
        code = promoter.main([
            "--milestone", "anime-expansion",
            "--target", "https://akwaan-api.onrender.com",
            "--execute", "--allow-remote-write",
        ])
        self.assertEqual(code, 2)

    def test_expected_environment_must_match_the_host(self):
        code = promoter.main([
            "--milestone", "anime-expansion",
            "--target", "http://localhost:3002",
            "--expected-environment", "production",
        ])
        self.assertEqual(code, 2)

    def test_remote_write_cannot_skip_the_media_gate(self):
        code = promoter.main([
            "--milestone", "anime-expansion",
            "--target", "https://akwaan-api.onrender.com",
            "--execute", "--allow-remote-write",
            "--expected-environment", "production",
            "--skip-media-check",
        ])
        self.assertEqual(code, 2)

    def test_environment_classification(self):
        self.assertEqual(promoter.classify_environment("http://localhost:3002"), "local")
        self.assertEqual(promoter.classify_environment("http://127.0.0.1:3002"), "local")
        self.assertEqual(promoter.classify_environment("https://akwaan-api.onrender.com"), "production")
        self.assertEqual(promoter.classify_environment("https://staging.example.com"), "unknown")
        self.assertTrue(promoter.is_remote("https://akwaan-api.onrender.com"))
        self.assertFalse(promoter.is_remote("http://localhost:3002"))


class TestDryRunMakesNoWrites(unittest.TestCase):
    """2. Dry-run cannot issue a mutating verb — the guard is in the transport."""

    def test_mutating_verbs_raise_before_the_socket(self):
        client, session = api(writes=False)
        for verb in ("POST", "PUT", "PATCH", "DELETE"):
            with self.assertRaises(promoter.PromotionError):
                client._request(verb, "/admin/content-items")
        self.assertEqual(session.calls, [], "a read-only client must not reach the transport")

    def test_reads_are_allowed(self):
        client, session = api(writes=False, routes={"/admin/worlds": {"data": [{"id": "1", "slug": "w"}]}})
        self.assertEqual(client.get("/admin/worlds"), [{"id": "1", "slug": "w"}])
        self.assertEqual([c[0] for c in session.calls], ["GET"])

    def test_client_exposes_no_delete_capability(self):
        client, _ = api(writes=True)
        for forbidden in ("delete", "prune", "replace", "sync_delete", "put", "patch"):
            self.assertFalse(hasattr(client, forbidden), f"client must not expose .{forbidden}()")

    def test_no_delete_flags_exist_in_the_cli(self):
        source = Path(promoter.__file__).read_text(encoding="utf-8")
        for flag in ("--delete", "--prune", "--replace-all", "--sync-delete"):
            self.assertNotIn(flag, source)


class TestAllowlistExcludesMarhala(unittest.TestCase):
    """3. Marhala fails the manifest — it is never silently skipped."""

    def test_marhala_mechanic_fails_the_manifest(self):
        bad = manifest(items=[item(mechanics=("marhala",))])
        with self.assertRaises(promoter.PromotionError) as caught:
            promoter.assert_manifest_is_clean(bad)
        self.assertIn("marhala", str(caught.exception))

    def test_marhala_payload_fails_even_under_another_mechanic(self):
        sneaky = item(payload={"prompt": {"ar": "س"},
                               "answerPayload": {"mode": "match", "acceptedAnswers": ["ج"]},
                               "mechanicPayload": {"marhalaDifficulty": "easy"},
                               "metadata": {"source": "anime-scope-expansion-2026-08-20:x-1"}})
        with self.assertRaises(promoter.PromotionError) as caught:
            promoter.assert_manifest_is_clean(manifest(items=[sneaky]))
        self.assertIn("marhalaDifficulty", str(caught.exception))

    def test_smoke_fixture_markers_fail_the_manifest(self):
        for marker in ("local-dev-marhala-smoke-fixture",
                       "local-dev-combo-smoke-fixture",
                       "marhala-multimodal-pilot-2026-08-21:1"):
            with self.assertRaises(promoter.PromotionError):
                promoter.assert_manifest_is_clean(manifest(items=[item(marker=marker)]))

    def test_no_milestone_names_an_excluded_scope(self):
        allowed = {s for m in promoter.MILESTONES.values() for s in m.scope_slugs}
        # Genuinely unrelated scopes are still named by no milestone.
        for excluded in ("patterns-sequences", "lateral-thinking", "visual-puzzles",
                         "naruto", "one-piece"):
            self.assertNotIn(excluded, allowed)
        # The Video Games scopes are now allowed — but ONLY through the explicit
        # approved Marhala milestone, never through Anime or Football.
        vg_scopes = {"call-of-duty", "fifa", "gta", "overwatch"}
        self.assertEqual(set(promoter.MILESTONES["marhala-video-games-batch-01"].scope_slugs),
                         vg_scopes)
        fb_r1_scopes = {"premier-league", "champions-league", "world-cup"}
        self.assertEqual(set(promoter.MILESTONES["football-bomb-r1"].scope_slugs),
                         fb_r1_scopes)
        spl_r1_scopes = {"saudi-league"}
        self.assertEqual(set(promoter.MILESTONES["saudi-league-bomb-r1"].scope_slugs),
                         spl_r1_scopes)
        # The four canonical Music scopes joined the allowlist with the Music
        # milestones (§25 taxonomy). They are named here for the same reason as
        # every other set above: a scope may only reach Production through a
        # milestone that says so out loud.
        music_scopes = {"saudi-music", "gulf-music", "egyptian-music",
                        "international-music"}
        self.assertEqual(allowed, {"dragon-ball", "demon-slayer", "jujutsu-kaisen",
                                   "la-liga", "serie-a", "football-legends"}
                         | vg_scopes | fb_r1_scopes | spl_r1_scopes | music_scopes)



class TestAllowlistExcludesUnrelatedContent(unittest.TestCase):
    """4. A foreign scope or marker fails the manifest."""

    def test_scope_outside_the_allowlist_fails(self):
        with self.assertRaises(promoter.PromotionError) as caught:
            promoter.assert_manifest_is_clean(manifest(items=[item(scope="naruto")]))
        self.assertIn("allowlist", str(caught.exception))

    def test_foreign_source_marker_fails(self):
        with self.assertRaises(promoter.PromotionError) as caught:
            promoter.assert_manifest_is_clean(manifest(items=[item(marker="combo-anime:abc")]))
        self.assertIn("source marker", str(caught.exception))

    def test_count_mismatch_fails_rather_than_promoting_a_partial_set(self):
        milestone = promoter.MILESTONES["anime-expansion"]
        short = manifest(items=[item(marker=f"{milestone.source_prefix}:{n}") for n in range(3)])
        with self.assertRaises(promoter.PromotionError) as caught:
            promoter.assert_manifest_is_clean(short)
        self.assertIn("item count", str(caught.exception))


class TestIdempotency(unittest.TestCase):
    """5 & 8. An existing source marker is reused, never duplicated."""

    def test_existing_marker_plans_as_exists_not_create(self):
        marker = "anime-scope-expansion-2026-08-20:x-1"
        index = promoter.RuntimeIndex(
            worlds_by_slug={"w": {"id": "world1", "slug": "w"}},
            challenge_types_by_slug={"read-your-opponent": {"id": "ct1", "slug": "read-your-opponent"}},
            challenge_type_slug_by_id={"ct1": "read-your-opponent"})
        entry = item(marker=marker)
        entry.world_slug = "w"
        target, _ = api(routes={
            "/admin/worlds/world1/scopes": {"data": [{"id": "sc1", "slug": "dragon-ball",
                                                     "worldId": "world1", "name": "دراغون بول"}]},
            "/admin/content-items?worldId=world1": {"data": [
                {"id": "existing", "scopeId": "sc1", "metadata": {"source": marker}}]},
        })
        source, _ = api(routes={
            "/admin/worlds/world1/scopes": {"data": [{"id": "sc1", "slug": "dragon-ball",
                                                      "worldId": "world1", "name": "دراغون بول"}]}})
        man = promoter.Manifest(milestone=promoter.MILESTONES["anime-expansion"],
                                world_slugs=("w",), scope_slugs=("dragon-ball",), items=[entry])
        plan = promoter.build_plan(man, source, index, target, index, check_media=False)
        self.assertEqual(plan.items[0].action, "EXISTS_IDENTICAL")
        self.assertEqual(plan.counts()["writes"], 0)
        self.assertEqual(plan.counts()["deletes"], 0)

    def test_duplicate_markers_in_one_manifest_fail(self):
        milestone = promoter.MILESTONES["anime-expansion"]
        dupes = [item(marker=f"{milestone.source_prefix}:same") for _ in range(2)]
        with self.assertRaises(promoter.PromotionError) as caught:
            promoter.assert_manifest_is_clean(manifest(items=dupes))
        self.assertIn("duplicate source markers", str(caught.exception))


class TestScopeConflict(unittest.TestCase):
    """6. A conflicting Scope blocks promotion — no `dragon-ball-2` fallback."""

    def test_name_mismatch_is_a_conflict(self):
        index = promoter.RuntimeIndex(
            worlds_by_slug={"w": {"id": "world1", "slug": "w"}},
            challenge_types_by_slug={}, challenge_type_slug_by_id={})
        source, _ = api(routes={"/admin/worlds/world1/scopes": {"data": [
            {"id": "s-src", "slug": "dragon-ball", "worldId": "world1", "name": "دراغون بول"}]}})
        target, _ = api(routes={"/admin/worlds/world1/scopes": {"data": [
            {"id": "s-tgt", "slug": "dragon-ball", "worldId": "world1", "name": "Something Else"}]}})
        man = promoter.Manifest(milestone=promoter.MILESTONES["anime-expansion"],
                                world_slugs=("w",), scope_slugs=("dragon-ball",), items=[])
        plan = promoter.build_plan(man, source, index, target, index, check_media=False)
        self.assertEqual(plan.scopes[0].action, "CONFLICT")
        self.assertTrue(plan.blockers())
        with self.assertRaises(promoter.PromotionError):
            promoter.execute_plan(plan, target, index)

    def test_scope_is_created_with_the_slug_verbatim(self):
        """No `dragon-ball-2` fallback: the slug posted is the slug planned."""
        index = promoter.RuntimeIndex(
            worlds_by_slug={"w": {"id": "world1", "slug": "w"}},
            challenge_types_by_slug={}, challenge_type_slug_by_id={})
        target, session = api(writes=True, routes={
            "/admin/worlds/world1/scopes": FakeResponse(201, {"data": {"id": "new-scope"}})})
        plan = promoter.Plan("anime-expansion", "http://localhost:3002", "local",
                             "http://localhost:3002", "abc",
                             [promoter.ScopePlan("dragon-ball", "w", "CREATE",
                                                 source_scope={"name": "دراغون بول",
                                                               "status": "active"})],
                             [], "now")
        promoter.execute_plan(plan, target, index)
        posted = session.bodies[0]
        self.assertEqual(posted["slug"], "dragon-ball")
        self.assertEqual(posted["name"], "دراغون بول")


class TestMediaGate(unittest.TestCase):
    """7. A Bomb item without production-accessible media blocks the plan."""

    def test_missing_media_blocks(self):
        entry = item(mechanics=("bomb",), media="/uploads/question-assets/images/x.webp")
        entry.media_state = "MEDIA_MISSING"
        entry.action = "CREATE"
        plan = promoter.Plan("anime-expansion", "https://akwaan-api.onrender.com", "production",
                             "http://localhost:3002", "abc", [], [entry], "now")
        self.assertTrue(any("media MEDIA_MISSING" in b for b in plan.blockers()))
        with self.assertRaises(promoter.PromotionError):
            promoter.execute_plan(plan, api(writes=True)[0],
                                  promoter.RuntimeIndex({}, {}, {}))

    def test_text_bomb_without_media_is_valid(self):
        index = promoter.RuntimeIndex({}, {"bomb": {"id": "ct", "slug": "bomb"}}, {"ct": "bomb"})
        self.assertIsNone(promoter.validate_item(item(mechanics=("bomb",)), index))

    def test_bomb_with_media_problem_is_invalid(self):
        index = promoter.RuntimeIndex({}, {"bomb": {"id": "ct", "slug": "bomb"}}, {"ct": "bomb"})
        entry = item(mechanics=("bomb",), media="/uploads/x.webp")
        entry.media_problem = "media asset carries unsupported field(s)"
        self.assertEqual(promoter.validate_item(entry, index),
                         "media asset carries unsupported field(s)")

    def test_unchecked_media_is_not_a_blocker_but_is_visible(self):
        """A skipped check must not masquerade as a failure — or as a pass."""
        entry = item(mechanics=("bomb",), media="/uploads/x.webp")
        entry.media_state = "MEDIA_UNCHECKED"
        entry.action = "CREATE"
        plan = promoter.Plan("anime-expansion", "http://localhost:3999", "local",
                             "http://localhost:3002", "abc", [], [entry], "now")
        self.assertEqual(plan.blockers(), [])
        self.assertEqual(plan.counts()["media"], {"MEDIA_UNCHECKED": 1})

    def test_missing_and_invalid_media_still_block(self):
        for state in ("MEDIA_MISSING", "MEDIA_INVALID"):
            entry = item(mechanics=("bomb",), media="/uploads/x.webp")
            entry.media_state = state
            entry.action = "CREATE"
            plan = promoter.Plan("anime-expansion", "https://akwaan-api.onrender.com", "production",
                                 "http://localhost:3002", "abc", [], [entry], "now")
            self.assertTrue(plan.blockers(), f"{state} must block")

    def test_media_state_classification(self):
        ok, _ = api(routes={"/uploads/a.webp": FakeResponse(200, {}, {"content-type": "image/webp",
                                                                     "content-length": "1234"})})
        self.assertEqual(ok.media_state("/uploads/a.webp"), "MEDIA_OK")
        gone, _ = api(routes={"/uploads/b.webp": FakeResponse(404, {}, {})})
        self.assertEqual(gone.media_state("/uploads/b.webp"), "MEDIA_MISSING")
        html, _ = api(routes={"/uploads/c.webp": FakeResponse(200, {}, {"content-type": "text/html",
                                                                       "content-length": "50"})})
        self.assertEqual(html.media_state("/uploads/c.webp"), "MEDIA_INVALID")


class TestCanonicalMedia(unittest.TestCase):
    """The read shape is projected onto the write contract, losing nothing real."""

    def test_redundant_per_asset_type_is_dropped(self):
        payload, problem = promoter.canonical_media(
            {"type": "image", "assets": [{"type": "image", "url": "/uploads/a.webp"}]})
        self.assertIsNone(problem)
        self.assertEqual(payload, {"type": "image", "assets": [{"url": "/uploads/a.webp"}]})

    def test_alt_text_is_preserved(self):
        payload, problem = promoter.canonical_media(
            {"type": "image", "assets": [{"url": "/uploads/a.webp", "altText": "goku"}]})
        self.assertIsNone(problem)
        self.assertEqual(payload["assets"][0]["altText"], "goku")

    def test_disagreeing_asset_type_is_refused_not_dropped(self):
        payload, problem = promoter.canonical_media(
            {"type": "image", "assets": [{"type": "audio", "url": "/uploads/a.webp"}]})
        self.assertIsNone(payload)
        self.assertIn("disagrees", problem)

    def test_unknown_asset_field_fails_rather_than_being_discarded(self):
        payload, problem = promoter.canonical_media(
            {"type": "image", "assets": [{"url": "/uploads/a.webp", "durationMs": 1200}]})
        self.assertIsNone(payload)
        self.assertIn("durationMs", problem)

    def test_media_problem_makes_the_item_invalid(self):
        entry = item(mechanics=("bomb",), media="/uploads/a.webp")
        entry.media_problem = "media asset carries unsupported field(s) ['x']"
        index = promoter.RuntimeIndex({}, {"bomb": {"id": "b", "slug": "bomb"}}, {"b": "bomb"})
        self.assertEqual(promoter.validate_item(entry, index), entry.media_problem)


class TestMechanicValidation(unittest.TestCase):
    """11. Malformed source data is INVALID rather than promoted."""

    def setUp(self):
        self.index = promoter.RuntimeIndex(
            {}, {"combo": {"id": "c", "slug": "combo"}, "top-5": {"id": "t", "slug": "top-5"},
                 "closest": {"id": "cl", "slug": "closest"},
                 "read-your-opponent": {"id": "r", "slug": "read-your-opponent"}},
            {"c": "combo", "t": "top-5", "cl": "closest", "r": "read-your-opponent"})

    def test_combo_needs_a_valid_stage(self):
        bad = item(mechanics=("combo",), payload={
            "prompt": {"ar": "س"}, "answerPayload": {"mode": "match", "acceptedAnswers": ["ج"]},
            "mechanicPayload": {"comboStage": 9}, "metadata": {}})
        self.assertEqual(promoter.validate_item(bad, self.index), "combo item without a valid stage")

    def test_top5_needs_its_deck(self):
        bad = item(mechanics=("top-5",), payload={
            "prompt": {"ar": "س"}, "answerPayload": {"mode": "top_5"},
            "mechanicPayload": {}, "metadata": {}})
        self.assertEqual(promoter.validate_item(bad, self.index), "top-5 item without its ranked deck")

    def test_unknown_mechanic_on_target_is_invalid(self):
        self.assertIn("no ChallengeType", promoter.validate_item(item(mechanics=("nope",)), self.index))

    def test_answer_payload_shapes(self):
        empty_match = item(payload={"prompt": {"ar": "س"},
                                    "answerPayload": {"mode": "match", "acceptedAnswers": []},
                                    "metadata": {}})
        self.assertEqual(promoter.validate_item(empty_match, self.index),
                         "match answer with no accepted answers")
        no_value = item(mechanics=("closest",), payload={
            "prompt": {"ar": "س"}, "answerPayload": {"mode": "closest"}, "metadata": {}})
        self.assertEqual(promoter.validate_item(no_value, self.index),
                         "closest answer with no correct value")


class TestPasswordlessAuthentication(unittest.TestCase):
    """The importer uses the product's real login: OTP -> bearer token.

    Akwaan admin accounts are passwordless. These hold that the tool requests a
    code, exchanges it, verifies the resulting identity is actually an admin, and
    never lets the code or the token reach output.
    """

    ADMIN = {"data": {"id": "u1", "email": "admin@akwaan.test", "role": "admin"}}

    def _auth(self, routes, *, role="TARGET", base="https://akwaan-api.onrender.com",
              interactive=True):
        session = FakeSession(routes)
        return promoter.Authenticator(role, base, interactive=interactive,
                                     session=session), session

    def setUp(self):
        for key in ("AKWAAN_TARGET_ADMIN_TOKEN", "AKWAAN_TARGET_ADMIN_EMAIL",
                    "AKWAAN_TARGET_ADMIN_PASSWORD"):
            os.environ.pop(key, None)

    def test_otp_flow_requests_a_code_then_exchanges_it(self):
        auth, session = self._auth({
            "/auth/otp/request": FakeResponse(201, {"status": "sent", "channel": "email",
                                                    "expiresInSeconds": 300}),
            "/auth/otp/verify": FakeResponse(201, {"accessToken": "tok-abc", "user": {},
                                                   "isNewUser": False}),
            "/auth/me": FakeResponse(200, self.ADMIN),
        })
        os.environ["AKWAAN_TARGET_ADMIN_EMAIL"] = "admin@akwaan.test"
        with unittest.mock.patch("getpass.getpass", return_value="123456"):
            token = auth.token()
        self.assertEqual(token, "tok-abc")
        paths = [url.split(".com")[-1] for _, url in session.calls]
        self.assertEqual(paths, ["/auth/otp/request", "/auth/otp/verify", "/auth/me"])
        self.assertEqual(session.bodies[0], {"identifier": "admin@akwaan.test"})
        self.assertEqual(session.bodies[1], {"identifier": "admin@akwaan.test", "code": "123456"})

    def test_a_newly_created_account_is_refused_loudly(self):
        """A typo'd email registers a role=user account — that must not pass."""
        auth, _ = self._auth({
            "/auth/otp/request": FakeResponse(201, {"status": "sent", "channel": "email"}),
            "/auth/otp/verify": FakeResponse(201, {"accessToken": "tok", "isNewUser": True}),
        })
        os.environ["AKWAAN_TARGET_ADMIN_EMAIL"] = "typo@akwaan.test"
        with unittest.mock.patch("getpass.getpass", return_value="123456"):
            with self.assertRaises(promoter.PromotionError) as caught:
                auth.token()
        self.assertIn("created a new passwordless one", str(caught.exception))

    def test_non_admin_role_is_refused(self):
        auth, _ = self._auth({
            "/auth/otp/request": FakeResponse(201, {"status": "sent"}),
            "/auth/otp/verify": FakeResponse(201, {"accessToken": "tok", "isNewUser": False}),
            "/auth/me": FakeResponse(200, {"data": {"role": "user", "email": "x@y.z"}}),
        })
        os.environ["AKWAAN_TARGET_ADMIN_EMAIL"] = "player@akwaan.test"
        with unittest.mock.patch("getpass.getpass", return_value="123456"):
            with self.assertRaises(promoter.PromotionError) as caught:
                auth.token()
        self.assertIn("cannot reach /admin/*", str(caught.exception))

    def test_malformed_code_never_reaches_the_api(self):
        auth, session = self._auth({
            "/auth/otp/request": FakeResponse(201, {"status": "sent"}),
        })
        os.environ["AKWAAN_TARGET_ADMIN_EMAIL"] = "admin@akwaan.test"
        with unittest.mock.patch("getpass.getpass", return_value="12ab"):
            with self.assertRaises(promoter.PromotionError):
                auth.token()
        self.assertNotIn("/auth/otp/verify", [url for _, url in session.calls][-1])

    def test_no_password_is_ever_requested_for_a_remote_target(self):
        auth, _ = self._auth({})
        os.environ["AKWAAN_TARGET_ADMIN_EMAIL"] = "admin@akwaan.test"
        os.environ["AKWAAN_TARGET_ADMIN_PASSWORD"] = "should-not-be-used"
        with self.assertRaises(promoter.PromotionError) as caught:
            auth.token()
        self.assertIn("passwordless", str(caught.exception))

    def test_password_still_works_for_a_local_runtime(self):
        auth, session = self._auth({
            "/auth/login": FakeResponse(201, {"accessToken": "local-tok"}),
            "/auth/me": FakeResponse(200, self.ADMIN),
        }, base="http://localhost:3002")
        os.environ["AKWAAN_TARGET_ADMIN_EMAIL"] = "admin@local"
        os.environ["AKWAAN_TARGET_ADMIN_PASSWORD"] = "local-only"
        self.assertEqual(auth.token(), "local-tok")
        self.assertIn("/auth/login", [url for _, url in session.calls][0])

    def test_token_override_is_still_identity_checked(self):
        auth, session = self._auth({"/auth/me": FakeResponse(200, self.ADMIN)})
        os.environ["AKWAAN_TARGET_ADMIN_TOKEN"] = "provided-token"
        self.assertEqual(auth.token(), "provided-token")
        self.assertEqual([m for m, _ in session.calls], ["GET"])

    def test_non_interactive_without_a_token_explains_itself(self):
        auth, _ = self._auth({"/auth/otp/request": FakeResponse(201, {"status": "sent"})},
                             interactive=False)
        os.environ["AKWAAN_TARGET_ADMIN_EMAIL"] = "admin@akwaan.test"
        with self.assertRaises(promoter.PromotionError) as caught:
            auth.token()
        self.assertIn("non-interactive", str(caught.exception))

    def test_request_failure_names_the_likely_cause(self):
        auth, _ = self._auth({"/auth/otp/request": FakeResponse(503, {"code": "EMAIL_OTP_NOT_CONFIGURED"})})
        os.environ["AKWAAN_TARGET_ADMIN_EMAIL"] = "admin@akwaan.test"
        with self.assertRaises(promoter.PromotionError) as caught:
            auth.token()
        self.assertIn("EMAIL_OTP_NOT_CONFIGURED", str(caught.exception))

    def test_neither_the_code_nor_the_token_appears_in_any_error(self):
        auth, _ = self._auth({
            "/auth/otp/request": FakeResponse(201, {"status": "sent"}),
            "/auth/otp/verify": FakeResponse(401, {"code": "OTP_INVALID_OR_EXPIRED"}),
        })
        os.environ["AKWAAN_TARGET_ADMIN_EMAIL"] = "admin@akwaan.test"
        with unittest.mock.patch("getpass.getpass", return_value="424242"):
            with self.assertRaises(promoter.PromotionError) as caught:
                auth.token()
        message = str(caught.exception)
        self.assertNotIn("424242", message)
        self.assertIn("OTP_INVALID_OR_EXPIRED", message)

    def test_the_code_is_read_with_getpass_not_input(self):
        source = Path(promoter.__file__).read_text(encoding="utf-8")
        self.assertIn('getpass.getpass(f"  [{self.role}] enter the', source)

    def test_the_written_plan_contains_no_credential(self):
        """The only file this tool writes is the plan — prove it is clean."""
        import tempfile
        entry = item(); entry.action = "CREATE"
        plan = promoter.Plan("anime-expansion", "https://akwaan-api.onrender.com", "production",
                             "http://localhost:3002", "abc", [], [entry], "now")
        document = plan.to_json()
        document["planHash"] = plan.fingerprint()
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
            json.dump(document, handle, ensure_ascii=False)
            path = handle.name
        written = Path(path).read_text(encoding="utf-8")
        for secret in ("tok-abc", "424242", "Bearer", "accessToken", "password", "otp"):
            self.assertNotIn(secret.lower(), written.lower(),
                             f"the plan file must not carry {secret!r}")
        Path(path).unlink()


class TestTargetConfigurableAndSecretsSafe(unittest.TestCase):
    """9 & 10. The target is configurable and secrets never reach output."""

    def test_default_target_is_local(self):
        self.assertEqual(promoter.classify_environment(promoter.DEFAULT_TARGET), "local")
        self.assertEqual(promoter.classify_environment(promoter.DEFAULT_SOURCE), "local")

    def test_target_is_honoured(self):
        client, session = api("https://akwaan-api.onrender.com",
                              routes={"/admin/worlds": {"data": []}})
        client.get("/admin/worlds")
        self.assertTrue(session.calls[0][1].startswith("https://akwaan-api.onrender.com"))

    def test_no_hardcoded_credentials_in_source(self):
        """No credential *value* is baked in.

        `"password"` as a JSON key is expected — that is the login contract. What
        must never appear is a literal value, or an assignment of one, which is
        exactly what the previous importer did with `LOGIN = {...}`.
        """
        import re
        source = Path(promoter.__file__).read_text(encoding="utf-8")
        for known_value in ("strongPassword", "admin@test.com", "SmokePass", "@123"):
            self.assertNotIn(known_value, source, f"credential value {known_value!r} is hardcoded")
        # No `password = "literal"` / `token = "literal"` style assignment.
        assignments = re.findall(r'\b(?:password|passwd|token|secret)\s*=\s*[\'"][^\'"\n]{3,}[\'"]', source, re.I)
        self.assertEqual(assignments, [], f"literal credential assignment: {assignments}")
        # Credentials may only enter through the environment or a secure prompt.
        self.assertIn("getpass.getpass", source, "the code must be read with getpass")
        os.environ["AKWAAN_SOURCE_ADMIN_TOKEN"] = "env-provided"
        try:
            auth = promoter.Authenticator("SOURCE", "http://localhost:3002",
                                          session=FakeSession({"/auth/me": FakeResponse(
                                              200, {"data": {"role": "admin", "email": "a@b.c"}})}))
            self.assertEqual(auth.token(), "env-provided",
                             "a token must be taken from the environment, not from a file")
        finally:
            os.environ.pop("AKWAAN_SOURCE_ADMIN_TOKEN", None)

    def test_missing_credentials_produce_a_clear_error(self):
        import os
        saved = {k: os.environ.pop(k, None) for k in
                 ("AKWAAN_TARGET_ADMIN_TOKEN", "AKWAAN_TARGET_ADMIN_EMAIL", "AKWAAN_TARGET_ADMIN_PASSWORD")}
        try:
            with self.assertRaises(promoter.PromotionError) as caught:
                promoter.resolve_token("TARGET", "http://localhost:3002", interactive=False)
            message = str(caught.exception)
            self.assertIn("AKWAAN_TARGET_ADMIN_TOKEN", message)
            self.assertNotIn("password=", message)
        finally:
            for key, value in saved.items():
                if value is not None:
                    os.environ[key] = value

    def test_login_failure_does_not_echo_the_credential(self):
        session = FakeSession({"/auth/login": FakeResponse(401, {"message": "Unauthorized"})})
        import os
        os.environ["AKWAAN_TARGET_ADMIN_EMAIL"] = "someone@example.invalid"
        os.environ["AKWAAN_TARGET_ADMIN_PASSWORD"] = "s3cr3t-value"
        try:
            with self.assertRaises(promoter.PromotionError) as caught:
                promoter.resolve_token("TARGET", "http://localhost:3002", interactive=False, session=session)
            self.assertNotIn("s3cr3t-value", str(caught.exception))
        finally:
            os.environ.pop("AKWAAN_TARGET_ADMIN_EMAIL", None)
            os.environ.pop("AKWAAN_TARGET_ADMIN_PASSWORD", None)

    def test_plan_json_carries_no_credentials(self):
        plan = promoter.Plan("anime-expansion", "http://localhost:3002", "local",
                             "http://localhost:3002", "abc", [], [item()], "now")
        text = json.dumps(plan.to_json())
        for leak in ("token", "password", "Authorization", "secret"):
            self.assertNotIn(leak.lower(), text.lower())


class TestPlanDeterminism(unittest.TestCase):
    """17. The plan hash covers decisions, not the clock."""

    def test_hash_is_stable_across_timestamps(self):
        entry = item(); entry.action = "CREATE"
        a = promoter.Plan("anime-expansion", "t", "local", "s", "abc", [], [entry], "2026-01-01")
        b = promoter.Plan("anime-expansion", "t", "local", "s", "abc", [], [entry], "2026-12-31")
        self.assertEqual(a.fingerprint(), b.fingerprint())

    def test_hash_changes_when_an_action_changes(self):
        first = item(); first.action = "CREATE"
        second = item(); second.action = "EXISTS_IDENTICAL"
        a = promoter.Plan("anime-expansion", "t", "local", "s", "abc", [], [first], "now")
        b = promoter.Plan("anime-expansion", "t", "local", "s", "abc", [], [second], "now")
        self.assertNotEqual(a.fingerprint(), b.fingerprint())


class TestDeclaredExpectations(unittest.TestCase):
    """The milestones themselves must match the approved numbers."""

    def test_anime_and_football_declare_the_approved_totals(self):
        anime = promoter.MILESTONES["anime-expansion"]
        football = promoter.MILESTONES["football-expansion"]
        self.assertEqual((anime.expected_scopes, anime.expected_items), (3, 135))
        self.assertEqual(anime.expected_by_mechanic,
                         {"read-your-opponent": 27, "closest": 27, "combo": 36, "bomb": 45})
        self.assertEqual((football.expected_scopes, football.expected_items), (3, 126))
        self.assertEqual(football.expected_by_mechanic,
                         {"read-your-opponent": 27, "closest": 27, "top-5": 27, "bomb": 45})
        self.assertEqual(anime.expected_items + football.expected_items, 261)
        self.assertEqual(anime.expected_scopes + football.expected_scopes, 6)


MARHALA_KEY = "marhala-video-games-batch-01"


def marhala_manifest():
    """The real Batch 01, read from its reviewed repository file."""
    return promoter.build_manifest_from_file(promoter.MILESTONES[MARHALA_KEY])


def marhala_target(existing_markers=()):
    """A fake production target: the 4 Video Games scopes and the marhala
    ChallengeType already exist; `existing_markers` are items already promoted."""
    scopes = [{"id": f"sc-{s}", "slug": s, "worldId": "vgW", "name": s}
              for s in promoter.MILESTONES[MARHALA_KEY].scope_slugs]
    # Map each existing marker to the scope its stable id implies.
    slug_by_abbrev = {"cod": "call-of-duty", "fifa": "fifa", "gta": "gta",
                      "ow": "overwatch"}
    items = []
    for marker in existing_markers:
        abbrev = marker.split(":")[1].split("-")[3]  # marhala-prod-vg-<abbrev>-NNN
        items.append({"id": f"ex-{marker}", "scopeId": f"sc-{slug_by_abbrev[abbrev]}",
                      "metadata": {"source": marker}})
    target, session = api(routes={
        "/admin/worlds/vgW/scopes": {"data": scopes},
        "/admin/content-items?worldId=vgW": {"data": items},
    })
    index = promoter.RuntimeIndex(
        worlds_by_slug={"video-games": {"id": "vgW", "slug": "video-games"}},
        challenge_types_by_slug={"marhala": {"id": "marCT", "slug": "marhala"}},
        challenge_type_slug_by_id={"marCT": "marhala"})
    return target, session, index


class TestMarhalaR22Milestone(unittest.TestCase):
    """The explicit, narrow exception for the approved R2.2 Marhala batch.

    Every gate here proves the exception is *narrow*: it accepts exactly the
    approved contract and nothing adjacent to it, and it never widens the safety
    model for any other milestone.
    """

    # A — the exact approved batch passes.
    def test_A_exact_batch_passes(self):
        man = marhala_manifest()
        self.assertEqual(len(man.items), 36)
        promoter.assert_manifest_is_clean(man)  # must not raise

    # B — one item short is rejected.
    def test_B_thirty_five_items_fails(self):
        man = marhala_manifest()
        man.items.pop()
        with self.assertRaises(promoter.PromotionError):
            promoter.assert_manifest_is_clean(man)

    # C — one item over is rejected.
    def test_C_thirty_seven_items_fails(self):
        man = marhala_manifest()
        extra = item(marker=f"{man.milestone.source_prefix}:marhala-prod-vg-cod-010",
                     scope="call-of-duty", mechanics=("marhala",),
                     payload={"prompt": {"ar": "س"},
                              "answerPayload": {"mode": "match", "acceptedAnswers": ["ج"]},
                              "mechanicPayload": {"marhalaDifficulty": "easy"},
                              "metadata": {"source": f"{man.milestone.source_prefix}:marhala-prod-vg-cod-010"}})
        man.items.append(extra)
        with self.assertRaises(promoter.PromotionError):
            promoter.assert_manifest_is_clean(man)

    # D — an item under a scope outside the seven is rejected.
    def test_D_wrong_scope_fails(self):
        man = marhala_manifest()
        man.items[0].scope_slug = "naruto"
        with self.assertRaises(promoter.PromotionError) as caught:
            promoter.assert_manifest_is_clean(man)
        self.assertIn("allowlist", str(caught.exception))

    # E — a scope whose 3/3/3 split is broken is rejected.
    def test_E_wrong_difficulty_distribution_fails(self):
        man = marhala_manifest()
        # Flip a call-of-duty medium into an easy → that scope becomes 4/2/3.
        med = next(i for i in man.items
                   if i.scope_slug == "call-of-duty"
                   and i.payload["mechanicPayload"]["marhalaDifficulty"] == "medium")
        med.payload["mechanicPayload"]["marhalaDifficulty"] = "easy"
        with self.assertRaises(promoter.PromotionError) as caught:
            promoter.assert_manifest_is_clean(man)
        self.assertIn("difficulty split", str(caught.exception))

    # F — an item missing its difficulty is rejected.
    def test_F_missing_difficulty_fails(self):
        man = marhala_manifest()
        man.items[0].payload["mechanicPayload"] = {}
        with self.assertRaises(promoter.PromotionError):
            promoter.assert_manifest_is_clean(man)

    # G — an unknown difficulty band is rejected.
    def test_G_invalid_difficulty_fails(self):
        man = marhala_manifest()
        man.items[0].payload["mechanicPayload"]["marhalaDifficulty"] = "extreme"
        with self.assertRaises(promoter.PromotionError):
            promoter.assert_manifest_is_clean(man)

    # H — a non-Marhala item smuggled into the milestone is rejected.
    def test_H_non_marhala_item_inside_milestone_fails(self):
        man = marhala_manifest()
        man.items[0].mechanic_slugs = ("bomb",)
        with self.assertRaises(promoter.PromotionError):
            promoter.assert_manifest_is_clean(man)

    # I / J / K — forbidden source markers are rejected even inside this milestone.
    def test_I_J_K_forbidden_source_markers_fail(self):
        for bad in ("marhala-multimodal-pilot-2026-08-21:1",   # I: rejected pilot
                    "local-dev-marhala-smoke-fixture:1",        # J/K: local-dev + smoke
                    "marhala-playtest-content-2026-08-21:1"):   # playtest
            man = marhala_manifest()
            man.items[0].source_marker = bad
            man.items[0].payload["metadata"]["source"] = bad
            with self.assertRaises(promoter.PromotionError):
                promoter.assert_manifest_is_clean(man)

    # L — Marhala can never ride in through Anime or Football.
    def test_L_marhala_blocked_through_other_milestones(self):
        for other in ("anime-expansion", "football-expansion"):
            bad_mech = manifest(milestone_key=other, items=[item(
                marker=f"{promoter.MILESTONES[other].source_prefix}:x-1",
                scope=promoter.MILESTONES[other].scope_slugs[0],
                mechanics=("marhala",))])
            with self.assertRaises(promoter.PromotionError):
                promoter.assert_manifest_is_clean(bad_mech)
            bad_payload = manifest(milestone_key=other, items=[item(
                marker=f"{promoter.MILESTONES[other].source_prefix}:x-2",
                scope=promoter.MILESTONES[other].scope_slugs[0],
                payload={"prompt": {"ar": "س"},
                         "answerPayload": {"mode": "match", "acceptedAnswers": ["ج"]},
                         "mechanicPayload": {"marhalaDifficulty": "easy"},
                         "metadata": {"source": f"{promoter.MILESTONES[other].source_prefix}:x-2"}})])
            with self.assertRaises(promoter.PromotionError):
                promoter.assert_manifest_is_clean(bad_payload)

    # M — no delete capability reaches a Marhala plan either.
    def test_M_no_delete_capability(self):
        _, _, index = marhala_target()
        target, _, _ = marhala_target()
        plan = promoter.build_plan(marhala_manifest(), None, None, target, index, check_media=False)
        self.assertEqual(plan.counts()["deletes"], 0)
        for forbidden in ("delete", "prune", "replace", "put", "patch"):
            self.assertFalse(hasattr(target, forbidden))

    # N — a remote Marhala execute still demands every safety flag.
    def test_N_remote_execute_requires_all_flags(self):
        prod = "https://akwaan-api.onrender.com"
        self.assertEqual(promoter.main(["--milestone", MARHALA_KEY, "--target", prod, "--execute"]), 2)
        self.assertEqual(promoter.main(["--milestone", MARHALA_KEY, "--target", prod,
                                        "--execute", "--allow-remote-write"]), 2)
        self.assertEqual(promoter.main(["--milestone", MARHALA_KEY, "--target", prod,
                                        "--expected-environment", "local"]), 2)

    # O — the plan hash reflects the decision set, so a drifted plan cannot reuse
    # a previously-approved --require-plan-hash.
    def test_O_plan_hash_is_decision_sensitive(self):
        empty_target, _, index = marhala_target()
        plan_all_create = promoter.build_plan(marhala_manifest(), None, None,
                                              empty_target, index, check_media=False)
        # Ten already promoted → ten EXISTS_IDENTICAL, a different decision set.
        markers = [i.source_marker for i in marhala_manifest().items[:10]]
        partial_target, _, index2 = marhala_target(existing_markers=markers)
        plan_partial = promoter.build_plan(marhala_manifest(), None, None,
                                           partial_target, index2, check_media=False)
        self.assertNotEqual(plan_all_create.fingerprint(), plan_partial.fingerprint())
        # And the same inputs hash identically (stable across replans).
        again, _, index3 = marhala_target()
        self.assertEqual(
            plan_all_create.fingerprint(),
            promoter.build_plan(marhala_manifest(), None, None, again, index3,
                                check_media=False).fingerprint())

    # P — a second run against a target that already holds the batch is all
    # EXISTS_IDENTICAL and writes nothing.
    def test_P_second_run_is_idempotent(self):
        all_markers = [i.source_marker for i in marhala_manifest().items]
        target, _, index = marhala_target(existing_markers=all_markers)
        plan = promoter.build_plan(marhala_manifest(), None, None, target, index, check_media=False)
        actions = {i.action for i in plan.items}
        self.assertEqual(actions, {"EXISTS_IDENTICAL"})
        self.assertEqual(plan.counts()["writes"], 0)
        self.assertEqual(plan.counts()["deletes"], 0)

    # First clean promotion: 36 CREATE, all 4 scopes EXISTS (never created).
    def test_first_promotion_is_36_create_scopes_exist(self):
        target, _, index = marhala_target()
        plan = promoter.build_plan(marhala_manifest(), None, None, target, index, check_media=False)
        self.assertEqual([i.action for i in plan.items].count("CREATE"), 36)
        self.assertTrue(all(s.action == "EXISTS" for s in plan.scopes))
FOOTBALL_BOMB_R1_KEY = "football-bomb-r1"


def football_bomb_r1_manifest():
    """The real Football Bomb R1 batch, read from its reviewed repository file."""
    return promoter.build_manifest_from_file(promoter.MILESTONES[FOOTBALL_BOMB_R1_KEY])


def football_bomb_r1_target(bomb_ct_id="ct-bomb-local", existing_markers=()):
    """A fake target runtime with the 3 Football scopes and configurable bomb ChallengeType ID."""
    scopes = [
        {"id": f"sc-{s}", "slug": s, "worldId": "fbWorld", "name": s}
        for s in promoter.MILESTONES[FOOTBALL_BOMB_R1_KEY].scope_slugs
    ]
    scope_by_code = {"pl": "sc-premier-league", "cl": "sc-champions-league", "wc": "sc-world-cup"}
    items = []
    for marker in existing_markers:
        # bomb-football-question-craft-r1:bomb-prod-fb-<code>-xxx
        parts = marker.split(":")[-1].split("-")
        code = parts[3] if len(parts) > 3 else "pl"
        items.append({"id": f"ex-{marker}", "scopeId": scope_by_code.get(code, "sc-premier-league"),
                      "metadata": {"source": marker}})
    target, session = api(routes={
        "/admin/worlds/fbWorld/scopes": {"data": scopes},
        "/admin/content-items?worldId=fbWorld": {"data": items},
    })
    index = promoter.RuntimeIndex(
        worlds_by_slug={"football": {"id": "fbWorld", "slug": "football"}},
        challenge_types_by_slug={"bomb": {"id": bomb_ct_id, "slug": "bomb"}},
        challenge_type_slug_by_id={bomb_ct_id: "bomb"},
    )
    return target, session, index


class TestFootballBombR1Milestone(unittest.TestCase):
    """Safety and promotion tests for the Football Bomb R1 milestone."""

    def test_A_local_bomb_resolves_by_slug(self):
        """A. Local Bomb ChallengeType can resolve by slug."""
        local_bomb_id = "6a86276c215dc4d4bed0cfe0"
        target, _, index = football_bomb_r1_target(bomb_ct_id=local_bomb_id)
        man = football_bomb_r1_manifest()
        plan = promoter.build_plan(man, None, None, target, index, check_media=False)
        self.assertEqual(len(plan.items), 15)
        self.assertEqual(index.challenge_types_by_slug["bomb"]["id"], local_bomb_id)
        self.assertEqual([i.action for i in plan.items].count("CREATE"), 15)

    def test_B_production_different_objectid_resolves_by_same_slug(self):
        """B. Production-style different ObjectId resolves correctly by the same slug."""
        prod_bomb_id = "6a88fe367bdd34f0795233a9"  # Real production Bomb ID
        target, session, index = football_bomb_r1_target(bomb_ct_id=prod_bomb_id)
        man = football_bomb_r1_manifest()
        plan = promoter.build_plan(man, None, None, target, index, check_media=False)
        self.assertEqual(index.challenge_types_by_slug["bomb"]["id"], prod_bomb_id)
        self.assertEqual([i.action for i in plan.items].count("CREATE"), 15)
        # Execute against fake target and verify posted compatibleChallengeTypeIds uses prod ID
        target_writes, session_writes = api(writes=True, routes={
            "/admin/content-items/created-1/readiness": FakeResponse(200, {"data": {"blockers": []}}),
            "/admin/content-items": FakeResponse(201, {"data": {"id": "created-1"}}),
        })
        stats = promoter.execute_plan(plan, target_writes, index)
        self.assertEqual(stats["items_created"], 15)
        for body in session_writes.bodies:
            self.assertEqual(body["compatibleChallengeTypeIds"], [prod_bomb_id])

    def test_C_source_pack_contains_no_embedded_challenge_type_id_as_portable_truth(self):
        """C. Source pack contains no embedded environment-specific ChallengeType ID as portable truth."""
        source_path = os.path.join(promoter._repo_root(), promoter.MILESTONES[FOOTBALL_BOMB_R1_KEY].source_file)
        with open(source_path, encoding="utf-8") as f:
            raw = json.load(f)
        self.assertNotIn("challengeTypeId", raw, "source pack must not embed challengeTypeId")
        self.assertNotIn("worldId", raw, "source pack must not embed worldId")
        for q in raw.get("questions", []):
            self.assertNotIn("scopeId", q, "questions must not embed scopeId")
            self.assertNotIn("worldId", q, "questions must not embed worldId")
            self.assertIn("scopeSlug", q, "questions must define canonical scopeSlug")

    def test_D_wrong_missing_target_challenge_type_fails_before_writes(self):
        """D. Wrong/missing target ChallengeType fails before writes."""
        # Target without bomb ChallengeType
        index = promoter.RuntimeIndex(
            worlds_by_slug={"football": {"id": "fbWorld", "slug": "football"}},
            challenge_types_by_slug={"closest": {"id": "ct-closest", "slug": "closest"}},
            challenge_type_slug_by_id={"ct-closest": "closest"},
        )
        target, _ = api(routes={
            "/admin/worlds/fbWorld/scopes": {"data": [{"id": "s1", "slug": "premier-league", "worldId": "fbWorld", "name": "PL"}]},
            "/admin/content-items?worldId=fbWorld": {"data": []},
        })
        man = football_bomb_r1_manifest()
        plan = promoter.build_plan(man, None, None, target, index, check_media=False)
        self.assertTrue(any("target has no ChallengeType 'bomb'" in i.detail for i in plan.items))
        self.assertTrue(plan.blockers())
        with self.assertRaises(promoter.PromotionError):
            promoter.execute_plan(plan, target, index)

    def test_E_production_target_confirmation_is_required(self):
        """E. Production target confirmation is required."""
        prod = "https://akwaan-api.onrender.com"
        # Executing without --allow-remote-write fails
        self.assertEqual(promoter.main(["--milestone", FOOTBALL_BOMB_R1_KEY, "--target", prod, "--execute"]), 2)
        # Executing without matching --expected-environment fails
        self.assertEqual(promoter.main(["--milestone", FOOTBALL_BOMB_R1_KEY, "--target", prod,
                                        "--execute", "--allow-remote-write", "--expected-environment", "local"]), 2)

    def test_F_dry_run_cannot_be_mistaken_for_execute(self):
        """F. dry-run cannot be mistaken for execute."""
        target, session, index = football_bomb_r1_target()
        man = football_bomb_r1_manifest()
        plan = promoter.build_plan(man, None, None, target, index, check_media=False)
        # In dry run, target client has writes_enabled=False and refuses POST
        with self.assertRaises(promoter.PromotionError):
            promoter.execute_plan(plan, target, index)
        self.assertEqual([c for c in session.calls if c[0] == "POST"], [])

    def test_G_idempotent_rerun_proposes_zero_writes(self):
        """G. idempotent rerun proposes zero writes."""
        man = football_bomb_r1_manifest()
        all_markers = [i.source_marker for i in man.items]
        target, _, index = football_bomb_r1_target(existing_markers=all_markers)
        plan = promoter.build_plan(man, None, None, target, index, check_media=False)
        actions = {i.action for i in plan.items}
        self.assertEqual(actions, {"EXISTS_IDENTICAL"})
        self.assertEqual(plan.counts()["writes"], 0)
        self.assertEqual(plan.counts()["deletes"], 0)
        self.assertEqual(plan.blockers(), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestGeneratedPackMilestones(unittest.TestCase):
    """No canonical milestone may depend on a file Git does not carry.

    Four Music milestones shipped pointing at `ai/scripts/data/music-*.source.json`
    that were never committed — the reviewed packs are generated authoring
    artifacts and deliberately live outside Git. A registration that names a
    missing path is an invalid contract however loudly it fails at run time, so
    those milestones now declare `external_source` and are handed their batch
    explicitly instead.
    """

    def test_every_tracked_source_file_exists(self):
        root = Path(__file__).resolve().parents[2]
        missing = [
            (key, milestone.source_file)
            for key, milestone in promoter.MILESTONES.items()
            if milestone.source_file
            and not (root / milestone.source_file).exists()
        ]
        self.assertEqual(missing, [])

    def test_generated_pack_milestones_declare_no_source_file(self):
        for key, milestone in promoter.MILESTONES.items():
            if milestone.external_source:
                with self.subTest(milestone=key):
                    self.assertIsNone(milestone.source_file)

    def test_the_music_batches_are_the_generated_ones(self):
        external = {k for k, m in promoter.MILESTONES.items() if m.external_source}
        self.assertEqual(
            external,
            {
                "music-bomb-batch-01",
                "music-ryo-batch-01",
                "music-closest-batch-01",
                "music-first-note-batch-01",
            },
        )

    def test_a_generated_milestone_refuses_to_run_without_a_pack(self):
        code = promoter.main([
            "--milestone", "music-bomb-batch-01",
            "--target", "http://localhost:3002",
            "--no-interactive",
        ])
        self.assertEqual(code, 2)

    def test_source_file_is_rejected_for_a_tracked_pack_milestone(self):
        code = promoter.main([
            "--milestone", "football-bomb-r1",
            "--source-file", "anything.json",
            "--target", "http://localhost:3002",
            "--no-interactive",
        ])
        self.assertEqual(code, 2)

    def test_source_file_cannot_be_spread_across_every_milestone(self):
        code = promoter.main([
            "--milestone", "all",
            "--source-file", "anything.json",
            "--target", "http://localhost:3002",
            "--no-interactive",
        ])
        self.assertEqual(code, 2)

    def test_an_explicit_pack_is_read_when_supplied(self):
        milestone = promoter.MILESTONES["music-bomb-batch-01"]
        with tempfile.TemporaryDirectory() as tmp:
            pack = Path(tmp) / "batch.source.json"
            pack.write_text(json.dumps({"questions": []}), encoding="utf-8")
            manifest = promoter.build_manifest_from_file(milestone, str(pack))
        self.assertEqual(manifest.items, [])

    def test_a_missing_explicit_pack_fails_loudly(self):
        milestone = promoter.MILESTONES["music-bomb-batch-01"]
        with self.assertRaises(promoter.PromotionError):
            promoter.build_manifest_from_file(milestone, "does/not/exist.json")

    def test_a_generated_milestone_without_a_pack_is_a_registration_error(self):
        milestone = promoter.MILESTONES["music-bomb-batch-01"]
        with self.assertRaises(promoter.PromotionError):
            promoter.build_manifest_from_file(milestone)


class TestFirstNoteCanonicalSlug(unittest.TestCase):
    """The Music Signature must resolve to the slug a launcher answers to.

    Production carried a Music `slot_1` bound to the generated ChallengeType slug
    `mechanic-1788380928916` while the runtime launcher key is `first-note`, so no
    launcher resolved the slot and players saw the Signature as unavailable. The
    promoter had that generated slug in its alias table, which is what let content
    be promoted into the drifted type without anything complaining.
    """

    GENERATED = "mechanic-1788380928916"

    def aliases(self):
        return promoter.CANONICAL_CHALLENGE_TYPE_ALIASES["first_note"]

    def test_canonical_runtime_slug_is_an_alias(self):
        # `first-note` is FIRST_NOTE_SLUG and FirstNoteChallengeLauncher.key.
        self.assertIn("first-note", self.aliases())

    def test_the_generated_slug_is_no_longer_accepted(self):
        self.assertNotIn(self.GENERATED, self.aliases())

    def test_no_alias_table_entry_carries_the_generated_first_note_slug(self):
        for canonical, aliases in promoter.CANONICAL_CHALLENGE_TYPE_ALIASES.items():
            with self.subTest(canonical=canonical):
                self.assertNotIn(self.GENERATED, aliases)


    def test_no_alias_table_entry_carries_a_generated_mechanic_slug(self):
        """No canonical mechanic may be reachable through a generated slug.

        Both Production drifts — Music's `mechanic-1788380928916` and Video
        Games' `mechanic-1787503326785` — were promotable because the alias table
        accepted the generated slug. Any `mechanic-<digits>` alias is that same
        hazard, so none may exist at all.
        """
        import re

        # The debt is closed: every canonical mechanic in Production now carries
        # its canonical slug, so no alias may name a generated one at all.
        generated = re.compile(r"^mechanic-\d+$")
        for canonical, aliases in promoter.CANONICAL_CHALLENGE_TYPE_ALIASES.items():
            for alias in aliases:
                with self.subTest(canonical=canonical, alias=alias):
                    self.assertIsNone(generated.match(alias))

    def test_a_correctly_slugged_type_resolves_to_the_canonical_key(self):
        index = self._index_with_slug("first-note")
        self.assertIn("first_note", index.challenge_types_by_slug)

    def test_the_generated_slug_no_longer_resolves(self):
        index = self._index_with_slug(self.GENERATED)
        # Fails to resolve rather than silently promoting into the drifted type.
        self.assertNotIn("first_note", index.challenge_types_by_slug)

    def _index_with_slug(self, slug: str):
        """Build a RuntimeIndex from a fake admin runtime carrying one type."""

        class FakeApi:
            def get(self, path):
                if path == "/admin/worlds":
                    return []
                if path == "/admin/challenge-types":
                    return [{"id": "ct-1", "slug": slug, "name": "unrelated-name"}]
                return []

        return promoter.RuntimeIndex.load(FakeApi())
