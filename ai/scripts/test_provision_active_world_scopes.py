#!/usr/bin/env python3
import unittest
from unittest.mock import MagicMock

import provision_active_world_scopes as provisioner


# 9 = 3 Video Games Scopes + the 6 forward Puzzles Scopes (roadmap §23.11).
class TestProvisionActiveWorldScopes(unittest.TestCase):
    def setUp(self):
        self.mock_client = MagicMock(spec=provisioner.TargetClient)
        self.mock_client.base_url = "http://localhost:3002"
        self.mock_client.environment = "local"
        self.mock_client.is_remote = False

    def test_plan_when_scopes_absent(self):
        self.mock_client.list_worlds.return_value = [
            {"id": "w_vg", "name": "عالم الالعاب الالكترونية", "slug": "world-1785784447249"},
            {"id": "w_puz", "name": "عالم الالغاز", "slug": "world-1786388973542"},
        ]
        self.mock_client.list_scopes.side_effect = lambda wid: []

        plan = provisioner.build_plan(self.mock_client)
        self.assertTrue(plan.is_safe)
        self.assertEqual(len(plan.blockers), 0)
        self.assertEqual(len(plan.scope_actions), 9)
        self.assertTrue(all(s.action == "CREATE" for s in plan.scope_actions))

    def test_plan_when_scopes_exist(self):
        self.mock_client.list_worlds.return_value = [
            {"id": "w_vg", "name": "عالم الالعاب الالكترونية", "slug": "world-1785784447249"},
            {"id": "w_puz", "name": "عالم الالغاز", "slug": "world-1786388973542"},
        ]
        vg_existing = [
            {"id": "s_mc", "slug": "minecraft", "name": "ماينكرافت", "status": "active"},
            {"id": "s_gow", "slug": "god-of-war", "name": "قود اوف وار", "status": "active"},
            {"id": "s_re", "slug": "resident-evil", "name": "ريزدنت إيفل", "status": "active"},
        ]
        # The six forward Puzzles Scopes (roadmap §23.11). The superseded
        # patterns-sequences / lateral-thinking / visual-puzzles trio is gone.
        puz_existing = [
            {"id": "s_oi", "slug": "observation-illusions", "name": "قوة الملاحظة والخداع البصري", "status": "active"},
            {"id": "s_wl", "slug": "wordplay-letters", "name": "التلاعب بالكلمات والحروف", "status": "active"},
            {"id": "s_ne", "slug": "numbers-estimation", "name": "أرقام وتقديرات", "status": "active"},
            {"id": "s_ar", "slug": "assembly-rotation", "name": "تركيب وتدوير", "status": "active"},
            {"id": "s_pm", "slug": "paths-motion", "name": "مسارات وحركة", "status": "active"},
            {"id": "s_se", "slug": "spot-the-error", "name": "اكتشف الخطأ", "status": "active"},
        ]

        def get_scopes(wid):
            if wid == "w_vg":
                return vg_existing
            if wid == "w_puz":
                return puz_existing
            return []

        self.mock_client.list_scopes.side_effect = get_scopes

        plan = provisioner.build_plan(self.mock_client)
        self.assertTrue(plan.is_safe)
        self.assertEqual(len(plan.scope_actions), 9)
        self.assertTrue(all(s.action == "EXISTS_IDENTICAL" for s in plan.scope_actions))

    def test_missing_parent_world_creates_blocker(self):
        self.mock_client.list_worlds.return_value = [
            {"id": "w_vg", "name": "عالم الالعاب الالكترونية", "slug": "world-1785784447249"},
        ]
        self.mock_client.list_scopes.return_value = []

        plan = provisioner.build_plan(self.mock_client)
        self.assertFalse(plan.is_safe)
        self.assertEqual(len(plan.blockers), 1)
        self.assertIn("puzzles", plan.blockers[0])

    def test_execute_creates_missing_scopes(self):
        self.mock_client.list_worlds.return_value = [
            {"id": "w_vg", "name": "عالم الالعاب الالكترونية", "slug": "world-1785784447249"},
            {"id": "w_puz", "name": "عالم الالغاز", "slug": "world-1786388973542"},
        ]
        self.mock_client.list_scopes.return_value = []
        self.mock_client.create_scope.side_effect = lambda wid, payload: {"id": f"id_{payload['slug']}", "status": payload["status"]}

        plan = provisioner.build_plan(self.mock_client)
        res = provisioner.execute_plan(self.mock_client, plan)
        self.assertEqual(len(res["scopes_created"]), 9)
        self.assertEqual(len(res["scopes_reused"]), 0)
        self.assertEqual(self.mock_client.create_scope.call_count, 9)

    def test_execute_idempotent_creates_zero(self):
        self.mock_client.list_worlds.return_value = [
            {"id": "w_vg", "name": "عالم الالعاب الالكترونية", "slug": "world-1785784447249"},
            {"id": "w_puz", "name": "عالم الالغاز", "slug": "world-1786388973542"},
        ]
        vg_existing = [
            {"id": "s_mc", "slug": "minecraft", "name": "ماينكرافت", "status": "active"},
            {"id": "s_gow", "slug": "god-of-war", "name": "قود اوف وار", "status": "active"},
            {"id": "s_re", "slug": "resident-evil", "name": "ريزدنت إيفل", "status": "active"},
        ]
        # The six forward Puzzles Scopes (roadmap §23.11). The superseded
        # patterns-sequences / lateral-thinking / visual-puzzles trio is gone.
        puz_existing = [
            {"id": "s_oi", "slug": "observation-illusions", "name": "قوة الملاحظة والخداع البصري", "status": "active"},
            {"id": "s_wl", "slug": "wordplay-letters", "name": "التلاعب بالكلمات والحروف", "status": "active"},
            {"id": "s_ne", "slug": "numbers-estimation", "name": "أرقام وتقديرات", "status": "active"},
            {"id": "s_ar", "slug": "assembly-rotation", "name": "تركيب وتدوير", "status": "active"},
            {"id": "s_pm", "slug": "paths-motion", "name": "مسارات وحركة", "status": "active"},
            {"id": "s_se", "slug": "spot-the-error", "name": "اكتشف الخطأ", "status": "active"},
        ]

        def get_scopes(wid):
            return vg_existing if wid == "w_vg" else puz_existing

        self.mock_client.list_scopes.side_effect = get_scopes

        plan = provisioner.build_plan(self.mock_client)
        res = provisioner.execute_plan(self.mock_client, plan)
        self.assertEqual(len(res["scopes_created"]), 0)
        self.assertEqual(len(res["scopes_reused"]), 9)
        self.assertEqual(self.mock_client.create_scope.call_count, 0)


