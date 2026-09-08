import argparse
import json
import os
import hashlib
import sys
from datetime import datetime

def hash_file(filepath):
    if not os.path.exists(filepath):
        return None
    with open(filepath, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()

def main():
    parser = argparse.ArgumentParser(description="Resolve Akwaan Authoring Context")
    parser.add_argument("--mechanic", required=True, help="Canonical mechanic key or alias")
    parser.add_argument("--world", required=True, help="Canonical world key")
    parser.add_argument("--scope", required=True, help="Canonical scope key")
    args = parser.parse_args()

    manifest_path = "ai/.opencode/authoring-manifest.json"
    if not os.path.exists(manifest_path):
        print("AUTHORING_BLOCKED — AUTHORING_MANIFEST_MISSING")
        sys.exit(1)

    with open(manifest_path, "r") as f:
        registry = json.load(f)

    # 1. Resolve Mechanic
    mechanic_key = None
    for k, v in registry["mechanics"].items():
        if k == args.mechanic or args.mechanic in v.get("aliases", []):
            mechanic_key = k
            break
    
    if not mechanic_key:
        print(f"AUTHORING_BLOCKED — UNKNOWN_MECHANIC ({args.mechanic})")
        sys.exit(1)
        
    mech_data = registry["mechanics"][mechanic_key]
    if mech_data.get("status") != "AUTHORABLE":
        print(f"AUTHORING_BLOCKED — MECHANIC_NOT_AUTHORABLE ({mechanic_key})")
        sys.exit(1)

    # 2. Resolve World
    world_key = args.world
    if world_key not in registry["worlds"]:
        print(f"AUTHORING_BLOCKED — UNKNOWN_WORLD ({world_key})")
        sys.exit(1)
        
    # Signature Binding Check
    if mech_data.get("category") == "SIGNATURE":
        bound = mech_data.get("boundWorld")
        if bound and bound != world_key:
            print(f"AUTHORING_BLOCKED — MECHANIC_WORLD_MISMATCH (Signature {mechanic_key} is bound to {bound}, not {world_key})")
            sys.exit(1)

    # 3. Resolve Scope
    scope_key = args.scope
    combo_key = f"{world_key}/{scope_key}"
    if combo_key not in registry["scopes"]:
        # Ensure it exists at all
        scope_found = any(s.endswith(f"/{scope_key}") for s in registry["scopes"].keys())
        if scope_found:
            print(f"AUTHORING_BLOCKED — SCOPE_WORLD_MISMATCH ({scope_key} does not belong to {world_key})")
        else:
            print(f"AUTHORING_BLOCKED — UNKNOWN_SCOPE ({scope_key})")
        sys.exit(1)

    # 4. Resolve Files
    global_profile = "ai/.opencode/knowledge/architecture/QUESTION-CRAFT.md"
    mechanic_profile = mech_data["profile"]
    world_profile = registry["worlds"][world_key]["profile"]
    scope_data = registry["scopes"][combo_key]
    
    scope_profile = scope_data["scopePath"]
    knowledge_profile = scope_data["knowledgePath"]
    exemplars_profile = scope_data["exemplarsPath"]
    
    # 5. Read and Validate
    def read_req(path, err):
        if not os.path.exists(path):
            print(err)
            sys.exit(1)
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    ctx_global = read_req(global_profile, "AUTHORING_BLOCKED — REQUIRED_GLOBAL_PROFILE_MISSING")
    ctx_mechanic = read_req(mechanic_profile, "AUTHORING_BLOCKED — REQUIRED_MECHANIC_PROFILE_MISSING")
    ctx_world = read_req(world_profile, "AUTHORING_BLOCKED — REQUIRED_WORLD_PROFILE_MISSING")
    ctx_scope = read_req(scope_profile, "AUTHORING_BLOCKED — REQUIRED_SCOPE_PROFILE_MISSING")
    ctx_know = read_req(knowledge_profile, "AUTHORING_BLOCKED — REQUIRED_SCOPE_KNOWLEDGE_MISSING")
    
    ctx_exemplars = ""
    if os.path.exists(exemplars_profile):
        with open(exemplars_profile, "r", encoding="utf-8") as f:
            ctx_exemplars = f.read()

    # 6. Compose
    composed = f"""
# ==========================================
# AKWAAN AUTHORING CONTEXT
# MECHANIC: {mechanic_key} | WORLD: {world_key} | SCOPE: {scope_key}
# ==========================================

## 1. GLOBAL GOVERNANCE
{ctx_global}

## 2. MECHANIC PROFILE ({mechanic_key})
{ctx_mechanic}

## 3. WORLD EXPERIENCE ({world_key})
{ctx_world}

## 4. SCOPE BOUNDARIES
{ctx_scope}

## 5. SCOPE KNOWLEDGE
{ctx_know}

## 6. HUMAN PRODUCT EXEMPLARS
{ctx_exemplars if ctx_exemplars else 'No exemplars recorded yet.'}
"""

    hashes = {
        "global": hash_file(global_profile),
        "mechanic": hash_file(mechanic_profile),
        "world": hash_file(world_profile),
        "scope": hash_file(scope_profile),
        "knowledge": hash_file(knowledge_profile),
        "exemplars": hash_file(exemplars_profile) if ctx_exemplars else None
    }
    
    composed_hash = hashlib.sha256(composed.encode("utf-8")).hexdigest()

    metadata = {
        "_authoringContext": {
            "resolverVersion": "1.0",
            "generatedAt": datetime.utcnow().isoformat() + "Z",
            "mechanicKey": mechanic_key,
            "worldKey": world_key,
            "scopeKey": scope_key,
            "loadedProfiles": {
                "global": global_profile,
                "mechanic": mechanic_profile,
                "world": world_profile,
                "scope": scope_profile,
                "knowledge": knowledge_profile,
                "exemplars": exemplars_profile if ctx_exemplars else None
            },
            "profileHashes": hashes,
            "composedHash": composed_hash
        }
    }

    print("=== METADATA ===")
    print(json.dumps(metadata, indent=2))
    print("=== CONTEXT ===")
    print(composed)

if __name__ == "__main__":
    main()
