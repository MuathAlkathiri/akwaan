import unittest
from unittest.mock import MagicMock, patch

from provision_music_taxonomy import (
    CANONICAL_MUSIC_SCOPES,
    CANONICAL_MUSIC_WORLD,
    ProvisioningPlan,
    ScopeAction,
    TargetClient,
    WorldAction,
    build_plan,
    execute_plan,
)


class TestProvisionMusicTaxonomy(unittest.TestCase):
    def setUp(self):
        self.mock_client = MagicMock(spec=TargetClient)
        self.mock_client.base_url = "http://localhost:3002"
        self.mock_client.environment = "local"
        self.mock_client.is_remote = False

    def test_plan_when_world_and_scopes_absent(self):
        self.mock_client.list_worlds.return_value = []
        plan = build_plan(self.mock_client)

        self.assertEqual(plan.world_action.action, "CREATE")
        self.assertEqual(plan.world_action.slug, "music")
        self.assertEqual(len(plan.scope_actions), 4)
        for sa in plan.scope_actions:
            self.assertEqual(sa.action, "CREATE")
        self.assertTrue(plan.is_safe)
        self.assertEqual(len(plan.blockers), 0)

    def test_plan_when_world_and_scopes_exist(self):
        self.mock_client.list_worlds.return_value = [
            {"id": "w123", "slug": "music", "name": "الأغاني", "status": "draft"}
        ]
        self.mock_client.list_scopes.return_value = [
            {"id": f"s{i}", "slug": spec["slug"], "name": spec["name"], "status": "draft"}
            for i, spec in enumerate(CANONICAL_MUSIC_SCOPES)
        ]

        plan = build_plan(self.mock_client)

        self.assertEqual(plan.world_action.action, "EXISTS_IDENTICAL")
        self.assertEqual(plan.world_action.world_id, "w123")
        self.assertEqual(len(plan.scope_actions), 4)
        for sa in plan.scope_actions:
            self.assertEqual(sa.action, "EXISTS_IDENTICAL")
        self.assertTrue(plan.is_safe)

    def test_conflicting_world_name_slug_is_blocked(self):
        # World named "الأغاني" exists under a rogue slug
        self.mock_client.list_worlds.return_value = [
            {"id": "w999", "slug": "rogue-music-slug", "name": "الأغاني"}
        ]
        plan = build_plan(self.mock_client)
        self.assertFalse(plan.is_safe)
        self.assertTrue(any("conflicting slug" in b for b in plan.blockers))

    def test_execute_creates_world_and_scopes(self):
        plan = ProvisioningPlan(
            target_url="http://localhost:3002",
            target_environment="local",
            world_action=WorldAction("CREATE", "music", "الأغاني", "draft"),
            scope_actions=[
                ScopeAction("CREATE", spec["slug"], spec["name"], spec["status"])
                for spec in CANONICAL_MUSIC_SCOPES
            ],
            blockers=[],
        )

        self.mock_client.create_world.return_value = {"id": "new-w1"}
        self.mock_client.create_scope.side_effect = [
            {"id": f"new-s{i}"} for i in range(4)
        ]

        result = execute_plan(self.mock_client, plan)

        self.assertEqual(result["worldId"], "new-w1")
        self.assertEqual(result["scopesCreated"], 4)
        self.mock_client.create_world.assert_called_once_with(CANONICAL_MUSIC_WORLD)
        self.assertEqual(self.mock_client.create_scope.call_count, 4)

    def test_execute_idempotent_creates_zero(self):
        plan = ProvisioningPlan(
            target_url="http://localhost:3002",
            target_environment="local",
            world_action=WorldAction("EXISTS_IDENTICAL", "music", "الأغاني", "draft", "existing-w1"),
            scope_actions=[
                ScopeAction("EXISTS_IDENTICAL", spec["slug"], spec["name"], spec["status"], f"existing-s{i}")
                for i, spec in enumerate(CANONICAL_MUSIC_SCOPES)
            ],
            blockers=[],
        )

        result = execute_plan(self.mock_client, plan)

        self.assertEqual(result["worldId"], "existing-w1")
        self.assertEqual(result["scopesCreated"], 0)
        self.mock_client.create_world.assert_not_called()
        self.mock_client.create_scope.assert_not_called()


if __name__ == "__main__":
    unittest.main()
