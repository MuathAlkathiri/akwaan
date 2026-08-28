#!/usr/bin/env python3
"""Synchronise product-approved player instructions onto ChallengeTypes.

Run (dry-run, the default — reads only):
    python3 ai/scripts/sync_player_instructions.py \
        --source ~/Downloads/akwaan-challenge-player-instructions-approved-utf8.json \
        --require-source-sha 927072a71949b364c8c50318607df2235379aa53ffe255a461630b144c002792 \
        --target https://akwaan-api.onrender.com --expected-environment production

Execute (guarded; requires every flag, an authenticated admin, and the reviewed hash):
    ... --execute --allow-remote-write --require-plan-hash <sha256>

Narrow by construction. The ONLY writes this tool can ever make are:
  * a field-level PATCH of `defaultPresentation.playerInstructions` on an existing
    ChallengeType (every sibling presentation field is read from the target and
    echoed back verbatim, so nothing else changes), and
  * a single canonical `marhala` ChallengeType CREATE when the target is missing it.
There is no delete verb, and it never touches Boards, ContentItems, Worlds or
Scopes. It reuses the promotion tool's authentication, environment classification
and remote-write safety model.

The approved Arabic copy is loaded verbatim from the verified UTF-8 JSON and never
rewritten, normalised, or regenerated.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Reuse the promotion tool's proven safety infrastructure rather than re-implement it.
from promote_approved_content import (  # noqa: E402
    Authenticator,
    classify_environment,
    is_remote,
    resolve_token,
    source_commit,
    PromotionError,
)
import requests  # noqa: E402


# The eight ChallengeTypes the approved source owns, by stable slug.
APPROVED_SLUGS = (
    "read-your-opponent", "closest", "bomb", "combo",
    "distributed-information", "one-clue", "marhala", "top-5",
)

# Canonical `marhala` ChallengeType, mirrored VERBATIM from the single authoritative
# source of truth for runtime-owned mechanic identity:
#   backend/src/modules/world-content/domain/production-mechanic.definition.ts
#     PRODUCTION_MECHANICS 'marhala' (slug/family/itemStructure/answerMode/seed) and
#     definition() -> matchScoringRuleId = SCORING_RULE_IDS.CHALLENGE_WIN
#   backend/src/modules/world-content/domain/world-content.constants.ts
#     SIGNATURE='signature', CONTINUOUS='continuous', MATCH='match', MARHALA_SLUG='marhala'
#   backend/src/modules/scoring/domain/scoring-rule.ts  CHALLENGE_WIN='challenge.win'
# The non-instruction fields come from there and nowhere else; playerInstructions is
# grafted on from the approved JSON. `assert_marhala_matches_target_metadata` cross-
# checks the SYSTEM fields against the target's own /admin/challenge-types/metadata at
# plan time, so any drift from the deployed code definition is caught before a CREATE.
MARHALA_CANONICAL = {
    "slug": "marhala",
    "name": "المرحلة",
    "description": (
        "سباق على لوحة المرحلة: اختر مستوى الخطر، وأجب، وتحرّك — "
        "والقفزات والفخاخ تقرر الباقي."
    ),
    "family": "signature",
    "itemStructure": "continuous",
    "answerMode": "match",
    "scoringRuleId": "challenge.win",
    "status": "active",
    "defaultPresentation": {
        "inputType": "phone-text",
        "timerSeconds": 30,
        "soundPack": None,
        "revealStyle": None,
    },
}
MARHALA_SYSTEM_FIELDS = ("family", "itemStructure", "answerMode")


# --------------------------------------------------------------------------- #
# A minimal admin client with exactly the verbs this tool needs. Deliberately
# separate from the promotion tool's AdminApi (which forbids PATCH) so this tool's
# write surface is PATCH + POST of ChallengeTypes only, and never a delete.
# --------------------------------------------------------------------------- #

class ChallengeTypeAdminApi:
    def __init__(self, base_url: str, token: str | None, *, writes_enabled: bool,
                 session: Any | None = None, timeout: int = 60):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.writes_enabled = writes_enabled
        self.timeout = timeout
        self._session = session or requests.Session()

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _request(self, method: str, path: str, **kwargs: Any):
        if method.upper() in ("POST", "PUT", "PATCH", "DELETE") and not self.writes_enabled:
            raise PromotionError(
                f"refusing a {method.upper()} to {path} in dry-run. Writes require --execute."
            )
        response = self._session.request(
            method, self.base_url + path, headers=self._headers(),
            timeout=self.timeout, **kwargs)
        status = response.status_code
        try:
            body = response.json()
        except ValueError:
            body = {}
        return status, body

    @staticmethod
    def _unwrap(body: Any) -> Any:
        if isinstance(body, dict) and "data" in body:
            return body["data"]
        return body

    def get(self, path: str) -> Any:
        status, body = self._request("GET", path)
        if status >= 400:
            raise PromotionError(f"GET {path} failed with HTTP {status}")
        return self._unwrap(body)

    def create_challenge_type(self, payload: dict) -> Any:
        status, body = self._request("POST", "/admin/challenge-types", json=payload)
        if status >= 400:
            raise PromotionError(f"POST /admin/challenge-types failed with HTTP {status}: {body}")
        return self._unwrap(body)

    def patch_challenge_type(self, challenge_type_id: str, payload: dict) -> Any:
        status, body = self._request(
            "PATCH", f"/admin/challenge-types/{challenge_type_id}", json=payload)
        if status >= 400:
            raise PromotionError(
                f"PATCH /admin/challenge-types/{challenge_type_id} failed with HTTP {status}: {body}")
        return self._unwrap(body)

    # Note: there is intentionally no delete/put method.


# --------------------------------------------------------------------------- #
# Approved source
# --------------------------------------------------------------------------- #

def load_source(path: str, *, require_sha: str | None = None) -> dict[str, dict]:
    """Parse the approved JSON, optionally verifying its SHA-256 first, and return
    a slug -> playerInstructions map. The Arabic is taken verbatim."""
    expanded = os.path.expanduser(path)
    if not os.path.exists(expanded):
        raise PromotionError(f"approved source not found: {path}")
    raw = open(expanded, "rb").read()
    actual_sha = hashlib.sha256(raw).hexdigest()
    if require_sha and actual_sha != require_sha:
        raise PromotionError(
            f"approved source SHA-256 mismatch: expected {require_sha}, got {actual_sha}. "
            "Refusing to use an unverified copy.")
    data = json.loads(raw.decode("utf-8"))
    entries = data.get("challengeTypes") or []
    by_slug: dict[str, dict] = {}
    for entry in entries:
        slug = entry.get("slug")
        pi = entry.get("playerInstructions")
        if not slug or pi is None:
            raise PromotionError(f"source entry missing slug or playerInstructions: {entry!r}")
        by_slug[slug] = normalize_instructions(pi)
    got = set(by_slug)
    if got != set(APPROVED_SLUGS):
        missing = set(APPROVED_SLUGS) - got
        extra = got - set(APPROVED_SLUGS)
        raise PromotionError(f"source slug set invalid — missing={sorted(missing)} extra={sorted(extra)}")
    return by_slug


def normalize_instructions(value: Any) -> dict | None:
    """Mirror the backend's normalizePlayerInstructions: trim, drop empties, omit
    highlights when none survive, null when nothing is authored. Used for both the
    approved copy and the target's current copy so UNCHANGED is judged exactly as
    the backend would store it. The Arabic text itself is never altered — only
    surrounding whitespace is trimmed, exactly as the backend does."""
    if not value:
        return None
    summary = (value.get("summary") or "").strip()
    steps = [s.strip() for s in (value.get("steps") or []) if (s or "").strip()]
    highlights = [h.strip() for h in (value.get("highlights") or []) if (h or "").strip()]
    if not summary and not steps and not highlights:
        return None
    out: dict[str, Any] = {"summary": summary, "steps": steps}
    if highlights:
        out["highlights"] = highlights
    return out


# --------------------------------------------------------------------------- #
# Planning
# --------------------------------------------------------------------------- #

@dataclass
class Op:
    slug: str
    action: str            # CREATE | PATCH | UNCHANGED | CONFLICT
    detail: str = ""
    target_id: str | None = None
    # For PATCH: the full defaultPresentation we would send (siblings echoed verbatim).
    patch_presentation: dict | None = None
    # For CREATE: the full payload.
    create_payload: dict | None = None
    approved_instructions: dict | None = None


@dataclass
class Plan:
    target: str
    environment: str
    source_sha: str
    commit: str
    ops: list[Op] = field(default_factory=list)
    generated_at: str = ""

    def counts(self) -> dict[str, int]:
        c = {"CREATE": 0, "PATCH": 0, "UNCHANGED": 0, "CONFLICT": 0}
        for op in self.ops:
            c[op.action] = c.get(op.action, 0) + 1
        c["writes"] = c["CREATE"] + c["PATCH"]
        c["deletes"] = 0
        return c

    def blockers(self) -> list[str]:
        return [f"{op.slug}: {op.detail}" for op in self.ops if op.action == "CONFLICT"]

    def fingerprint(self) -> str:
        """Decision- AND content-sensitive: a changed target OR a changed approved
        copy yields a different hash, so a stale --require-plan-hash cannot execute."""
        canonical = {
            "target": self.target,
            "sourceSha": self.source_sha,
            "ops": sorted(
                (op.slug, op.action,
                 hashlib.sha256(json.dumps(op.approved_instructions, ensure_ascii=False,
                                           sort_keys=True).encode()).hexdigest())
                for op in self.ops
            ),
        }
        return hashlib.sha256(
            json.dumps(canonical, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def assert_marhala_matches_target_metadata(api: ChallengeTypeAdminApi) -> None:
    """Prove the target's deployed code knows `marhala` with the same system fields
    the CREATE payload uses — i.e. the plugin/launcher/runtime are registered there.
    Guards a CREATE against drift between this tool and the deployed definition."""
    metadata = api.get("/admin/challenge-types/metadata") or {}
    mechanics = {m.get("slug"): m for m in (metadata.get("productionMechanics") or [])}
    marhala = mechanics.get("marhala")
    if not marhala:
        raise PromotionError(
            "target does not register `marhala` as a production mechanic "
            "(no plugin/launcher deployed) — refusing to CREATE it.")
    for f in MARHALA_SYSTEM_FIELDS:
        if str(marhala.get(f)) != str(MARHALA_CANONICAL[f]):
            raise PromotionError(
                f"marhala system field {f}={marhala.get(f)!r} on target differs from "
                f"canonical {MARHALA_CANONICAL[f]!r}; refusing to CREATE from a drifted definition.")


def all_challenge_types(api: ChallengeTypeAdminApi) -> list[dict]:
    """The raw list, WITHOUT de-duplication — so a slug that appears twice on the
    target is seen as the conflict it is, never silently collapsed to one."""
    return list(api.get("/admin/challenge-types") or [])


def build_plan(source: dict[str, dict], api: ChallengeTypeAdminApi) -> Plan:
    existing = all_challenge_types(api)
    ops: list[Op] = []

    for slug in APPROVED_SLUGS:
        approved = source[slug]
        matches = [ct for ct in existing if ct.get("slug") == slug]

        if len(matches) > 1:
            ops.append(Op(slug, "CONFLICT",
                          detail=f"{len(matches)} ChallengeTypes share slug '{slug}' on target"))
            continue

        current = matches[0] if matches else None

        if current is None:
            if slug == "marhala":
                assert_marhala_matches_target_metadata(api)
                payload = dict(MARHALA_CANONICAL)
                payload["defaultPresentation"] = {
                    **MARHALA_CANONICAL["defaultPresentation"],
                    "playerInstructions": approved,
                }
                ops.append(Op(slug, "CREATE", detail="canonical marhala missing on target",
                              create_payload=payload, approved_instructions=approved))
            else:
                ops.append(Op(slug, "CONFLICT",
                              detail=f"ChallengeType '{slug}' does not exist on target "
                                     "(this tool creates only the canonical marhala)"))
            continue

        # Exists → field-level patch of playerInstructions, siblings preserved.
        presentation = dict(current.get("defaultPresentation") or {})
        current_pi = normalize_instructions(presentation.get("playerInstructions"))
        if current_pi == approved:
            ops.append(Op(slug, "UNCHANGED", detail="playerInstructions already match",
                          target_id=str(current.get("id")), approved_instructions=approved))
            continue
        merged = {**presentation, "playerInstructions": approved}
        ops.append(Op(slug, "PATCH",
                      detail="defaultPresentation.playerInstructions",
                      target_id=str(current.get("id")),
                      patch_presentation=merged, approved_instructions=approved))

    return Plan(
        target=api.base_url,
        environment=classify_environment(api.base_url),
        source_sha=SOURCE_SHA_HOLDER["sha"],
        commit=source_commit(),
        ops=ops,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


SOURCE_SHA_HOLDER = {"sha": ""}  # set in main after loading, kept out of the hash of copy


def execute_plan(plan: Plan, api: ChallengeTypeAdminApi) -> dict[str, int]:
    if plan.blockers():
        raise PromotionError("refusing to execute a plan with conflicts")
    stats = {"created": 0, "patched": 0, "unchanged": 0, "deletes": 0, "failed": 0}
    for op in plan.ops:
        if op.action == "UNCHANGED":
            stats["unchanged"] += 1
        elif op.action == "CREATE":
            api.create_challenge_type(op.create_payload)
            stats["created"] += 1
        elif op.action == "PATCH":
            api.patch_challenge_type(op.target_id, {"defaultPresentation": op.patch_presentation})
            stats["patched"] += 1
    return stats


# --------------------------------------------------------------------------- #
# CLI + rendering
# --------------------------------------------------------------------------- #

def render(plan: Plan) -> None:
    counts = plan.counts()
    print(f"\n=== PLAYER-INSTRUCTIONS SYNC PLAN ===")
    print(f"  target      : {plan.target}  [{plan.environment}]")
    print(f"  source sha  : {plan.source_sha}")
    print(f"  source commit: {plan.commit[:12]}")
    print(f"\n  {'SLUG':24} {'ACTION':10} DETAIL")
    for op in plan.ops:
        print(f"  {op.slug:24} {op.action:10} {op.detail}")
    print(f"\n  CREATE={counts['CREATE']} PATCH={counts['PATCH']} "
          f"UNCHANGED={counts['UNCHANGED']} CONFLICT={counts['CONFLICT']} DELETE=0")
    print(f"  Board writes: 0   ContentItem writes: 0   Other collections: 0")
    for op in plan.ops:
        if op.action == "CREATE":
            print(f"\n  marhala CREATE payload:\n"
                  f"{json.dumps(op.create_payload, ensure_ascii=False, indent=2)}")
    if plan.blockers():
        print(f"\n  BLOCKERS ({len(plan.blockers())}):")
        for b in plan.blockers():
            print(f"    - {b}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sync approved ChallengeType player instructions.")
    parser.add_argument("--source", required=True, help="approved UTF-8 JSON")
    parser.add_argument("--require-source-sha", help="refuse unless the source hashes to this")
    parser.add_argument("--target", required=True)
    parser.add_argument("--expected-environment", choices=["local", "production", "unknown"])
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--allow-remote-write", action="store_true")
    parser.add_argument("--require-plan-hash")
    parser.add_argument("--plan-out", default="/tmp/akwaan-player-instructions-plan.json")
    parser.add_argument("--no-interactive", action="store_true")
    args = parser.parse_args(argv)

    target_env = classify_environment(args.target)
    if args.expected_environment and args.expected_environment != target_env:
        print(f"ERROR: --expected-environment {args.expected_environment} but target resolves "
              f"to '{target_env}' ({args.target})", file=sys.stderr)
        return 2
    if args.execute and is_remote(args.target):
        if not args.allow_remote_write:
            print(f"ERROR: {args.target} is remote ({target_env}); writing requires "
                  "--allow-remote-write.", file=sys.stderr)
            return 2
        if not args.expected_environment:
            print("ERROR: writing to a remote target requires --expected-environment.", file=sys.stderr)
            return 2

    try:
        raw = open(os.path.expanduser(args.source), "rb").read()
        SOURCE_SHA_HOLDER["sha"] = hashlib.sha256(raw).hexdigest()
        source = load_source(args.source, require_sha=args.require_source_sha)

        token = resolve_token("TARGET", args.target, interactive=not args.no_interactive)
        api = ChallengeTypeAdminApi(args.target, token, writes_enabled=args.execute)

        plan = build_plan(source, api)
        render(plan)
        document = {
            "generatedAt": plan.generated_at, "target": plan.target,
            "environment": plan.environment, "sourceSha": plan.source_sha,
            "ops": [{"slug": o.slug, "action": o.action, "detail": o.detail} for o in plan.ops],
            "counts": plan.counts(),
        }
        document["planHash"] = plan.fingerprint()
        with open(args.plan_out, "w", encoding="utf-8") as handle:
            json.dump(document, handle, ensure_ascii=False, indent=1)
        print(f"\n  plan written : {args.plan_out}")
        print(f"  plan hash    : {document['planHash']}")

        if not args.execute:
            print("  mode         : DRY-RUN — no write attempted")
            return 1 if plan.blockers() else 0
        if args.require_plan_hash and args.require_plan_hash != document["planHash"]:
            print("ERROR: plan hash mismatch; the target or source changed since review.",
                  file=sys.stderr)
            return 2
        if plan.blockers():
            print("ERROR: refusing to execute — plan has conflicts.", file=sys.stderr)
            return 2
        stats = execute_plan(plan, api)
        print(f"  EXECUTED     : {stats}")
        return 1 if stats["failed"] else 0
    except PromotionError as error:
        print(f"\nBLOCKED: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
