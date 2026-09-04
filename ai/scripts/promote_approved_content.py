#!/usr/bin/env python3
"""Promote an *approved* content milestone from one Akwaan runtime to another.

Why this exists
---------------
`deployment/scripts/copy-local-db-to-atlas.sh` is a whole-database
`mongodump`/`mongorestore`. It cannot express an allowlist, so promoting one
approved milestone with it would also carry smoke fixtures, exposure rows, local
accounts, matches, live sessions, runtimes and the local المرحلة board binding.
This tool works at the **Scope / ContentItem** level instead, through the same
Admin API a human authoring session uses, so what reaches the target is exactly
what a named milestone declares and nothing else.

It is a promoter, not a cloner: it discovers nothing on its own. Every Scope it
may touch is named in `MILESTONES`, every item it may promote must carry that
milestone's source-marker prefix, and the counts must match what the milestone
declares. Anything unexpected fails the manifest rather than being skipped
quietly — a silent skip is how the wrong dataset reaches production looking fine.

Safety model
------------
* Default target is local. Production is never inferred from `NODE_ENV`.
* Dry-run is the default, and in dry-run the HTTP client **physically refuses**
  to issue a mutating verb — the guard is in the transport, not in a branch.
* Writing to a remote target additionally needs `--allow-remote-write` *and*
  `--expected-environment` matching what the target host actually resolves to.
* There is no delete, prune, replace or sync-delete path anywhere in this file,
  and the client implements no verb that could remove data.
* Identity is the canonical `metadata.source` marker; nothing is matched by
  prompt text, list order, or a local Mongo `_id`.
* Cross-runtime references are resolved **by slug** on the target, so a local
  ObjectId never travels to another environment.

Usage
-----
    # plan against the local runtime (default, read-only)
    python3 ai/scripts/promote_approved_content.py --milestone anime-expansion

    # plan against production, still read-only; a login code is mailed and
    # entered interactively
    AKWAAN_TARGET_ADMIN_EMAIL=admin@example.com \
    python3 ai/scripts/promote_approved_content.py --milestone anime-expansion \
        --target https://akwaan-api.onrender.com --expected-environment production

    # write to production: three explicit flags, plus the reviewed plan's hash
    python3 ai/scripts/promote_approved_content.py --milestone anime-expansion \
        --target https://akwaan-api.onrender.com --expected-environment production \
        --execute --allow-remote-write --require-plan-hash <sha256>

Authentication follows the product's own model, which is **passwordless**: the
tool asks the runtime to mail a six-digit code, prompts for it with `getpass`,
exchanges it at `/auth/otp/verify` for the same bearer token the Admin UI carries,
and holds it in memory only. No password is required or wanted for production —
those accounts have none. `AKWAAN_{SOURCE,TARGET}_ADMIN_TOKEN` remains available
as an advanced override. Nothing about a credential is printed, logged, or
written to the plan file.
"""

from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable
from urllib.parse import urlparse

import requests

from source_pack_selection import select_forward_items

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
PRODUCTION_HOSTS = {"akwaan-api.onrender.com"}
DEFAULT_TARGET = "http://localhost:3002"
DEFAULT_SOURCE = "http://localhost:3002"
PLAN_PATH_DEFAULT = "/tmp/akwaan-production-promotion-plan.json"

# Mechanic slugs this tool will never promote, whatever a manifest claims.
FORBIDDEN_MECHANIC_SLUGS = {"marhala"}
# Source-marker fragments that mark content as never-promotable.
FORBIDDEN_SOURCE_FRAGMENTS = ("smoke-fixture", "local-dev-", "pilot", "playtest")
# Mechanic payload keys that identify excluded mechanics regardless of slug.
FORBIDDEN_PAYLOAD_KEYS = ("marhalaDifficulty",)


# --------------------------------------------------------------------------- #
# Approved milestones — the entire allowlist. Nothing outside this is promotable.
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class Milestone:
    key: str
    label: str
    #: Scope slugs, exactly. A slug absent here can never be created or written.
    scope_slugs: tuple[str, ...]
    #: Every promotable item's `metadata.source` must start with this.
    source_prefix: str
    #: mechanic slug -> expected item count, asserted before anything is planned.
    expected_by_mechanic: dict[str, int]
    expected_items: int
    #: When set, items are read from this repository file (a deterministic
    #: authoring artifact) instead of a source runtime. Used for content that is
    #: reviewed as a file and never seeded into a dev DB. The file path is
    #: repository-relative.
    source_file: str | None = None
    #: The single World these items belong to, required for a file source (a file
    #: has no runtime to discover the World from).
    world_slug: str | None = None
    #: This milestone reads a pack that is a *generated authoring artifact* rather
    #: than a tracked repository file, so it carries no `source_file` and the
    #: operator supplies the pack with `--source-file`.
    #:
    #: The release contract — which Scopes may be written, how many items, which
    #: mechanics, which source prefix — stays canonical and reviewable here. Only
    #: the batch itself is external, because committing generated packs would put
    #: content in Git that the runtime DB already owns. A milestone marked this way
    #: refuses to run without an explicit path: it can never silently read a stale
    #: file or a file someone happened to leave in the working tree.
    external_source: bool = False
    #: A NARROW, per-milestone exception to the global mechanic ban. A mechanic in
    #: FORBIDDEN_MECHANIC_SLUGS is still rejected for every OTHER milestone; only
    #: the milestone that explicitly lists it here may carry it.
    allow_mechanic_slugs: frozenset = frozenset()
    #: The same, for FORBIDDEN_PAYLOAD_KEYS. Scoped to this milestone only.
    allow_payload_keys: tuple = ()
    #: Exact item count each Scope must carry (e.g. 9). None disables the check.
    per_scope_items: int | None = None
    #: The mechanicPayload key that names an item's difficulty band, and the exact
    #: count required per band per Scope, e.g. {"easy": 3, "medium": 3, "hard": 3}.
    difficulty_key: str | None = None
    per_scope_difficulty: dict | None = None

    @property
    def expected_scopes(self) -> int:
        return len(self.scope_slugs)


