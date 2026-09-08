import argparse
import json
import os
import sys

def main():
    parser = argparse.ArgumentParser(description="Record Human Product concept decision durably.")
    parser.add_argument("--source", help="Path to .source.json containing the item(s)")
    parser.add_argument("--item-id", help="Specific item ID to record (optional if file has 1 item)")
    parser.add_argument("--status", required=True, choices=["APPROVED", "REJECTED", "INVALID_TEST_SAMPLE"], help="Human Product verdict")
    parser.add_argument("--reuse-policy", required=True, choices=["DO_NOT_REGENERATE", "REFERENCE_ONLY", "REUSABLE_PATTERN"], help="Reuse instruction for authoring agents")
    parser.add_argument("--lesson", help="Optional extracted taste lesson for EXEMPLARS.md", default="")
    args = parser.parse_args()

    if not args.source or not os.path.exists(args.source):
        print("Error: Must provide valid --source JSON.")
        sys.exit(1)
        
    with open(args.source, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    items = data if isinstance(data, list) else [data]
    if args.item_id:
        items = [i for i in items if i.get("id") == args.item_id]
        
    if not items:
        print("Error: No matching items found.")
        sys.exit(1)

    history_path = "ai/.opencode/authoring-concept-history.json"
    if os.path.exists(history_path):
        with open(history_path, "r", encoding="utf-8") as f:
            history = json.load(f)
    else:
        history = {"concepts": []}

    for item in items:
        ctx = item.get("_authoringContext", {})
        meta = item.get("metadata", {})
        concept = meta.get("conceptKey", {})
        
        if not concept:
            print(f"Warning: Item {item.get('id')} lacks conceptKey metadata. Skipping.")
            continue
            
        record = {
            "worldKey": ctx.get("worldKey", "unknown"),
            "scopeKey": ctx.get("scopeKey", "unknown"),
            "mechanicKey": ctx.get("mechanicKey", "unknown"),
            "conceptKey": concept,
            "humanProductStatus": args.status,
            "reusePolicy": args.reuse_policy,
            "sourceArtifact": args.source
        }
        
        if args.lesson:
            record["lesson"] = args.lesson
            
        history["concepts"].append(record)
        
        # If REJECTED with a lesson, optionally append to EXEMPLARS.md automatically
        if args.status in ["REJECTED", "INVALID_TEST_SAMPLE"] and args.lesson:
            exemplars_path = f"ai/.opencode/skills/worlds/{ctx.get('worldKey')}/scopes/{ctx.get('scopeKey')}/EXEMPLARS.md"
            if os.path.exists(exemplars_path):
                with open(exemplars_path, "a", encoding="utf-8") as f:
                    f.write(f"\n\n## {args.status}: {concept.get('subject')}\n")
                    f.write(f"- **Item**: {item.get('presentation', {}).get('prompt')}\n")
                    f.write(f"- **Concept**: {concept.get('subject')}\n")
                    f.write(f"- **Reuse Policy**: {args.reuse_policy}\n")
                    f.write(f"- **Lesson**: {args.lesson}\n")

    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)
        
    print(f"Recorded {len(items)} decisions to canonical concept history.")

if __name__ == "__main__":
    main()
