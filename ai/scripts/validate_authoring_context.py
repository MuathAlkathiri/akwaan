import json
import sys
import subprocess

def validate_artifact(filepath):
    with open(filepath, "r") as f:
        artifact = json.load(f)
        
    ctx = artifact.get("_authoringContext")
    if not ctx:
        print("VALIDATION_FAILED: Missing _authoringContext")
        sys.exit(1)
        
    # Rebuild context
    cmd = [
        "python3", "ai/scripts/resolve_authoring_context.py",
        "--mechanic", ctx["mechanicKey"],
        "--world", ctx["worldKey"],
        "--scope", ctx["scopeKey"]
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"VALIDATION_FAILED: Could not rebuild context - {result.stdout.strip()}")
        sys.exit(1)
        
    # Extract just the metadata block from the output
    stdout = result.stdout
    meta_part = stdout.split("=== CONTEXT ===")[0].replace("=== METADATA ===", "").strip()
    rebuilt_meta = json.loads(meta_part)["_authoringContext"]
    
    # Compare composed hash
    if ctx.get("composedHash") != rebuilt_meta.get("composedHash"):
        print("VALIDATION_FAILED: STALE_AUTHORING_CONTEXT (Hash mismatch)")
        sys.exit(1)
        
    print("VALIDATION_PASSED: Context provenance verified.")

if __name__ == "__main__":
    validate_artifact(sys.argv[1])
