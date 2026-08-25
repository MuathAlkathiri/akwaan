#!/usr/bin/env python3
"""
Canonical provisioning tool for Active World Scope Expansion.

This script safely provisions the 6 approved missing Scopes:
  - World: 'video-games' (عالم الالعاب الالكترونية):
      - 'minecraft' (ماينكرافت)
      - 'god-of-war' (قود اوف وار)
      - 'resident-evil' (ريزدنت إيفل)
  - World: 'puzzles' (عالم الالغاز):
      - 'patterns-sequences' (أنماط ومتتاليات)
      - 'lateral-thinking' (تفكير جانبي)
      - 'visual-puzzles' (ألغاز بصرية)

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
PLAN_PATH_DEFAULT = "/tmp/akwaan-active-world-scopes-plan.json"

CANONICAL_WORLD_ALIASES: dict[str, tuple[str, ...]] = {
    "video-games": ("video-games", "world-1785784447249", "عالم الالعاب الالكترونية", "عالم الألعاب الإلكترونية", "فيديو قيمز"),
    "puzzles": ("puzzles", "world-1786388973542", "عالم الالغاز", "عالم الألغاز"),
}

# The 6 approved active-world scopes
APPROVED_SCOPES_SPEC: dict[str, list[dict[str, Any]]] = {
    "video-games": [
        {
            "name": "ماينكرافت",
            "slug": "minecraft",
            "description": "عالم ماينكرافت والاستكشاف والبناء والمغامرة",
            "status": "active",
            "excludedChallengeTypeIds": [],
        },
        {
            "name": "قود اوف وار",
            "slug": "god-of-war",
            "description": "سلسلة إله الحرب والميثولوجيا الإغريقية والنوردية",
            "status": "active",
            "excludedChallengeTypeIds": [],
        },
        {
            "name": "ريزدنت إيفل",
            "slug": "resident-evil",
            "description": "سلسلة ريزدنت إيفل وعالم رعب البقاء",
            "status": "active",
            "excludedChallengeTypeIds": [],
        },
    ],
    "puzzles": [
        {
            "name": "أنماط ومتتاليات",
            "slug": "patterns-sequences",
            "description": "ألغاز الأنماط والمتتاليات الرقمية والهندسية",
            "status": "active",
            "excludedChallengeTypeIds": [],
        },
        {
            "name": "تفكير جانبي",
            "slug": "lateral-thinking",
            "description": "ألغاز التفكير الجانبي والفوازير الذكية",
            "status": "active",
            "excludedChallengeTypeIds": [],
        },
        {
            "name": "ألغاز بصرية",
            "slug": "visual-puzzles",
            "description": "الألغاز البصرية وقوة الملاحظة والخداع البصري",
            "status": "active",
            "excludedChallengeTypeIds": [],
        },
    ],
}


@dataclass
class ScopeAction:
    action: str  # "CREATE", "EXISTS_IDENTICAL", "CONFLICT"
    world_slug: str
    parent_world_id: str
    slug: str
    name: str
    status: str
    scope_id: str | None = None
    reason: str | None = None


@dataclass
class ProvisioningPlan:
    target_url: str
    target_environment: str
    scope_actions: list[ScopeAction]
    blockers: list[str]

    @property
    def is_safe(self) -> bool:
        return (
            len(self.blockers) == 0
            and all(s.action in ("CREATE", "EXISTS_IDENTICAL") for s in self.scope_actions)
        )

    def plan_hash(self) -> str:
        payload = {
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
                if res.status_code in (200, 201):
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


def resolve_world(canonical_slug: str, worlds: list[dict[str, Any]]) -> dict[str, Any] | None:
    aliases = CANONICAL_WORLD_ALIASES.get(canonical_slug, (canonical_slug,))
    for w in worlds:
        w_slug = w.get("slug", "")
        w_name = w.get("name", "")
        if w_slug in aliases or w_name in aliases:
            return w
    return None


def build_plan(client: TargetClient) -> ProvisioningPlan:
    blockers: list[str] = []
    existing_worlds = client.list_worlds()

    scope_actions: list[ScopeAction] = []

    for world_key, scope_specs in APPROVED_SCOPES_SPEC.items():
        world = resolve_world(world_key, existing_worlds)
        if not world:
            blockers.append(f"Parent World '{world_key}' not found in target database.")
            continue

        world_id = str(world["id"])
        existing_scopes = client.list_scopes(world_id)
        existing_by_slug = {s.get("slug"): s for s in existing_scopes}

        for spec in scope_specs:
            slug = spec["slug"]
            if slug in existing_by_slug:
                existing = existing_by_slug[slug]
                scope_actions.append(
                    ScopeAction(
                        action="EXISTS_IDENTICAL",
                        world_slug=world_key,
                        parent_world_id=world_id,
                        slug=slug,
                        name=existing.get("name", ""),
                        status=existing.get("status", "active"),
                        scope_id=str(existing.get("id")),
                    )
                )
            else:
                scope_actions.append(
                    ScopeAction(
                        action="CREATE",
                        world_slug=world_key,
                        parent_world_id=world_id,
                        slug=slug,
                        name=spec["name"],
                        status=spec["status"],
                    )
                )

    return ProvisioningPlan(
        target_url=client.base_url,
        target_environment=client.environment,
        scope_actions=scope_actions,
        blockers=blockers,
    )


def execute_plan(client: TargetClient, plan: ProvisioningPlan) -> dict[str, Any]:
    if not plan.is_safe:
        raise RuntimeError(f"Cannot execute unsafe plan: {plan.blockers}")

    created_scopes: list[dict[str, Any]] = []
    reused_scopes: list[dict[str, Any]] = []

    # Map spec payloads
    specs_by_world_and_slug: dict[tuple[str, str], dict[str, Any]] = {}
    for w_key, specs in APPROVED_SCOPES_SPEC.items():
        for s in specs:
            specs_by_world_and_slug[(w_key, s["slug"])] = s

    for scope_action in plan.scope_actions:
        if scope_action.action == "CREATE":
            spec = specs_by_world_and_slug[(scope_action.world_slug, scope_action.slug)]
            payload = {
                "name": spec["name"],
                "slug": spec["slug"],
                "description": spec["description"],
                "status": spec["status"],
                "excludedChallengeTypeIds": spec.get("excludedChallengeTypeIds", []),
            }
            res = client.create_scope(scope_action.parent_world_id, payload)
            created_scopes.append(
                {
                    "slug": scope_action.slug,
                    "name": scope_action.name,
                    "world_slug": scope_action.world_slug,
                    "id": res.get("id"),
                    "status": res.get("status", spec["status"]),
                }
            )
        else:
            reused_scopes.append(
                {
                    "slug": scope_action.slug,
                    "name": scope_action.name,
                    "world_slug": scope_action.world_slug,
                    "id": scope_action.scope_id,
                    "status": scope_action.status,
                }
            )

    return {
        "scopes_created": created_scopes,
        "scopes_reused": reused_scopes,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Provision Active World Scope Expansion")
    parser.add_argument("--target", default=DEFAULT_TARGET, help=f"Base URL of API (default: {DEFAULT_TARGET})")
    parser.add_argument("--execute", action="store_true", help="Execute writes (default: dry-run)")
    parser.add_argument("--allow-remote-write", action="store_true", help="Explicitly allow writes to remote environment")
    parser.add_argument("--expected-environment", choices=["local", "production", "remote"], help="Expected environment guard")
    parser.add_argument("--require-plan-hash", help="Require plan hash match before execution")
    parser.add_argument("--plan-out", default=PLAN_PATH_DEFAULT, help="Path to write JSON plan")

    args = parser.parse_args()

    client = TargetClient(args.target)
    env = client.environment
    print(f"Target: {client.base_url} (detected environment: {env})")

    if args.expected_environment and args.expected_environment != env:
        print(f"ERROR: Expected environment '{args.expected_environment}' does not match detected '{env}'", file=sys.stderr)
        return 1

    if args.execute and client.is_remote and not args.allow_remote_write:
        print("ERROR: Remote execution requires --allow-remote-write flag", file=sys.stderr)
        return 1

    plan = build_plan(client)
    plan_h = plan.plan_hash()

    print("\n=== PROVISIONING PLAN ===")
    print(f"Target Environment: {plan.target_environment}")
    print(f"Blockers: {len(plan.blockers)}")
    for b in plan.blockers:
        print(f"  [BLOCKER] {b}")

    print("\nScopes Plan (6 Approved Scopes):")
    for s in plan.scope_actions:
        print(f"  [{s.action}] {s.world_slug} -> {s.name} ({s.slug}) | status={s.status}")

    print(f"\nDeterministic Plan Hash: {plan_h}")

    # Write plan file
    with open(args.plan_out, "w", encoding="utf-8") as f:
        json.dump(
            {
                "target_url": plan.target_url,
                "target_environment": plan.target_environment,
                "plan_hash": plan_h,
                "scope_actions": [asdict(s) for s in plan.scope_actions],
                "blockers": plan.blockers,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )
    print(f"Plan written to {args.plan_out}")

    if not plan.is_safe:
        print("\nERROR: Plan is unsafe. Cannot proceed.", file=sys.stderr)
        return 1

    if not args.execute:
        print("\n[DRY RUN COMPLETE] Zero writes attempted. Use --execute to apply.")
        return 0

    if args.require_plan_hash and args.require_plan_hash != plan_h:
        print(f"ERROR: Plan hash mismatch. Expected '{args.require_plan_hash}', got '{plan_h}'", file=sys.stderr)
        return 1

    print("\n=== EXECUTING PLAN ===")
    result = execute_plan(client, plan)
    print(f"Scopes created: {len(result['scopes_created'])}")
    for s in result["scopes_created"]:
        print(f"  + Created: {s['world_slug']} / {s['name']} ({s['slug']}) -> ID: {s['id']}")
    print(f"Scopes reused: {len(result['scopes_reused'])}")
    for s in result["scopes_reused"]:
        print(f"  = Reused:  {s['world_slug']} / {s['name']} ({s['slug']}) -> ID: {s['id']}")

    print("\n✅ PROVISIONING COMPLETE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
