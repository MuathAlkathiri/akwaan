#!/usr/bin/env python3
import unittest
from unittest.mock import MagicMock

import provision_active_world_scopes as provisioner


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
        self.assertEqual(len(plan.scope_actions), 6)
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
        puz_existing = [
            {"id": "s_ps", "slug": "patterns-sequences", "name": "أنماط ومتتاليات", "status": "active"},
            {"id": "s_lt", "slug": "lateral-thinking", "name": "تفكير جانبي", "status": "active"},
            {"id": "s_vp", "slug": "visual-puzzles", "name": "ألغاز بصرية", "status": "active"},
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
        self.assertEqual(len(plan.scope_actions), 6)
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
        self.assertEqual(len(res["scopes_created"]), 6)
        self.assertEqual(len(res["scopes_reused"]), 0)
        self.assertEqual(self.mock_client.create_scope.call_count, 6)

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
        puz_existing = [
            {"id": "s_ps", "slug": "patterns-sequences", "name": "أنماط ومتتاليات", "status": "active"},
            {"id": "s_lt", "slug": "lateral-thinking", "name": "تفكير جانبي", "status": "active"},
            {"id": "s_vp", "slug": "visual-puzzles", "name": "ألغاز بصرية", "status": "active"},
        ]

        def get_scopes(wid):
            return vg_existing if wid == "w_vg" else puz_existing

        self.mock_client.list_scopes.side_effect = get_scopes

        plan = provisioner.build_plan(self.mock_client)
        res = provisioner.execute_plan(self.mock_client, plan)
        self.assertEqual(len(res["scopes_created"]), 0)
        self.assertEqual(len(res["scopes_reused"]), 6)
        self.assertEqual(self.mock_client.create_scope.call_count, 0)


if __name__ == "__main__":
    unittest.main()