MILESTONES: dict[str, Milestone] = {
    "anime-expansion": Milestone(
        key="anime-expansion",
        label="Anime expansion (dragon-ball, demon-slayer, jujutsu-kaisen)",
        scope_slugs=("dragon-ball", "demon-slayer", "jujutsu-kaisen"),
        source_prefix="anime-scope-expansion-2026-08-20",
        expected_by_mechanic={
            "read-your-opponent": 27,
            "closest": 27,
            "combo": 36,
            "bomb": 45,
        },
        expected_items=135,
    ),
    "football-expansion": Milestone(
        key="football-expansion",
        label="Football expansion (la-liga, serie-a, football-legends)",
        scope_slugs=("la-liga", "serie-a", "football-legends"),
        source_prefix="football-scope-expansion-2026-08-20",
        expected_by_mechanic={
            "read-your-opponent": 27,
            "closest": 27,
            "top-5": 27,
            "bomb": 45,
        },
        expected_items=126,
    ),
    # The final, human-approved Football Bomb Question Craft R1 batch. Fifteen items
    # across 3 original Football Scopes (Premier League, Champions League, World Cup).
    # Modality is mixed: 9 text-only, 6 image. This is the first batch to exercise the
    # multimodal Bomb capability in production. Read from its reviewed repository file.
    "football-bomb-r1": Milestone(
        key="football-bomb-r1",
        label="Football Bomb Question Craft R1 (15 items: 9 text, 6 image)",
        scope_slugs=("premier-league", "champions-league", "world-cup"),
        source_prefix="bomb-football-question-craft-r1",
        expected_by_mechanic={"bomb": 15},
        expected_items=15,
        source_file="ai/scripts/data/bomb-football-question-craft-r1.source.json",
        world_slug="football",
        per_scope_items=5,
    ),
    # The final, human-approved Saudi League Bomb Question Craft R1 batch. Fifteen items
    # across Saudi League Scope. Modality: 10 text-only, 5 image.
    "saudi-league-bomb-r1": Milestone(
        key="saudi-league-bomb-r1",
        label="Saudi League Bomb Question Craft R1 (15 items: 10 text, 5 image)",
        scope_slugs=("saudi-league",),
        source_prefix="bomb-saudi-league-question-craft-r1",
        expected_by_mechanic={"bomb": 15},
        expected_items=15,
        source_file="ai/scripts/data/bomb-saudi-league-question-craft-r1.source.json",
        world_slug="football",
        per_scope_items=15,
    ),
    # The final, human-approved Marhala Batch 01 for the Video Games Signature.
    # Exactly 36 items (24 image, 7 audio, 5 text) across 4 scopes (gta, fifa,
    # call-of-duty, overwatch), 9 items each (3 easy, 3 medium, 3 hard).
    "marhala-video-games-batch-01": Milestone(
        key="marhala-video-games-batch-01",
        label="Marhala Video Games Batch 01 (36 items: 24 image, 7 audio, 5 text)",
        scope_slugs=("gta", "fifa", "call-of-duty", "overwatch"),
        source_prefix="marhala-video-games-batch-01",
        expected_by_mechanic={"marhala": 36},
        expected_items=36,
        source_file="ai/scripts/data/marhala-video-games-batch-01.source.json",
        world_slug="video-games",
        allow_mechanic_slugs=frozenset({"marhala"}),
        allow_payload_keys=("marhalaDifficulty",),
        per_scope_items=9,
        difficulty_key="marhalaDifficulty",
        per_scope_difficulty={"easy": 3, "medium": 3, "hard": 3},
    ),
    "music-bomb-batch-01": Milestone(
        key="music-bomb-batch-01",
        label="Music Bomb Batch 01 (14 items)",
        scope_slugs=("saudi-music", "gulf-music", "egyptian-music", "international-music"),
        source_prefix="music-bomb-batch-01",
        expected_by_mechanic={"bomb": 14},
        expected_items=14,
        world_slug="music",
        external_source=True,
    ),
    "music-ryo-batch-01": Milestone(
        key="music-ryo-batch-01",
        label="Music RYO Batch 01 (12 items)",
        scope_slugs=("saudi-music", "gulf-music", "egyptian-music", "international-music"),
        source_prefix="music-ryo-batch-01",
        expected_by_mechanic={"read-your-opponent": 12},
        expected_items=12,
        world_slug="music",
        external_source=True,
    ),
    "music-closest-batch-01": Milestone(
        key="music-closest-batch-01",
        label="Music Closest Batch 01 (12 items)",
        scope_slugs=("saudi-music", "gulf-music", "egyptian-music", "international-music"),
        source_prefix="music-closest-batch-01",
        expected_by_mechanic={"closest": 12},
        expected_items=12,
        world_slug="music",
        external_source=True,
    ),
    "music-first-note-batch-01": Milestone(
        key="music-first-note-batch-01",
        label="Music first_note Batch 01 (12 items)",
        scope_slugs=("saudi-music", "gulf-music", "egyptian-music", "international-music"),
        source_prefix="music-first-note-batch-01",
        expected_by_mechanic={"first_note": 12},
        expected_items=12,
        world_slug="music",
        external_source=True,
        allow_mechanic_slugs=frozenset({"first_note"}),
    ),
}





class PromotionError(RuntimeError):
    """A gate refused to pass. Never caught internally — the run stops."""


# --------------------------------------------------------------------------- #
# Transport
# --------------------------------------------------------------------------- #

MUTATING_VERBS = {"POST", "PUT", "PATCH", "DELETE"}


class AdminApi:
    """The Admin API, with the write guard in the transport.

    `writes_enabled=False` makes a mutating verb raise before a socket is opened,
    so "dry-run performed no writes" is a property of the client rather than a
    promise made by every call site. There is deliberately no `delete` method.
    """

    def __init__(self, base_url: str, token: str | None = None, *, writes_enabled: bool = False,
                 session: Any | None = None, timeout: int = 120) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.writes_enabled = writes_enabled
        self.timeout = timeout
        self._session = session or requests.Session()
        self.request_log: list[tuple[str, str]] = []

    # -- plumbing ---------------------------------------------------------- #
    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _request(self, method: str, path: str, **kwargs: Any) -> tuple[int, Any]:
        method = method.upper()
        if method in MUTATING_VERBS and not self.writes_enabled:
            raise PromotionError(
                f"refusing {method} {path}: this client is read-only "
                "(dry-run). Writes require --execute."
            )
        self.request_log.append((method, path))
        response = self._session.request(
            method, self.base_url + path, headers=self._headers(), timeout=self.timeout, **kwargs
        )
        try:
            body = response.json()
        except ValueError:
            body = response.text[:400]
        return response.status_code, body

    @staticmethod
    def _unwrap(body: Any) -> Any:
        if isinstance(body, dict) and "data" in body:
            return body["data"]
        return body

    # -- reads ------------------------------------------------------------- #
    def get(self, path: str) -> Any:
        code, body = self._request("GET", path)
        if code != 200:
            raise PromotionError(f"GET {path} -> {code}: {json.dumps(body, ensure_ascii=False)[:300]}")
        return self._unwrap(body)

    # -- the only write ---------------------------------------------------- #
    def post(self, path: str, payload: dict) -> Any:
        code, body = self._request("POST", path, json=payload)
        if code not in (200, 201):
            raise PromotionError(f"POST {path} -> {code}: {json.dumps(body, ensure_ascii=False)[:300]}")
        return self._unwrap(body)

    # -- media, through the target's own public resolver -------------------- #
    def media_state(self, media_path: str) -> str:
        try:
            response = self._session.get(self.base_url + media_path, timeout=self.timeout, stream=True)
            content_type = response.headers.get("content-type", "")
            length = response.headers.get("content-length")
            body_len = int(length) if length and length.isdigit() else len(response.content)
            response.close()
        except requests.RequestException:
            return "MEDIA_MISSING"
        if response.status_code != 200:
            return "MEDIA_MISSING"
        is_valid_type = content_type.startswith("image/") or content_type.startswith("audio/")
        if not is_valid_type or body_len == 0:
            return "MEDIA_INVALID"
        return "MEDIA_OK"


# --------------------------------------------------------------------------- #
# Environment classification
# --------------------------------------------------------------------------- #