if __name__ == "__main__":
    unittest.main()


class TestWorldTargeting(unittest.TestCase):
    """
    `--only` exists so one World's rollout cannot become an unrelated catalog
    change. These prove the selection is exact in both directions: everything
    the named World needs, and nothing from any other World.
    """

    FORWARD_PUZZLES_SLUGS = [
        "observation-illusions",
        "wordplay-letters",
        "numbers-estimation",
        "assembly-rotation",
        "paths-motion",
        "spot-the-error",
    ]

    def setUp(self):
        self.mock_client = MagicMock(spec=provisioner.TargetClient)
        self.mock_client.base_url = "http://localhost:3002"
        self.mock_client.environment = "local"
        self.mock_client.is_remote = False
        self.mock_client.list_worlds.return_value = [
            {"id": "w_vg", "name": "عالم الالعاب الالكترونية", "slug": "world-1785784447249"},
            {"id": "w_puz", "name": "عالم الالغاز", "slug": "world-1786388973542"},
        ]
        self.mock_client.list_scopes.side_effect = lambda wid: []

    def test_puzzles_only_plans_exactly_the_six_forward_scopes(self):
        plan = provisioner.build_plan(self.mock_client, only=["puzzles"])
        self.assertTrue(plan.is_safe)
        self.assertEqual(len(plan.blockers), 0)
        self.assertEqual(
            [s.slug for s in plan.scope_actions], self.FORWARD_PUZZLES_SLUGS
        )
        self.assertTrue(all(s.action == "CREATE" for s in plan.scope_actions))

    def test_puzzles_only_touches_no_other_world(self):
        plan = provisioner.build_plan(self.mock_client, only=["puzzles"])
        # Zero operations attributed to any other World...
        self.assertEqual({s.world_slug for s in plan.scope_actions}, {"puzzles"})
        # ...and the Video Games Scopes are absent by slug, not merely by count.
        for foreign in ("minecraft", "god-of-war", "resident-evil"):
            self.assertNotIn(foreign, [s.slug for s in plan.scope_actions])
        # A restricted run must not even look at the other World.
        self.assertEqual(
            self.mock_client.list_scopes.call_args_list, [unittest.mock.call("w_puz")]
        )

    def test_unrestricted_run_is_unchanged(self):
        plan = provisioner.build_plan(self.mock_client)
        self.assertEqual(len(plan.scope_actions), 9)
        self.assertEqual({s.world_slug for s in plan.scope_actions}, {"video-games", "puzzles"})
        self.assertIsNone(plan.only)

    def test_empty_selection_means_full_sweep(self):
        # An omitted flag arrives as None/() and must not silently select nothing.
        for empty in (None, (), []):
            plan = provisioner.build_plan(self.mock_client, only=empty)
            self.assertEqual(len(plan.scope_actions), 9)
            self.assertIsNone(plan.only)

    def test_unknown_world_is_refused_before_any_network_call(self):
        with self.assertRaises(ValueError) as caught:
            provisioner.build_plan(self.mock_client, only=["puzzlez"])
        self.assertIn("puzzlez", str(caught.exception))
        self.assertIn("Known:", str(caught.exception))
        # Fails fast: no round trip was spent discovering the typo.
        self.mock_client.list_worlds.assert_not_called()

    def test_restricted_plan_hash_cannot_be_replayed_against_a_sweep(self):
        scoped = provisioner.build_plan(self.mock_client, only=["puzzles"])
        full = provisioner.build_plan(self.mock_client)
        self.assertNotEqual(scoped.plan_hash(), full.plan_hash())
        # And an unrestricted plan still hashes on its scope actions alone, so
        # hashes captured before targeting existed remain valid.
        self.assertEqual(full.plan_hash(), provisioner.build_plan(self.mock_client).plan_hash())

    def test_video_games_only_is_symmetric(self):
        plan = provisioner.build_plan(self.mock_client, only=["video-games"])
        self.assertEqual({s.world_slug for s in plan.scope_actions}, {"video-games"})
        self.assertEqual(len(plan.scope_actions), 3)

    def test_selection_order_follows_the_request(self):
        plan = provisioner.build_plan(self.mock_client, only=["puzzles", "video-games"])
        self.assertEqual(
            [s.world_slug for s in plan.scope_actions][:6], ["puzzles"] * 6
        )
        self.assertEqual(len(plan.scope_actions), 9)


