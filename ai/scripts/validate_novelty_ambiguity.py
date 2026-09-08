import json
import sys
import os

def load_canonical_history():
    existing = {}
    history_path = "ai/.opencode/authoring-concept-history.json"
    if os.path.exists(history_path):
        with open(history_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            for c in data.get("concepts", []):
                subj = c.get("conceptKey", {}).get("subject")
                if subj:
                    existing.setdefault(subj, []).append(c)
    return existing

def check_item(item, existing_concepts, current_file_basename):
    answers = [a.lower().strip() for a in item.get("acceptedAnswers", [])]
    prompt = item.get("presentation", {}).get("prompt", "").lower()
    concept_meta = item.get("metadata", {}).get("conceptKey", {})
    subject = concept_meta.get("subject", "")
    item_id = item.get("id", "unknown")
    
    # 1. Structural Answer Integrity (Generic)
    if not answers:
        return "QA_REJECT — ANSWER_INTEGRITY (No answers provided)"
    
    # Check for duplicate aliases in the array
    if len(answers) != len(set(answers)):
        return "QA_REJECT — ANSWER_INTEGRITY (Duplicate aliases found in acceptedAnswers)"

    # 2. Ambiguity Check (Deterministic Fallbacks - leaving only as regression flags for older datasets)
    if ("grove street" in answers or "قروف ستريت" in answers) and "ganton" in answers:
        return "QA_REJECT — AMBIGUOUS_EXPECTED_ANSWER"

    # 3. Novelty Check & Self-Collision Exclusion
    if subject and subject in existing_concepts:
        history_records = existing_concepts[subject]
        conflicts = []
        for r in history_records:
            is_same_item = (r.get("itemId") != "unknown" and r.get("itemId") == item_id)
            is_same_file = (r.get("sourceArtifact") != "unknown" and r.get("sourceArtifact") == current_file_basename)
            if not is_same_item and not is_same_file:
                conflicts.append(r)
        
        if conflicts:
            return f"QA_REJECT — DUPLICATE_CONCEPT (Matched: {conflicts[0].get('sourceArtifact')})"
    
    # Legacy string fallbacks (Regression only)
    if "timed finishing" in prompt or "المؤشر الأخضر" in prompt:
         if "timed-finishing-green-indicator" in existing_concepts:
             return "QA_REJECT — DUPLICATE_CONCEPT (Legacy Match)"
    if "ray gun" in prompt or "راي قن" in prompt:
         if "ray-gun-zombies-weapon" in existing_concepts:
             return "QA_REJECT — DUPLICATE_CONCEPT (Legacy Match)"
    if "high noon" in prompt:
         if "dva-nerf-this-ultimate-voiceline" in existing_concepts or "cassidy-high-noon-ultimate" in existing_concepts:
             return "QA_REJECT — DUPLICATE_CONCEPT (Legacy Match)"
         
    return "QA_PASS — PENDING_HUMAN_PRODUCT_CONCEPT_REVIEW"

def main():
    if len(sys.argv) < 2:
        print("Usage: validate_novelty_ambiguity.py <file.json>")
        sys.exit(1)
        
    filepath = sys.argv[1]
    basename = os.path.basename(filepath)
    
    with open(filepath, "r", encoding="utf-8") as f:
        items = json.load(f)
        
    existing = load_canonical_history()
    
    if not isinstance(items, list):
        items = [items]
        
    all_passed = True
    for i, item in enumerate(items):
        res = check_item(item, existing, basename)
        print(f"Item {i} ({item.get('id', 'unknown')}): {res}")
        if "REJECT" in res:
            all_passed = False
            
    if not all_passed:
        sys.exit(1)

if __name__ == "__main__":
    main()
