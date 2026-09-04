#!/usr/bin/env python3
"""The one rule that decides which source-pack items may reach the backend.

A final authoring pack is a *record*, not a worklist. It keeps the items that
were replaced alongside the replacements, so the Music packs carry 74 physical
items of which only 50 are forward. Consumers that iterated `pack["items"]` and
stamped every one of them `status: "ready"` would therefore have revived 24
retired records — including the exact rows a `-v2` replacement exists to retire.

The lifecycle vocabulary here is not new. It is the backend's own
`ContentItemStatus` (`backend/src/modules/world-content/domain/world-content.constants.ts`):

    draft | ready | archived

`ready` is forward. `draft` and `archived` are not. Nothing in this module
invents a second concept such as `isForward`, and nothing here reads
`authoring.productApproval`: the authoring skill states that authoring metadata
"is stripped/ignored during DB promotion", and in the Music packs it does not
partition the set anyway — 8 archived items carry `productApproval: YES` while
13 forward items carry no such field at all. `status` is the lifecycle signal.

Fail-closed, in this order:

  * `archived` / `draft`      -> excluded, never rewritten to `ready`
  * unknown status value      -> SourcePackSelectionError
  * missing status, in a pack where any other item has one -> SourcePackSelectionError
  * forward item that still carries `authoring.replacedBy` -> SourcePackSelectionError

That last one is the structural guarantee that a retired slot can never be
selected next to the `-v2` that replaced it: supersession is expressed by the
pair (`archived` + `replacedBy`), so a *forward* item pointing at a successor is
a contradiction in the pack rather than something to resolve silently.

**Legacy packs.** A pack in which *no* item carries `status` predates the
lifecycle field (the `questions[]`-shaped packs under `ai/scripts/data/` are all
like this). Those are selected whole, exactly as before — the alternative is to
break three already-promoted milestones to guard a field they never had. The
carve-out is deliberately all-or-nothing: the moment a pack marks a single item,
every item in it must be marked, so a lifecycle-aware pack can never fall back
to legacy handling.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

#: Mirrors the backend `ContentItemStatus` enum. Kept as a literal set so a
#: status the backend does not know can never be forwarded to it.
KNOWN_STATUSES: frozenset[str] = frozenset({"draft", "ready", "archived"})

#: The only status that may be promoted.
FORWARD_STATUS = "ready"


class SourcePackSelectionError(Exception):
    """A pack whose lifecycle markers cannot be trusted. Never downgrade to a warning."""


def _items_of(pack: Any) -> Sequence[dict]:
    """The item list of a pack, accepting either pack shape or a bare list.

    `items[]` is the Music/gap-pack shape; `questions[]` is the shape the
    canonical promoter reads. Both are records of authored content and both go
    through the same gate.
    """
    if isinstance(pack, (list, tuple)):
        return list(pack)
    if isinstance(pack, dict):
        for key in ("items", "questions"):
            if isinstance(pack.get(key), list):
                return pack[key]
    raise SourcePackSelectionError(
        "source pack has neither an `items` nor a `questions` list"
    )


def is_lifecycle_aware(items: Iterable[dict]) -> bool:
    """Whether this pack expresses the lifecycle at all. See "Legacy packs" above."""
    return any("status" in item for item in items)


def select_forward_items(pack: Any, *, source: str = "<pack>") -> list[dict]:
    """The forward items of `pack`, in pack order.

    Deterministic: same input, same list, every run — which is what makes a
    repeated promotion dry-run idempotent rather than merely usually-equal.
    """
    items = _items_of(pack)
    lifecycle = is_lifecycle_aware(items)
    forward: list[dict] = []

    for index, item in enumerate(items):
        ident = item.get("id") or f"index[{index}]"
        raw = item.get("status")

        if raw is None:
            if lifecycle:
                raise SourcePackSelectionError(
                    f"{source}: {ident} has no `status` in a pack that marks lifecycle on "
                    f"other items. Refusing to guess it is forward."
                )
            forward.append(item)  # legacy pre-lifecycle pack
            continue

        if not isinstance(raw, str) or raw not in KNOWN_STATUSES:
            raise SourcePackSelectionError(
                f"{source}: {ident} has unsupported status {raw!r}. "
                f"Known statuses: {sorted(KNOWN_STATUSES)}."
            )

        if raw != FORWARD_STATUS:
            continue  # archived / draft — historical, and stays that way

        replaced_by = (item.get("authoring") or {}).get("replacedBy")
        if replaced_by:
            raise SourcePackSelectionError(
                f"{source}: {ident} is `{FORWARD_STATUS}` but declares "
                f"replacedBy={replaced_by!r}. A superseded item cannot be forward."
            )
        forward.append(item)

    return forward


def selection_summary(pack: Any, *, source: str = "<pack>") -> dict[str, int]:
    """Counts for a dry-run line, computed through the same gate that selects."""
    items = _items_of(pack)
    forward = select_forward_items(pack, source=source)
    excluded = [i for i in items if i.get("status") in ("archived", "draft")]
    return {
        "physical": len(items),
        "forward": len(forward),
        "archived": sum(1 for i in items if i.get("status") == "archived"),
        "draft": sum(1 for i in items if i.get("status") == "draft"),
        "excluded": len(excluded),
    }