class TestPlanHashBindsTheTarget(unittest.TestCase):
    """
    Environments share ids. The Puzzles World has the same `_id` locally and in
    Production, so two plans can be operation-for-operation identical while
    pointing at completely different databases. A plan hash that did not name
    the target would let a hash approved against localhost authorise the same
    write against Production.
    """

    def _client(self, base_url, environment):
        client = MagicMock(spec=provisioner.TargetClient)
        client.base_url = base_url
        client.environment = environment
        client.is_remote = environment != "local"
        client.list_worlds.return_value = [
            {"id": "w_puz", "name": "عالم الالغاز", "slug": "world-1786388973542"},
        ]
        client.list_scopes.side_effect = lambda wid: []
        return client

    def test_identical_plans_hash_differently_per_environment(self):
        local = provisioner.build_plan(
            self._client("http://localhost:3002", "local"), only=["puzzles"]
        )
        prod = provisioner.build_plan(
            self._client("https://akwaan-api.onrender.com", "production"),
            only=["puzzles"],
        )
        # The operations really are identical — that is the whole danger.
        self.assertEqual(
            [asdict_slug(s) for s in local.scope_actions],
            [asdict_slug(s) for s in prod.scope_actions],
        )
        # ...and the hashes still differ, so one cannot authorise the other.
        self.assertNotEqual(local.plan_hash(), prod.plan_hash())

    def test_same_target_is_still_deterministic(self):
        first = provisioner.build_plan(
            self._client("https://akwaan-api.onrender.com", "production"),
            only=["puzzles"],
        )
        second = provisioner.build_plan(
            self._client("https://akwaan-api.onrender.com", "production"),
            only=["puzzles"],
        )
        self.assertEqual(first.plan_hash(), second.plan_hash())


def asdict_slug(action):
    return (action.action, action.world_slug, action.slug, action.name, action.status)
