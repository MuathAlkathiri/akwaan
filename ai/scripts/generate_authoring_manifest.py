import json
import os
import sys

# The canonical catalog is derived from GAME_NEW_SYSTEM_ROADMAP.md
# and docs/WORLD_CONTENT_EXPANSION_PLAN.md.
# 49 baseline + 12 expansion + 1 pre-existing (shapes-patterns) = 62 Scopes.

CANONICAL_WORLDS = {
    "anime": ["attack-on-titan", "bleach", "naruto", "one-piece", "demon-slayer", "dragon-ball", "jujutsu-kaisen"],
    "cars": ["cars-mix", "german-cars", "japanese-cars", "supercars"],
    "football": ["champions-league", "premier-league", "saudi-league", "world-cup", "football-legends", "la-liga", "serie-a"],
    "general-knowledge": ["history", "human-body-nature", "inventions-discoveries", "science"],
    "movies": ["disney-pixar", "harry-potter", "marvel", "movies-mix"],
    "music": ["arabic-music", "gulf-music", "international-music", "saudi-music"],
    "puzzles": ["general-knowledge", "letters-words", "logic-deduction", "numbers-arithmetic", "symbols-codes", "shapes-patterns", "patterns-sequences", "lateral-thinking", "visual-puzzles"],
    "saudi-arabia": ["cities-landmarks", "culture-heritage", "saudi-history", "saudi-today"],
    "series": ["breaking-bad", "from", "game-of-thrones", "series-mix"],
    "sports": ["formula-1", "nba", "ufc", "wwe"],
    "video-games": ["call-of-duty", "fifa", "gta", "overwatch", "minecraft", "god-of-war", "resident-evil"],
    "world": ["cities-landmarks", "countries-flags", "geography", "peoples-cultures"]
}

manifest = {
    "mechanics": {
        "bomb": {"category": "SHARED", "status": "AUTHORABLE", "profile": "ai/.opencode/skills/challenge-types/bomb/SKILL.md"},
        "marhala": {"category": "SIGNATURE", "boundWorld": "video-games", "status": "AUTHORABLE", "profile": "ai/.opencode/skills/challenge-types/marhala/SKILL.md"},
        "combo": {"category": "SIGNATURE", "boundWorld": "anime", "status": "AUTHORABLE", "profile": "ai/.opencode/skills/challenge-types/combo/SKILL.md"},
        "read-your-opponent": {"category": "SHARED", "status": "AUTHORABLE", "profile": "ai/.opencode/skills/challenge-types/read-your-opponent/SKILL.md", "aliases": ["ryo"]},
        "closest": {"category": "SHARED", "status": "AUTHORABLE", "profile": "ai/.opencode/skills/challenge-types/closest/SKILL.md"},
        
        "top-5": {"category": "SIGNATURE", "boundWorld": "football", "status": "AUTHORABLE", "profile": "ai/.opencode/skills/challenge-types/top-5/SKILL.md"},
        "distributed-information": {"category": "SIGNATURE", "boundWorld": "puzzles", "status": "AUTHORABLE", "profile": "ai/.opencode/skills/challenge-types/distributed-information/SKILL.md", "aliases": ["rakkibha"]},
        "odd-piece": {"category": "SIGNATURE", "boundWorld": "cars", "status": "AUTHORABLE", "profile": "ai/.opencode/skills/challenge-types/odd-piece/SKILL.md", "aliases": ["intruder-part", "intruder"]},
        "first-note": {"category": "SIGNATURE", "boundWorld": "music", "status": "AUTHORABLE", "profile": "ai/.opencode/skills/challenge-types/first-note/SKILL.md", "aliases": ["first_note"]},
        "laqatha": {"category": "SIGNATURE", "boundWorld": "movies", "status": "AUTHORABLE", "profile": "ai/.opencode/skills/challenge-types/laqatha/SKILL.md"},
        
        "one-clue": {"category": "SHARED", "status": "LEGACY", "profile": "ai/.opencode/skills/challenge-types/one-clue/SKILL.md"},
        "guess-your-teammate": {"category": "SHARED", "status": "LEGACY", "profile": "ai/.opencode/skills/challenge-types/guess-your-teammate/SKILL.md"},
        "twenty-inquiries": {"category": "SHARED", "status": "LEGACY", "profile": "ai/.opencode/skills/challenge-types/twenty-inquiries/SKILL.md"},
        "same-wavelength": {"category": "SHARED", "status": "LEGACY", "profile": "ai/.opencode/skills/challenge-types/same-wavelength/SKILL.md"},
        "split": {"category": "SHARED", "status": "LEGACY", "profile": "ai/.opencode/skills/challenge-types/split/SKILL.md"},
        "split-clue": {"category": "SHARED", "status": "LEGACY", "profile": "ai/.opencode/skills/challenge-types/split-clue/SKILL.md"},
        "who-among-us": {"category": "SHARED", "status": "LEGACY", "profile": "ai/.opencode/skills/challenge-types/who-among-us/SKILL.md"}
    },
    "worlds": {},
    "scopes": {}
}

# 1. Verify and register Canonical Catalog
for w_slug, s_list in CANONICAL_WORLDS.items():
    manifest["worlds"][w_slug] = {
        "profile": f"ai/.opencode/skills/worlds/{w_slug}/WORLD.md",
        "scopes": sorted(s_list)
    }
    for s_slug in s_list:
        scope_path = f"ai/.opencode/skills/worlds/{w_slug}/scopes/{s_slug}/SCOPE.md"
        know_path = f"ai/.opencode/skills/worlds/{w_slug}/scopes/{s_slug}/KNOWLEDGE.md"
        
        if not os.path.exists(scope_path) or not os.path.exists(know_path):
            print(f"FAIL CLOSED: Canonical scope missing files: {w_slug}/{s_slug}", file=sys.stderr)
            sys.exit(1)
            
        manifest["scopes"][f"{w_slug}/{s_slug}"] = {
            "world": w_slug,
            "scopePath": scope_path,
            "knowledgePath": know_path,
            "exemplarsPath": f"ai/.opencode/skills/worlds/{w_slug}/scopes/{s_slug}/EXEMPLARS.md"
        }

# 2. Check for unexpected filesystem directories (Warning only)
worlds_dir = "ai/.opencode/skills/worlds"
if os.path.exists(worlds_dir):
    for fw_slug in os.listdir(worlds_dir):
        w_path = os.path.join(worlds_dir, fw_slug)
        if os.path.isdir(w_path) and fw_slug != ".DS_Store":
            if fw_slug not in CANONICAL_WORLDS:
                print(f"WARNING: UNREGISTERED_WORLD_DIRECTORY found: {fw_slug}")
                continue
            scopes_dir = os.path.join(w_path, "scopes")
            if os.path.exists(scopes_dir):
                for fs_slug in os.listdir(scopes_dir):
                    s_path = os.path.join(scopes_dir, fs_slug)
                    if os.path.isdir(s_path) and fs_slug not in CANONICAL_WORLDS[fw_slug]:
                        print(f"WARNING: UNREGISTERED_SCOPE_DIRECTORY found: {fw_slug}/{fs_slug}")

with open("ai/.opencode/authoring-manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)
print("Manifest generated successfully from canonical catalog.")
