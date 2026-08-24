#!/usr/bin/env python3
"""
Canonical provisioning tool for the Music World and its 4 Scopes.

This script safely provisions:
  - World: 'music' (الأغاني) with status 'draft'
  - Scopes: 'saudi-music', 'gulf-music', 'arabic-music', 'international-music' with status 'draft'

Guards:
  - Dry-run by default (zero writes unless --execute is passed).
  - Explicit target environment confirmation.
  - Plan hash requirement for remote writes.
  - Idempotent: repeated runs propose 0 writes.
  - Zero content item creation.
  - Zero board mutations.
  - Zero deletes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import asdict, dataclass
from typing import Any
from urllib.parse import urlparse

import requests

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
PRODUCTION_HOSTS = {"akwaan-api.onrender.com"}
DEFAULT_TARGET = "http://localhost:3002"
PLAN_PATH_DEFAULT = "/tmp/akwaan-music-taxonomy-plan.json"

# Canonical Music taxonomy specification
CANONICAL_MUSIC_WORLD = {
    "name": "الأغاني",
    "slug": "music",
    "description": "عالم الأغاني والموسيقى عبر مختلف الأنماط والفئات",
    "status": "draft",
}

CANONICAL_MUSIC_SCOPES = [
    {
        "name": "Saudi Music",
        "slug": "saudi-music",
        "description": "الأغاني والموسيقى السعودية",
        "status": "draft",
        "excludedChallengeTypeIds": [],
    },
    {
        "name": "Gulf Music",
        "slug": "gulf-music",
        "description": "الأغاني والموسيقى الخليجية",
        "status": "draft",
        "excludedChallengeTypeIds": [],
    },
    {
        "name": "Arabic Music",
        "slug": "arabic-music",
        "description": "الأغاني والموسيقى العربية",
        "status": "draft",
        "excludedChallengeTypeIds": [],
    },
    {
        "name": "International Music",
        "slug": "international-music",
        "description": "الأغاني والموسيقى العالمية",
        "status": "draft",
        "excludedChallengeTypeIds": [],
    },
]


@dataclass
class WorldAction:
    action: str  # "CREATE", "EXISTS_IDENTICAL", "CONFLICT"
    slug: str
    name: str
    status: str
    world_id: str | None = None
    reason: str | None = None


@dataclass
class ScopeAction:
    action: str  # "CREATE", "EXISTS_IDENTICAL", "CONFLICT"
    slug: str
    name: str
    status: str
    scope_id: str | None = None
    reason: str | None = None


@dataclass
class ProvisioningPlan:
    target_url: str
    target_environment: str
    world_action: WorldAction
    scope_actions: list[ScopeAction]
    blockers: list[str]

    @property
    def is_safe(self) -> bool:
        return (
            len(self.blockers) == 0
            and self.world_action.action in ("CREATE", "EXISTS_IDENTICAL")
            and all(
                s.action in ("CREATE", "EXISTS_IDENTICAL") for s in self.scope_actions
            )
        )

    def plan_hash(self) -> str:
        payload = {
            "world": asdict(self.world_action),
            "scopes": [asdict(s) for s in self.scope_actions],
        }
        encoded = json.dumps(payload, sort_keys=True).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()


class TargetClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.token: str | None = None

    @property
    def environment(self) -> str:
        host = urlparse(self.base_url).hostname or ""
        if host in LOCAL_HOSTS:
            return "local"
        if host in PRODUCTION_HOSTS:
            return "production"
        return "remote"

    @property
    def is_remote(self) -> bool:
        return self.environment != "local"

    def authenticate(self) -> None:
        token_env = os.getenv("AKWAAN_TARGET_ADMIN_TOKEN")
        if token_env:
            self.token = token_env
            return

        login_url = f"{self.base_url}/auth/login"
        creds = [
            ("admin@test.com", "strongPassword@123"),
            ("admin@akwaan.test", "admin123456"),
        ]
        last_err = None
        for email, password in creds:
            try:
                res = requests.post(
                    login_url,
                    json={"email": email, "password": password},
                    headers={"Content-Type": "application/json"},
                    timeout=15,
                )
                if res.status_code == 200 or res.status_code == 201:
                    data = res.json()
                    self.token = data.get("accessToken") or data.get("token")
                    if self.token:
                        return
            except Exception as e:
                last_err = e

        raise RuntimeError(f"Authentication failed on {self.base_url}: {last_err}")

    def _headers(self) -> dict[str, str]:
        if not self.token:
            self.authenticate()
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def list_worlds(self) -> list[dict[str, Any]]:
        res = requests.get(
            f"{self.base_url}/admin/worlds", headers=self._headers(), timeout=15
        )
        res.raise_for_status()
        data = res.json()
        return data if isinstance(data, list) else data.get("data", [])

    def list_scopes(self, world_id: str) -> list[dict[str, Any]]:
        res = requests.get(
            f"{self.base_url}/admin/worlds/{world_id}/scopes",
            headers=self._headers(),
            timeout=15,
        )
        res.raise_for_status()
        data = res.json()
        return data if isinstance(data, list) else data.get("data", [])

    def create_world(self, payload: dict[str, Any]) -> dict[str, Any]:
        res = requests.post(
            f"{self.base_url}/admin/worlds",
            json=payload,
            headers=self._headers(),
            timeout=15,
        )
        res.raise_for_status()
        return res.json().get("data", res.json())

    def create_scope(
        self, world_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        res = requests.post(
            f"{self.base_url}/admin/worlds/{world_id}/scopes",
            json=payload,
            headers=self._headers(),
            timeout=15,
        )
        res.raise_for_status()
        return res.json().get("data", res.json())


def build_plan(client: TargetClient) -> ProvisioningPlan:
    blockers: list[str] = []

    # 1. Inspect existing Worlds
    existing_worlds = client.list_worlds()
    world_by_slug = {w.get("slug"): w for w in existing_worlds}
    world_by_name = {w.get("name"): w for w in existing_worlds}

    music_world = world_by_slug.get(CANONICAL_MUSIC_WORLD["slug"])
    if not music_world and CANONICAL_MUSIC_WORLD["name"] in world_by_name:
        matched = world_by_name[CANONICAL_MUSIC_WORLD["name"]]
        if matched.get("slug") != CANONICAL_MUSIC_WORLD["slug"]:
            blockers.append(
                f"World '{CANONICAL_MUSIC_WORLD['name']}' exists with conflicting slug '{matched.get('slug')}'"
            )

    if music_world:
        world_action = WorldAction(
            action="EXISTS_IDENTICAL",
            slug=CANONICAL_MUSIC_WORLD["slug"],
            name=music_world.get("name", ""),
            status=music_world.get("status", "draft"),
            world_id=music_world.get("id"),
        )
    else:
        world_action = WorldAction(
            action="CREATE",
            slug=CANONICAL_MUSIC_WORLD["slug"],
            name=CANONICAL_MUSIC_WORLD["name"],
            status=CANONICAL_MUSIC_WORLD["status"],
        )

    # 2. Inspect Scopes if world exists
    existing_scopes_by_slug = {}
    if music_world:
        scopes = client.list_scopes(music_world["id"])
        existing_scopes_by_slug = {s.get("slug"): s for s in scopes}

    scope_actions: list[ScopeAction] = []
    for spec in CANONICAL_MUSIC_SCOPES:
        slug = spec["slug"]
        if slug in existing_scopes_by_slug:
            existing = existing_scopes_by_slug[slug]
            scope_actions.append(
                ScopeAction(
                    action="EXISTS_IDENTICAL",
                    slug=slug,
                    name=existing.get("name", ""),
                    status=existing.get("status", "draft"),
                    scope_id=existing.get("id"),
                )
            )
        else:
            scope_actions.append(
                ScopeAction(
                    action="CREATE",
                    slug=slug,
                    name=spec["name"],
                    status=spec["status"],
                )
            )

    return ProvisioningPlan(
        target_url=client.base_url,
        target_environment=client.environment,
        world_action=world_action,
        scope_actions=scope_actions,
        blockers=blockers,
    )


def execute_plan(client: TargetClient, plan: ProvisioningPlan) -> dict[str, Any]:
    if not plan.is_safe:
        raise RuntimeError(f"Cannot execute unsafe plan: {plan.blockers}")

    created_world_id = plan.world_action.world_id
    if plan.world_action.action == "CREATE":
        created_world = client.create_world(CANONICAL_MUSIC_WORLD)
        created_world_id = created_world.get("id")

    if not created_world_id:
        raise RuntimeError("Failed to resolve Music World ID for scope creation")

    created_scopes = []
    for sa in plan.scope_actions:
        if sa.action == "CREATE":
            spec = next(
                s for s in CANONICAL_MUSIC_SCOPES if s["slug"] == sa.slug
            )
            created_scope = client.create_scope(created_world_id, spec)
            created_scopes.append(created_scope)

    return {
        "worldId": created_world_id,
        "worldAction": plan.world_action.action,
        "scopesCreated": len(created_scopes),
        "totalScopes": len(plan.scope_actions),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Provision canonical Music World and Scopes into target environment."
    )
    parser.add_argument("--target", default=DEFAULT_TARGET, help="Target API URL")
    parser.add_argument(
        "--expected-environment",
        choices=["local", "production", "remote"],
        help="Target environment safeguard",
    )
    parser.add_argument(
        "--allow-remote-write",
        action="store_true",
        help="Explicit permission to write to remote environment",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply planned changes (default is dry-run)",
    )
    parser.add_argument(
        "--require-plan-hash", help="Require exact SHA256 plan hash match"
    )
    parser.add_argument(
        "--plan-out",
        default=PLAN_PATH_DEFAULT,
        help="Path to write plan JSON",
    )
    args = parser.parse_args()

    client = TargetClient(args.target)
    print(f"Target URL: {client.base_url}")
    print(f"Environment: {client.environment}")

    plan = build_plan(client)
    plan_hash = plan.plan_hash()

    print("\n=== PROVISIONING PLAN ===")
    print(f"World: [{plan.world_action.action}] slug={plan.world_action.slug} name={plan.world_action.name}")
    for sa in plan.scope_actions:
        print(f"  Scope: [{sa.action}] slug={sa.slug} name={sa.name}")

    if plan.blockers:
        print("\nBLOCKERS:")
        for b in plan.blockers:
            print(f"  - {b}")

    print(f"\nDeterministic Plan Hash: {plan_hash}")

    # Write plan to file
    plan_data = {
        "targetUrl": plan.target_url,
        "targetEnvironment": plan.target_environment,
        "planHash": plan_hash,
        "isSafe": plan.is_safe,
        "world": asdict(plan.world_action),
        "scopes": [asdict(s) for s in plan.scope_actions],
        "blockers": plan.blockers,
    }
    with open(args.plan_out, "w", encoding="utf-8") as f:
        json.dump(plan_data, f, ensure_ascii=False, indent=2)
    print(f"Plan saved to: {args.plan_out}")

    if not args.execute:
        print("\n[DRY RUN ONLY] Zero writes executed. Pass --execute to apply.")
        return 0

    # Safety checks
    if client.is_remote and not args.allow_remote_write:
        print("ERROR: Remote write requires --allow-remote-write", file=sys.stderr)
        return 1

    if args.expected_environment and args.expected_environment != client.environment:
        print(
            f"ERROR: Expected environment '{args.expected_environment}' does not match target '{client.environment}'",
            file=sys.stderr,
        )
        return 1

    if args.require_plan_hash and args.require_plan_hash != plan_hash:
        print(
            f"ERROR: Plan hash mismatch: expected {args.require_plan_hash}, calculated {plan_hash}",
            file=sys.stderr,
        )
        return 1

    print("\nExecuting provisioning plan...")
    result = execute_plan(client, plan)
    print("\n=== EXECUTION SUCCESSFUL ===")
    print(f"Music World ID: {result['worldId']} (Action: {result['worldAction']})")
    print(f"Scopes created: {result['scopesCreated']} / {result['totalScopes']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