def classify_environment(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if host in LOCAL_HOSTS:
        return "local"
    if host in PRODUCTION_HOSTS:
        return "production"
    return "unknown"


def is_remote(url: str) -> bool:
    return classify_environment(url) != "local"


# --------------------------------------------------------------------------- #
# Authentication — never printed, never stored in the plan
# --------------------------------------------------------------------------- #

class Authenticator:
    """Obtains an Admin bearer token the way the product actually issues one.

    Akwaan's interactive login is **passwordless**: `POST /auth/otp/request`
    mails a six-digit code, `POST /auth/otp/verify` exchanges it for the same JWT
    contract password login used to return, and every `/admin/*` call then
    carries `Authorization: Bearer <token>`. There is no cookie, no session store
    and no CSRF step — verified by reading `otp.controller.ts`,
    `verify-otp.use-case.ts` and the frontend's `lib/api/client.ts`.

    Order of preference:

    1. `AKWAAN_{ROLE}_ADMIN_TOKEN` — advanced override, for a token obtained
       elsewhere (a browser session, a previous run).
    2. OTP — the canonical interactive flow, and the only one that works against
       production.
    3. Password — kept for local/dev runtimes seeded with a password account. It
       is never offered for a remote target, because production accounts are
       passwordless and asking for a password there would be asking for something
       that does not exist.

    Nothing is written to disk. The code and the token exist only in memory, and
    neither is printed.
    """

    OTP_CODE_LENGTH = 6

    def __init__(self, role: str, base_url: str, *, interactive: bool = True,
                 session: Any | None = None) -> None:
        self.role = role.upper()
        self.base_url = base_url.rstrip("/")
        self.interactive = interactive
        self.session = session or requests.Session()

    # -- helpers ----------------------------------------------------------- #
    def _env(self, suffix: str) -> str | None:
        return os.environ.get(f"AKWAAN_{self.role}_ADMIN_{suffix}")

    def _post(self, path: str, payload: dict) -> tuple[int, Any]:
        response = self.session.post(self.base_url + path, json=payload, timeout=60)
        try:
            return response.status_code, response.json()
        except ValueError:
            return response.status_code, {}

    @staticmethod
    def _token_of(body: Any) -> str | None:
        payload = (body or {}).get("data") or body or {}
        return payload.get("accessToken")

    # -- the flows --------------------------------------------------------- #
    def _otp(self, identifier: str) -> tuple[str, bool]:
        """Request a code, ask for it, exchange it. Returns (token, isNewUser)."""
        code_status, body = self._post("/auth/otp/request", {"identifier": identifier})
        if code_status not in (200, 201):
            reason = (body or {}).get("code") or (body or {}).get("message") or code_status
            raise PromotionError(
                f"could not start passwordless login for the {self.role.lower()} runtime: {reason}. "
                "EMAIL_OTP_NOT_CONFIGURED means the runtime has no mail provider; "
                "a 429 means the resend cooldown is still running."
            )
        envelope = (body or {}).get("data") or body or {}
        print(f"  [{self.role}] a login code was sent to {identifier} via "
              f"{envelope.get('channel', 'email')}; it expires in "
              f"{envelope.get('expiresInSeconds', '?')}s")
        if not self.interactive:
            raise PromotionError(
                f"a login code was sent for the {self.role.lower()} runtime, but this run is "
                "non-interactive so the code cannot be entered. Re-run interactively, or supply "
                f"AKWAAN_{self.role}_ADMIN_TOKEN."
            )
        # getpass, not input(): the code is a credential for its lifetime.
        code = getpass.getpass(f"  [{self.role}] enter the {self.OTP_CODE_LENGTH}-digit code: ").strip()
        if len(code) != self.OTP_CODE_LENGTH or not code.isdigit():
            raise PromotionError(
                f"the code must be exactly {self.OTP_CODE_LENGTH} digits; nothing was sent to the API."
            )
        verify_status, verify_body = self._post(
            "/auth/otp/verify", {"identifier": identifier, "code": code})
        if verify_status not in (200, 201):
            reason = (verify_body or {}).get("code") or verify_status
            raise PromotionError(
                f"code verification failed for the {self.role.lower()} runtime ({reason}). "
                "The code itself is not shown. OTP_INVALID_OR_EXPIRED means request a fresh one."
            )
        token = self._token_of(verify_body)
        if not token:
            raise PromotionError("verification succeeded but returned no access token")
        payload = (verify_body or {}).get("data") or verify_body or {}
        return token, bool(payload.get("isNewUser"))

    def _password(self, email: str, password: str) -> str:
        status, body = self._post("/auth/login", {"email": email, "password": password})
        if status not in (200, 201):
            raise PromotionError(
                f"{self.role.lower()} password login failed with HTTP {status}. "
                "The credential itself is not shown. Production accounts are passwordless — "
                "use the OTP flow there."
            )
        token = self._token_of(body)
        if not token:
            raise PromotionError(f"{self.role.lower()} login returned no access token")
        return token

    # -- entry point ------------------------------------------------------- #
    def token(self) -> str:
        override = self._env("TOKEN")
        if override:
            print(f"  [{self.role}] using AKWAAN_{self.role}_ADMIN_TOKEN override")
            return self._verified(override, source="override")

        identifier = self._env("EMAIL")
        if not identifier and self.interactive and sys.stdin.isatty():
            print(f"  [{self.role}] passwordless admin login for {self.base_url}")
            identifier = input("    admin email: ").strip()
        if not identifier:
            raise PromotionError(
                f"no identity for the {self.role.lower()} runtime. Set "
                f"AKWAAN_{self.role}_ADMIN_EMAIL (the passwordless login flow will mail a code), "
                f"or AKWAAN_{self.role}_ADMIN_TOKEN to reuse an existing token. "
                "No password is required or wanted — Akwaan admin login is passwordless."
            )

        password = self._env("PASSWORD")
        if password:
            if is_remote(self.base_url):
                raise PromotionError(
                    f"AKWAAN_{self.role}_ADMIN_PASSWORD is set for a remote target, but Akwaan "
                    "production accounts are passwordless. Unset it and use the OTP flow."
                )
            return self._verified(self._password(identifier, password), source="password")

        token, is_new_user = self._otp(identifier)
        if is_new_user:
            # verify() registers an unknown identifier as role=USER. A typo does
            # not fail — it creates an account — so it is called out loudly.
            raise PromotionError(
                f"that identifier had no account on {self.base_url}, so verification just "
                "created a new passwordless one with the ordinary user role. It cannot reach "
                "/admin/*. Check the email address; an unintended account now exists and may "
                "need removing."
            )
        return self._verified(token, source="otp")

    def _verified(self, token: str, *, source: str) -> str:
        """Confirm the token really is an admin before any planning starts."""
        response = self.session.get(
            self.base_url + "/auth/me",
            headers={"Authorization": f"Bearer {token}"}, timeout=60)
        if response.status_code != 200:
            raise PromotionError(
                f"the {self.role.lower()} token was rejected by /auth/me "
                f"(HTTP {response.status_code}); it is not a usable session."
            )
        try:
            body = response.json()
        except ValueError:
            body = {}
        user = body.get("data") or body or {}
        role = user.get("role")
        if role != "admin":
            raise PromotionError(
                f"the {self.role.lower()} account authenticated as role={role!r}, which cannot "
                "reach /admin/*. An admin account is required; the role is granted in the "
                "database by hand (see AuthService)."
            )
        print(f"  [{self.role}] authenticated as admin via {source} "
              f"({user.get('email', 'unknown')})")
        return token


def resolve_token(role: str, base_url: str, *, interactive: bool = True,
                  session: Any | None = None) -> str:
    """Backwards-compatible entry point used by the CLI and the tests."""
    return Authenticator(role, base_url, interactive=interactive, session=session).token()


# --------------------------------------------------------------------------- #
# Runtime lookups — everything resolves by slug, never by a foreign ObjectId
# --------------------------------------------------------------------------- #

CANONICAL_WORLD_ALIASES: dict[str, tuple[str, ...]] = {
    "football": ("football", "test", "عالم كرة القدم", "كرة قدم"),
    "anime": ("anime", "world-1785615381449", "عالم الانمي", "عالم الأنمي"),
    "video-games": ("video-games", "world-1785784447249", "عالم الالعاب الالكترونية", "عالم الألعاب الإلكترونية", "فيديو قيمز"),
    "puzzles": ("puzzles", "world-1786388973542", "عالم الالغاز", "عالم الألغاز"),
    "series": ("series", "world-1786143410891", "مسلسلات"),
    "movies": ("movies", "world-1787503885931", "عالم الافلام", "عالم الأفلام"),
    "cars": ("cars", "world-1787503872700", "عالم السيارات"),
    "general-knowledge": ("general-knowledge", "world-1787503939420", "عالم المعلومات"),
}

CANONICAL_SCOPE_ALIASES: dict[str, tuple[str, ...]] = {
    "premier-league": ("premier-league", "scope-1785790447091", "الدوري الانجليزي", "الدوري الإنجليزي"),
    "champions-league": ("champions-league", "scope-1785790471367", "ابطال اوروبا", "أبطال أوروبا", "دوري أبطال أوروبا"),
    "world-cup": ("world-cup", "scope-1785788790909", "كأس العالم"),
    "saudi-league": ("saudi-league", "scope-1785790461277", "الدوري السعودي"),
    "naruto": ("naruto", "scope-1785880972070", "ناروتو"),
    "one-piece": ("one-piece", "scope-1785795316988", "ون بيس"),
    "attack-on-titan": ("attack-on-titan", "scope-1785880979981", "هجوم العمالقة"),
    "bleach": ("bleach", "scope-1785880986570", "بليتش"),
    "call-of-duty": ("call-of-duty", "scope-1785795334994", "كول اوف ديوتي"),
    "fifa": ("fifa", "scope-1785881042167", "فيفا"),
    "gta": ("gta", "scope-1785881026837", "قراند"),
    "overwatch": ("overwatch", "scope-1785881026837", "اوفر ووتش"),
}

CANONICAL_CHALLENGE_TYPE_ALIASES: dict[str, tuple[str, ...]] = {
    # Production carries the canonical `marhala` slug (36 items, 1 board
    # configuration), and no generated Marhala type exists any more. The old
    # `mechanic-1787503326785` alias is dropped for the same reason as the
    # first_note one: an alias that accepts a generated slug is what lets a board
    # slot drift away from the launcher key without anything noticing.
    "marhala": ("marhala", "المرحلة"),
    "bomb": ("bomb", "القنبلة"),
    "combo": ("combo", "الكومبو"),
    "read-your-opponent": ("read-your-opponent", "اقرأ خصمك"),
    "closest": ("closest", "مين اقرب", "مين أقرب"),
    "top-5": ("top-5", "أفضل 5", "افضل 5"),
    # The runtime's canonical slug is `first-note` (`FIRST_NOTE_SLUG`), which is
    # also the launcher key a Match resolves a board slot through. The generated
    # `mechanic-1788380928916` that Production carried is deliberately NOT an
    # alias: tolerating it here is what let a Signature slot stay bound to a slug
    # no launcher answers to, so the promoter now fails to resolve it rather than
    # quietly promoting into it again.
    "first_note": ("first_note", "first-note", "من أول نغمة"),
}


@dataclass
class RuntimeIndex:
    worlds_by_slug: dict[str, dict]
    challenge_types_by_slug: dict[str, dict]
    challenge_type_slug_by_id: dict[str, str]

    @classmethod
    def load(cls, api: AdminApi) -> "RuntimeIndex":
        worlds = api.get("/admin/worlds") or []
        types = api.get("/admin/challenge-types") or []
        worlds_by_slug: dict[str, dict] = {}
        for w in worlds:
            worlds_by_slug[w["slug"]] = w
            w_name = (w.get("name") or "").strip()
            for canonical, aliases in CANONICAL_WORLD_ALIASES.items():
                if w["slug"] in aliases or w_name in aliases:
                    worlds_by_slug[canonical] = w

        challenge_types_by_slug: dict[str, dict] = {}
        challenge_type_slug_by_id: dict[str, str] = {}
        for t in types:
            challenge_types_by_slug[t["slug"]] = t
            challenge_type_slug_by_id[str(t["id"])] = t["slug"]
            t_name = (t.get("name") or "").strip()
            for canonical, aliases in CANONICAL_CHALLENGE_TYPE_ALIASES.items():
                if t["slug"] in aliases or t_name in aliases:
                    challenge_types_by_slug[canonical] = t
                    challenge_type_slug_by_id[str(t["id"])] = canonical

        return cls(
            worlds_by_slug=worlds_by_slug,
            challenge_types_by_slug=challenge_types_by_slug,
            challenge_type_slug_by_id=challenge_type_slug_by_id,
        )


def scopes_of_world(api: AdminApi, world_id: str) -> dict[str, dict]:
    raw_scopes = api.get(f"/admin/worlds/{world_id}/scopes") or []
    result: dict[str, dict] = {}
    for s in raw_scopes:
        result[s["slug"]] = s
        s_name = (s.get("name") or "").strip()
        for canonical, aliases in CANONICAL_SCOPE_ALIASES.items():
            if s["slug"] in aliases or s_name in aliases:
                result[canonical] = s
    return result


def content_of_scope(api: AdminApi, world_id: str, scope_id: str) -> list[dict]:
    return api.get(f"/admin/content-items?worldId={world_id}&scopeId={scope_id}") or []


def sources_in_world(api: AdminApi, world_id: str) -> dict[str, dict]:
    """Existing items in one World, keyed by canonical source marker."""
    found: dict[str, dict] = {}
    for item in api.get(f"/admin/content-items?worldId={world_id}") or []:
        marker = ((item.get("metadata") or {}).get("source"))
        if marker:
            found[marker] = item
    return found


# The write contract for an asset is exactly `url` + optional `altText`
# (`ContentAssetDto`). A read from the source can carry more: some authoring
# passes stamped a per-asset `type` that merely repeats `media.type`. Projecting
# onto the write contract is safe *only* for fields we can prove are redundant,
# so `type` is dropped when it agrees with the parent and anything else unknown
# fails the item instead of being discarded quietly — a silently dropped field is
# how meaning disappears between environments.
ASSET_WRITE_FIELDS = ("url", "altText")
ASSET_REDUNDANT_FIELDS = ("type",)


def canonical_media(media: dict | None) -> tuple[dict | None, str | None]:
    """(payload, problem) — the media as the create contract accepts it."""
    if not media:
        return None, None
    media_type = media.get("type")
    assets_in = media.get("assets") or []
    if not media_type or not assets_in:
        return None, "media without a type or assets"
    assets_out = []
    for asset in assets_in:
        unknown = [k for k in asset
                   if k not in ASSET_WRITE_FIELDS and k not in ASSET_REDUNDANT_FIELDS]
        if unknown:
            return None, f"media asset carries unsupported field(s) {unknown}"
        if "type" in asset and asset["type"] != media_type:
            return None, (f"asset type {asset['type']!r} disagrees with media type "
                          f"{media_type!r}; refusing to drop it")
        if not asset.get("url"):
            return None, "media asset without a url"
        projected = {"url": asset["url"]}
        if asset.get("altText"):
            projected["altText"] = asset["altText"]
        assets_out.append(projected)
    extra = [k for k in media if k not in ("type", "assets")]
    if extra:
        return None, f"media carries unsupported field(s) {extra}"
    return {"type": media_type, "assets": assets_out}, None


# --------------------------------------------------------------------------- #
# Manifest
# --------------------------------------------------------------------------- #

@dataclass
class ManifestItem:
    source_marker: str
    world_slug: str
    scope_slug: str
    mechanic_slugs: tuple[str, ...]
    payload: dict
    media_path: str | None
    #: Set when the source media cannot be projected onto the write contract.
    media_problem: str | None = None
    media_state: str = "MEDIA_NOT_REQUIRED"
    action: str = "UNPLANNED"
    detail: str = ""


@dataclass
class Manifest:
    milestone: Milestone
    world_slugs: tuple[str, ...]
    scope_slugs: tuple[str, ...]
    items: list[ManifestItem] = field(default_factory=list)

    def by_mechanic(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for item in self.items:
            for slug in item.mechanic_slugs:
                counts[slug] = counts.get(slug, 0) + 1
        return counts


def build_manifest(milestone: Milestone, source: AdminApi, index: RuntimeIndex) -> Manifest:
    """Read exactly the milestone's Scopes out of the source runtime.

    Only items whose `metadata.source` carries the milestone prefix are eligible.
    An item in an allowed Scope without that marker is not "probably fine" — it is
    not part of the milestone, so it is left behind.
    """
    world_slugs: list[str] = []
    items: list[ManifestItem] = []
    found_scopes: list[str] = []

    for world_slug, world in index.worlds_by_slug.items():
        scopes = scopes_of_world(source, str(world["id"]))
        for scope_slug in milestone.scope_slugs:
            scope = scopes.get(scope_slug)
            if not scope:
                continue
            found_scopes.append(scope_slug)
            if world_slug not in world_slugs:
                world_slugs.append(world_slug)
            for raw in content_of_scope(source, str(world["id"]), str(scope["id"])):
                marker = ((raw.get("metadata") or {}).get("source")) or ""
                if not marker.startswith(milestone.source_prefix):
                    continue
                mechanics = tuple(
                    index.challenge_type_slug_by_id.get(str(cid), f"unknown:{cid}")
                    for cid in (raw.get("compatibleChallengeTypeIds") or [])
                )
                raw_media = raw.get("media") or None
                media, media_problem = canonical_media(raw_media)
                media_path = media["assets"][0]["url"] if media else None
                items.append(
                    ManifestItem(
                        source_marker=marker,
                        world_slug=world_slug,
                        scope_slug=scope_slug,
                        mechanic_slugs=mechanics,
                        media_path=media_path,
                        media_problem=media_problem,
                        payload={
                            "prompt": raw.get("prompt"),
                            "answerPayload": raw.get("answerPayload"),
                            "mechanicPayload": raw.get("mechanicPayload"),
                            "media": media,
                            "isReusableAcrossSessions": bool(raw.get("isReusableAcrossSessions")),
                            "status": raw.get("status") or "ready",
                            "metadata": {
                                "source": marker,
                                "notes": ((raw.get("metadata") or {}).get("notes")),
                                "tags": ((raw.get("metadata") or {}).get("tags")),
                            },
                        },
                    )
                )

    missing = [s for s in milestone.scope_slugs if s not in found_scopes]
    if missing:
        raise PromotionError(
            f"{milestone.key}: source runtime has no Scope(s) {missing}. "
            "The milestone cannot be promoted from this source."
        )
    return Manifest(milestone=milestone, world_slugs=tuple(world_slugs),
                    scope_slugs=milestone.scope_slugs, items=items)


def _repo_root() -> str:
    """The repository root, so a milestone's source_file resolves the same way
    wherever the script is invoked from."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, "..", ".."))


def build_manifest_from_file(
    milestone: Milestone, source_path: str | None = None
) -> Manifest:
    """Read a milestone's items from its reviewed repository file.

    A deterministic, side-effect-free transformation of an authoring artifact into
    the exact same canonical ContentItem promotion contract a runtime source would
    yield. No runtime is read or mutated. Every item's stable `id` becomes part of
    its `metadata.source`, so identity survives repeated promotion runs and the
    idempotency check can recognise an already-promoted item.

    Supports two source formats:
    - Marhala: `correctAnswer`/`acceptedAnswers` lists, `marhalaDifficulty`, no media.
    - Bomb (multimodal): `answerPayload` with mode+acceptedAnswers, optional `media`
      block with `type` and `assets`. Text-only items have `media.type == "none"`.
    """
    if not milestone.world_slug:
        raise PromotionError(
            f"{milestone.key}: a file-sourced milestone needs world_slug."
        )
    # An explicitly supplied pack wins; otherwise the milestone's own tracked
    # file. A milestone with neither is a registration bug, not a missing file.
    source_path = source_path or milestone.source_file
    if not source_path:
        raise PromotionError(
            f"{milestone.key}: no pack to read. A milestone whose batch is generated "
            f"must be given one with --source-file."
        )
    path = source_path if os.path.isabs(source_path) else os.path.join(
        _repo_root(), source_path
    )
    if not os.path.exists(path):
        raise PromotionError(f"{milestone.key}: source file not found: {source_path}")
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)

    mechanic = next(iter(milestone.expected_by_mechanic))  # the milestone's single mechanic
    items: list[ManifestItem] = []
    # A final pack records replaced items beside their replacements. Everything
    # below builds a *promotable* payload, so it may only ever see the forward
    # set — the shared gate decides which that is, and raises rather than guessing.
    for question in select_forward_items(data, source=milestone.source_file):
        qid = str(question.get("id") or "")
        marker = f"{milestone.source_prefix}:{qid}"

        # Answer payload: prefer the pre-built `answerPayload` when the source
        # carries it (bomb-style). Fall back to the marhala convention
        # (`correctAnswer` + `acceptedAnswers` as separate fields).
        raw_answer = question.get("answerPayload")
        if raw_answer and raw_answer.get("mode"):
            answer_payload = raw_answer
        else:
            def _norm_answer(s: str) -> str:
                import unicodedata, re
                s = unicodedata.normalize("NFKD", s)
                s = re.sub(r"[\u0300-\u036f\u064B-\u065F\u0670\u0640]", "", s)
                s = re.sub(r"[أإآ]", "ا", s)
                s = s.replace("ى", "ي").replace("ة", "ه")
                s = re.sub(r"[\W_]+", " ", s, flags=re.UNICODE)
                s = s.lower().strip()
                s = re.sub(r"\s+", " ", s)
                s = re.sub(r"^the\s+", "", s, flags=re.IGNORECASE)
                s = re.sub(r"^ال", "", s)
                return s.strip()

            accepted: list[str] = []
            seen_norm: set[str] = set()
            for candidate in [question.get("correctAnswer")] + list(question.get("acceptedAnswers") or []):
                text = (candidate or "").strip()
                if not text:
                    continue
                n_text = _norm_answer(text)
                if not n_text or n_text in seen_norm:
                    continue
                seen_norm.add(n_text)
                accepted.append(text)
            answer_payload = {"mode": "match", "acceptedAnswers": accepted}

        # Mechanic payload: only set for mechanics that need it.
        mechanic_payload: dict | None = None
        if mechanic == "marhala":
            mechanic_payload = {"marhalaDifficulty": question.get("marhalaDifficulty")}
        elif mechanic == "first_note":
            # من أول نغمة bids on how few seconds a team needs, so the
            # pre-auction clue is part of the item's runtime contract, not
            # authoring trivia: `FirstNotePayload` requires `variant` and a
            # non-empty `contextualClue.ar`, and the compatibility policy
            # rejects the item without them.
            #
            # The clue was already authored — it just never left `authoring`,
            # which promotion strips. Twelve Music items reached Production with
            # no mechanicPayload at all, and nothing complained because the
            # first-note validator is gated on a ChallengeType slugged
            # `first-note`, which Production did not have at the time.
            clue = str((question.get("authoring") or {}).get("clue") or "").strip()
            if not clue:
                raise PromotionError(
                    f"{milestone.key}: {qid} has no authored clue. من أول نغمة "
                    f"cannot be promoted without `authoring.clue` — the auction "
                    f"has nothing to bid against."
                )
            mechanic_payload = {
                "variant": "first-note",
                "contextualClue": {"ar": clue},
            }
            # A first-note ChallengeType resolves MATCH items
            # (`ANSWER_MODE_COMPATIBLE_ITEM_MODES[FIRST_NOTE] == [MATCH]`, and
            # the runtime asserts the same). Packs authored the mechanic's own
            # mode onto the item; correct it here, for this mechanic only, and
            # copy rather than edit the loaded pack in place.
            answer_payload = {**answer_payload, "mode": "match"}

        # Media: read from the source when present and non-trivial. A `type: "none"`
        # entry means the item is text-only, which is valid for multimodal Bomb.
        raw_media = question.get("media") or {}
        media_payload: dict | None = None
        media_path: str | None = None
        media_problem: str | None = None
        if raw_media.get("type") and raw_media["type"] != "none" and raw_media.get("assets"):
            media_payload, media_problem = canonical_media(raw_media)
            if media_payload:
                media_path = media_payload["assets"][0]["url"]
            # A media problem is recorded on the ManifestItem and validated later.

        payload = {
            "prompt": {"ar": (question.get("prompt") or {}).get("ar")},
            "answerPayload": answer_payload,
            "mechanicPayload": mechanic_payload,
            "media": media_payload,
            "isReusableAcrossSessions": False,
            # From the source when it states a lifecycle, and only ever `ready`
            # here because `select_forward_items` has already excluded the rest.
            # A pre-lifecycle pack (no `status` on any item) keeps the historical
            # default so the already-promoted milestones stay reproducible.
            "status": question.get("status") or "ready",
            "metadata": {"source": marker, "notes": None, "tags": None},
        }
        items.append(
            ManifestItem(
                source_marker=marker,
                world_slug=milestone.world_slug,
                scope_slug=str(question.get("scopeSlug") or question.get("scopeId") or ""),
                mechanic_slugs=(mechanic,),
                media_path=media_path,
                media_problem=(media_problem if raw_media.get("type") and
                               raw_media["type"] != "none" and not media_payload else None),
                payload=payload,
            )
        )
    return Manifest(
        milestone=milestone,
        world_slugs=(milestone.world_slug,),
        scope_slugs=milestone.scope_slugs,
        items=items,
    )



def assert_manifest_is_clean(manifest: Manifest) -> None:
    """Fail — never silently skip — if anything excluded reached the manifest."""
    milestone = manifest.milestone
    problems: list[str] = []

    for item in manifest.items:
        if not item.source_marker.startswith(milestone.source_prefix):
            problems.append(f"foreign source marker: {item.source_marker}")
        if item.scope_slug not in milestone.scope_slugs:
            problems.append(f"scope outside the allowlist: {item.scope_slug}")
        for slug in item.mechanic_slugs:
            # A globally-forbidden mechanic is still forbidden unless THIS milestone
            # explicitly allows it. The exception never leaks to another milestone.
            if slug in FORBIDDEN_MECHANIC_SLUGS and slug not in milestone.allow_mechanic_slugs:
                problems.append(f"excluded mechanic {slug} on {item.source_marker}")
            if slug.startswith("unknown:"):
                problems.append(f"unresolvable mechanic on {item.source_marker}")
        lowered = item.source_marker.lower()
        for fragment in FORBIDDEN_SOURCE_FRAGMENTS:
            if fragment in lowered:
                problems.append(f"excluded source marker: {item.source_marker}")
        for key in FORBIDDEN_PAYLOAD_KEYS:
            if key in (item.payload.get("mechanicPayload") or {}) and key not in milestone.allow_payload_keys:
                problems.append(f"excluded mechanic payload {key} on {item.source_marker}")

    markers = [i.source_marker for i in manifest.items]
    duplicates = {m for m in markers if markers.count(m) > 1}
    if duplicates:
        problems.append(f"duplicate source markers: {sorted(duplicates)[:3]}")

    if len(manifest.items) != milestone.expected_items:
        problems.append(
            f"item count {len(manifest.items)} != declared {milestone.expected_items}"
        )
    actual = manifest.by_mechanic()
    if actual != milestone.expected_by_mechanic:
        problems.append(f"per-mechanic counts {actual} != declared {milestone.expected_by_mechanic}")

    # Per-Scope shape: exact count per Scope, and — when the milestone declares a
    # difficulty contract — the exact per-band distribution inside each Scope.
    if milestone.per_scope_items is not None or milestone.per_scope_difficulty:
        by_scope: dict[str, list[ManifestItem]] = {}
        for item in manifest.items:
            by_scope.setdefault(item.scope_slug, []).append(item)
        for scope_slug in milestone.scope_slugs:
            scope_items = by_scope.get(scope_slug, [])
            if milestone.per_scope_items is not None and len(scope_items) != milestone.per_scope_items:
                problems.append(
                    f"scope {scope_slug}: {len(scope_items)} items != {milestone.per_scope_items}"
                )
            if milestone.per_scope_difficulty and milestone.difficulty_key:
                counts: dict[str, int] = {}
                for item in scope_items:
                    band = (item.payload.get("mechanicPayload") or {}).get(milestone.difficulty_key)
                    if band not in milestone.per_scope_difficulty:
                        problems.append(
                            f"scope {scope_slug}: invalid {milestone.difficulty_key}={band!r} "
                            f"on {item.source_marker}"
                        )
                        continue
                    counts[band] = counts.get(band, 0) + 1
                if counts != dict(milestone.per_scope_difficulty):
                    problems.append(
                        f"scope {scope_slug}: difficulty split {counts} != {dict(milestone.per_scope_difficulty)}"
                    )
        # A Scope present in the manifest that the milestone never allow-listed.
        for scope_slug in by_scope:
            if scope_slug not in milestone.scope_slugs:
                problems.append(f"scope outside the allowlist: {scope_slug}")

    if problems:
        raise PromotionError(
            "manifest rejected:\n  - " + "\n  - ".join(dict.fromkeys(problems))
        )


# --------------------------------------------------------------------------- #
# Validation of a single item against the target's contracts
# --------------------------------------------------------------------------- #

def validate_item(item: ManifestItem, target_index: RuntimeIndex) -> str | None:
    """None when promotable; otherwise the reason it is INVALID."""
    if item.media_problem:
        return item.media_problem
    if not item.mechanic_slugs:
        return "no compatible mechanic"
    for slug in item.mechanic_slugs:
        if slug not in target_index.challenge_types_by_slug:
            return f"target has no ChallengeType '{slug}'"
    prompt = item.payload.get("prompt") or {}
    if not (prompt.get("ar") or "").strip():
        return "empty Arabic prompt"
    answer = item.payload.get("answerPayload") or {}
    mode = answer.get("mode")
    if not mode:
        return "no answer mode"
    if mode == "match" and not (answer.get("acceptedAnswers") or []):
        return "match answer with no accepted answers"
    if mode == "closest" and answer.get("correctValue") is None:
        return "closest answer with no correct value"
    if mode == "multiple_choice" and not (answer.get("options") or []):
        return "multiple choice with no options"
    payload = item.payload.get("mechanicPayload") or {}
    if "combo" in item.mechanic_slugs and payload.get("comboStage") not in (1, 2, 3, 4):
        return "combo item without a valid stage"
    if "top-5" in item.mechanic_slugs and (payload.get("variant") != "keep-or-give"
                                          or len(payload.get("entries") or []) == 0):
        return "top-5 item without its ranked deck"
    # Bomb items may be text-only (multimodal bomb is deployed — BombItemText,
    # BombItemImage, BombItemAudio). Media is validated when present but is not
    # required for every item.
    if "marhala" in item.mechanic_slugs and payload.get("marhalaDifficulty") not in (
        "easy", "medium", "hard"
    ):
        return "marhala item without a valid difficulty"
    return None


# --------------------------------------------------------------------------- #
# Planning
# --------------------------------------------------------------------------- #

@dataclass
class ScopePlan:
    scope_slug: str
    world_slug: str
    action: str          # CREATE | EXISTS | CONFLICT
    detail: str = ""
    target_scope_id: str | None = None
    source_scope: dict | None = None


@dataclass
class Plan:
    milestone_key: str
    target: str
    environment: str
    source: str
    commit: str
    scopes: list[ScopePlan]
    items: list[ManifestItem]
    generated_at: str

    def counts(self) -> dict[str, Any]:
        scope_actions: dict[str, int] = {}
        for scope in self.scopes:
            scope_actions[scope.action] = scope_actions.get(scope.action, 0) + 1
        item_actions: dict[str, int] = {}
        media: dict[str, int] = {}
        by_mechanic: dict[str, dict[str, int]] = {}
        for item in self.items:
            item_actions[item.action] = item_actions.get(item.action, 0) + 1
            if item.media_path:
                media[item.media_state] = media.get(item.media_state, 0) + 1
            for slug in item.mechanic_slugs:
                bucket = by_mechanic.setdefault(slug, {})
                bucket[item.action] = bucket.get(item.action, 0) + 1
        return {
            "scopes": scope_actions,
            "items": item_actions,
            "media": media,
            "by_mechanic": by_mechanic,
            "writes": scope_actions.get("CREATE", 0) + item_actions.get("CREATE", 0),
            "deletes": 0,
        }

    def blockers(self) -> list[str]:
        reasons = [f"scope {s.scope_slug}: {s.detail}" for s in self.scopes if s.action == "CONFLICT"]
        reasons += [f"item {i.source_marker}: {i.detail}"
                    for i in self.items if i.action in ("CONFLICT", "INVALID")]
        # Only a proven-bad asset blocks. An unchecked one is reported in the
        # counts and is unreachable from a remote write by construction.
        reasons += [f"item {i.source_marker}: media {i.media_state}"
                    for i in self.items
                    if i.media_path and i.media_state in ("MEDIA_MISSING", "MEDIA_INVALID")]
        return reasons

    def to_json(self) -> dict:
        return {
            "generatedAt": self.generated_at,
            "milestone": self.milestone_key,
            "source": self.source,
            "target": self.target,
            "environment": self.environment,
            "sourceCommit": self.commit,
            "worlds": sorted({s.world_slug for s in self.scopes}),
            "scopes": [
                {"slug": s.scope_slug, "world": s.world_slug, "action": s.action,
                 "detail": s.detail, "targetScopeId": s.target_scope_id}
                for s in self.scopes
            ],
            "items": [
                {"sourceMarker": i.source_marker, "world": i.world_slug, "scope": i.scope_slug,
                 "mechanics": list(i.mechanic_slugs), "action": i.action, "detail": i.detail,
                 "media": i.media_path, "mediaState": i.media_state}
                for i in self.items
            ],
            "counts": self.counts(),
        }

    def fingerprint(self) -> str:
        """Hash of the *decisions*, not the timestamp — stable across replans."""
        canonical = {
            "milestone": self.milestone_key,
            "target": self.target,
            "scopes": sorted((s.scope_slug, s.world_slug, s.action) for s in self.scopes),
            "items": sorted((i.source_marker, i.scope_slug, i.action, i.media_state)
                            for i in self.items),
        }
        raw = json.dumps(canonical, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def source_commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True,
                              text=True, timeout=30).stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def build_plan(manifest: Manifest, source: AdminApi | None, source_index: RuntimeIndex | None,
               target: AdminApi, target_index: RuntimeIndex, *,
               check_media: bool = True) -> Plan:
    scopes: list[ScopePlan] = []
    target_scope_ids: dict[str, str] = {}
    file_sourced = manifest.milestone.source_file is not None

    for world_slug in manifest.world_slugs:
        target_world = target_index.worlds_by_slug.get(world_slug)
        target_scopes = (scopes_of_world(target, str(target_world["id"]))
                         if target_world else {})

        if file_sourced:
            # A file source authors no Scopes: the milestone's Scopes must already
            # exist on the target, and we only resolve their production IDs. A
            # missing Scope is a CONFLICT (never a CREATE), so this can never
            # silently invent a Scope on production.
            for scope_slug in manifest.scope_slugs:
                if not target_world:
                    scopes.append(ScopePlan(scope_slug, world_slug, "CONFLICT",
                                            f"target has no World '{world_slug}'"))
                    continue
                existing = target_scopes.get(scope_slug)
                if existing is None:
                    scopes.append(ScopePlan(scope_slug, world_slug, "CONFLICT",
                                            f"target has no Scope '{scope_slug}'"))
                    continue
                scopes.append(ScopePlan(scope_slug, world_slug, "EXISTS",
                                        target_scope_id=str(existing["id"])))
                target_scope_ids[scope_slug] = str(existing["id"])
            continue

        assert source is not None and source_index is not None
        source_world = source_index.worlds_by_slug[world_slug]
        source_scopes = scopes_of_world(source, str(source_world["id"]))
        for scope_slug in manifest.scope_slugs:
            if scope_slug not in source_scopes:
                continue
            source_scope = source_scopes[scope_slug]
            if not target_world:
                scopes.append(ScopePlan(scope_slug, world_slug, "CONFLICT",
                                        f"target has no World '{world_slug}'"))
                continue
            existing = target_scopes.get(scope_slug)
            if existing is None:
                scopes.append(ScopePlan(scope_slug, world_slug, "CREATE",
                                        source_scope=source_scope))
                continue
            # A slug that exists must be the same Scope, in the same World.
            if str(existing.get("worldId")) != str(target_world["id"]):
                scopes.append(ScopePlan(scope_slug, world_slug, "CONFLICT",
                                        "slug exists under a different World",
                                        target_scope_id=str(existing["id"])))
                continue
            if (existing.get("name") or "").strip() != (source_scope.get("name") or "").strip():
                scopes.append(ScopePlan(scope_slug, world_slug, "CONFLICT",
                                        f"name differs on target ({existing.get('name')!r})",
                                        target_scope_id=str(existing["id"])))
                continue
            scopes.append(ScopePlan(scope_slug, world_slug, "EXISTS",
                                    target_scope_id=str(existing["id"]),
                                    source_scope=source_scope))
            target_scope_ids[scope_slug] = str(existing["id"])

    existing_sources: dict[str, dict] = {}
    for world_slug in manifest.world_slugs:
        target_world = target_index.worlds_by_slug.get(world_slug)
        if target_world:
            existing_sources.update(sources_in_world(target, str(target_world["id"])))

    for item in manifest.items:
        invalid = validate_item(item, target_index)
        if invalid:
            item.action, item.detail = "INVALID", invalid
        elif item.source_marker in existing_sources:
            existing = existing_sources[item.source_marker]
            same_scope = (str(existing.get("scopeId")) ==
                          target_scope_ids.get(item.scope_slug, "<unmapped>"))
            if same_scope:
                item.action, item.detail = "EXISTS_IDENTICAL", "already promoted"
            else:
                item.action, item.detail = "CONFLICT", "source marker exists under another Scope"
        else:
            item.action = "CREATE"
        if item.media_path:
            # A skipped check is "unknown", never "fine" and never "failed".
            # Remote writes cannot skip it (enforced in the CLI), so an unchecked
            # media reference can never reach another environment.
            item.media_state = (target.media_state(item.media_path)
                                if check_media else "MEDIA_UNCHECKED")
            if item.action == "CREATE" and item.media_state in ("MEDIA_MISSING", "MEDIA_INVALID"):
                item.detail = f"media {item.media_state} on target"

    return Plan(
        milestone_key=manifest.milestone.key,
        target=target.base_url,
        environment=classify_environment(target.base_url),
        source=source.base_url if source is not None else f"file:{manifest.milestone.source_file}",
        commit=source_commit(),
        scopes=scopes,
        items=manifest.items,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


# --------------------------------------------------------------------------- #
# Execution — additive only
# --------------------------------------------------------------------------- #

def execute_plan(plan: Plan, target: AdminApi, target_index: RuntimeIndex) -> dict[str, int]:
    if plan.blockers():
        raise PromotionError("refusing to execute a plan with blockers")
    stats = {"scopes_created": 0, "scopes_reused": 0, "items_created": 0,
             "items_skipped": 0, "failed": 0, "deletes": 0}
    scope_ids: dict[str, str] = {}

    for scope in plan.scopes:
        world = target_index.worlds_by_slug[scope.world_slug]
        if scope.action == "EXISTS":
            scope_ids[scope.scope_slug] = scope.target_scope_id or ""
            stats["scopes_reused"] += 1
            continue
        payload = {
            "name": (scope.source_scope or {}).get("name") or scope.scope_slug,
            "slug": scope.scope_slug,
            "status": (scope.source_scope or {}).get("status") or "active",
        }
        created = target.post(f"/admin/worlds/{world['id']}/scopes", payload)
        scope_ids[scope.scope_slug] = str(created["id"])
        stats["scopes_created"] += 1

    for item in plan.items:
        if item.action != "CREATE":
            stats["items_skipped"] += 1
            continue
        scope_id = scope_ids.get(item.scope_slug)
        if not scope_id:
            stats["failed"] += 1
            continue
        payload = {k: v for k, v in item.payload.items() if v is not None}
        payload["scopeId"] = scope_id
        payload["compatibleChallengeTypeIds"] = [
            str(target_index.challenge_types_by_slug[slug]["id"]) for slug in item.mechanic_slugs
        ]
        metadata = {k: v for k, v in (payload.get("metadata") or {}).items() if v is not None}
        payload["metadata"] = metadata
        created = target.post("/admin/content-items", payload)
        readiness = target.get(f"/admin/content-items/{created['id']}/readiness")
        if (readiness or {}).get("blockers"):
            stats["failed"] += 1
        else:
            stats["items_created"] += 1
    return stats


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def render(plan: Plan) -> None:
    counts = plan.counts()
    print(f"\n=== PROMOTION PLAN — {plan.milestone_key} ===")
    print(f"  source      : {plan.source}")
    print(f"  target      : {plan.target}  [{plan.environment}]")
    print(f"  source commit: {plan.commit[:12]}")
    print(f"  worlds      : {', '.join(sorted({s.world_slug for s in plan.scopes}))}")
    print(f"\n  SCOPES  {counts['scopes']}")
    for scope in plan.scopes:
        print(f"    {scope.action:9} {scope.scope_slug:20} {scope.detail}")
    print(f"\n  ITEMS   {counts['items']}")
    for mechanic, actions in sorted(counts["by_mechanic"].items()):
        print(f"    {mechanic:20} {actions}")
    print(f"\n  MEDIA   {counts['media'] or 'no media-bearing items'}")
    print(f"\n  writes that WOULD occur: {counts['writes']}")
    print(f"  deletes:                 {counts['deletes']}")
    blockers = plan.blockers()
    print(f"  blockers:                {len(blockers)}")
    for reason in blockers[:10]:
        print(f"    - {reason}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Promote an approved content milestone between Akwaan runtimes.")
    parser.add_argument("--milestone", required=True, choices=sorted(MILESTONES) + ["all"])
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="runtime to read approved content from")
    parser.add_argument("--target", default=DEFAULT_TARGET, help="runtime to promote into (defaults to local)")
    parser.add_argument("--expected-environment", choices=["local", "production", "unknown"],
                        help="must match what the target host resolves to")
    parser.add_argument("--execute", action="store_true", help="perform writes (default: plan only)")
    parser.add_argument("--allow-remote-write", action="store_true",
                        help="required to write to a non-local target")
    parser.add_argument("--require-plan-hash", help="refuse unless the plan hashes to this value")
    parser.add_argument("--source-file",
                        help="path to the generated pack for a milestone whose batch is not "
                             "tracked in the repository (external_source). Repository-relative "
                             "or absolute.")
    parser.add_argument("--plan-out", default=PLAN_PATH_DEFAULT)
    parser.add_argument("--skip-media-check", action="store_true",
                        help="plan without contacting the target's media resolver (never for production)")
    parser.add_argument("--no-interactive", action="store_true",
                        help="never prompt; requires AKWAAN_*_ADMIN_TOKEN since a "
                             "mailed login code cannot be entered")
    args = parser.parse_args(argv)

    target_env = classify_environment(args.target)
    if args.expected_environment and args.expected_environment != target_env:
        print(f"ERROR: --expected-environment {args.expected_environment} but the target "
              f"resolves to '{target_env}' ({args.target})", file=sys.stderr)
        return 2
    if args.execute and is_remote(args.target):
        if not args.allow_remote_write:
            print(f"ERROR: {args.target} is a remote target ({target_env}). Writing to it "
                  "requires --allow-remote-write.", file=sys.stderr)
            return 2
        if not args.expected_environment:
            print("ERROR: writing to a remote target requires --expected-environment.", file=sys.stderr)
            return 2
        if args.skip_media_check:
            print("ERROR: --skip-media-check cannot be combined with a remote write.", file=sys.stderr)
            return 2

    keys = sorted(MILESTONES) if args.milestone == "all" else [args.milestone]

    # `--source-file` names one batch, so it cannot be spread across a run of
    # every milestone.
    if args.source_file and args.milestone == "all":
        print("ERROR: --source-file applies to a single --milestone, not 'all'.",
              file=sys.stderr)
        return 2
    if args.source_file and not MILESTONES[args.milestone].external_source:
        print(f"ERROR: {args.milestone} reads a tracked repository pack; "
              "--source-file is only for a milestone whose batch is generated.",
              file=sys.stderr)
        return 2
    # A milestone whose pack is generated refuses to run until it is handed one.
    # Failing here beats reading whatever happens to be in the working tree.
    missing_source = [
        k for k in keys if MILESTONES[k].external_source and not args.source_file
    ]
    if missing_source:
        print(f"ERROR: {', '.join(missing_source)} read a generated pack that is not "
              "tracked in the repository. Re-run with --milestone <one> --source-file "
              "<path to the reviewed pack>.", file=sys.stderr)
        return 2

    # A file-sourced milestone is read from a file, not a runtime, so it needs no
    # source authentication at all. Only auth a source runtime when at least one
    # selected milestone actually reads from one.
    needs_source_runtime = any(
        MILESTONES[k].source_file is None and not MILESTONES[k].external_source
        for k in keys
    )
    try:
        source: AdminApi | None = None
        source_index: RuntimeIndex | None = None
        source_token: str | None = None
        if needs_source_runtime:
            source_token = resolve_token("SOURCE", args.source, interactive=not args.no_interactive)
            source = AdminApi(args.source, source_token, writes_enabled=False)
            source_index = RuntimeIndex.load(source)

        same_runtime = args.target.rstrip("/") == args.source.rstrip("/")
        target_token = (source_token if (same_runtime and source_token) else resolve_token(
            "TARGET", args.target, interactive=not args.no_interactive))
        target = AdminApi(args.target, target_token, writes_enabled=args.execute)
        target_index = (source_index if (same_runtime and source_index is not None)
                        else RuntimeIndex.load(target))

        exit_code = 0
        for key in keys:
            milestone = MILESTONES[key]
            pack_path = args.source_file or milestone.source_file
            manifest = (build_manifest_from_file(milestone, pack_path) if pack_path
                        else build_manifest(milestone, source, source_index))
            assert_manifest_is_clean(manifest)
            plan = build_plan(manifest, source, source_index, target, target_index,
                              check_media=not args.skip_media_check)
            render(plan)
            path = args.plan_out if len(keys) == 1 else args.plan_out.replace(".json", f".{key}.json")
            document = plan.to_json()
            document["planHash"] = plan.fingerprint()
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(document, handle, ensure_ascii=False, indent=1)
            print(f"\n  plan written : {path}")
            print(f"  plan hash    : {document['planHash']}")

            if not args.execute:
                print("  mode         : DRY-RUN — no write was attempted")
                if plan.blockers():
                    exit_code = 1
                continue
            if args.require_plan_hash and args.require_plan_hash != document["planHash"]:
                print("ERROR: plan hash does not match --require-plan-hash; the source "
                      "changed since it was reviewed.", file=sys.stderr)
                return 2
            if plan.blockers():
                print("ERROR: refusing to execute — the plan has blockers.", file=sys.stderr)
                return 2
            stats = execute_plan(plan, target, target_index)
            print(f"  EXECUTED     : {stats}")
            if stats["failed"]:
                exit_code = 1
        return exit_code
    except PromotionError as error:
        print(f"\nBLOCKED: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
