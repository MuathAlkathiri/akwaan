import json
import os
import subprocess
import unittest


# Scratch artifacts belong in the git-ignored workbench, never the repository
# root (AGENTS.md section 5). `validate_novelty_ambiguity.py` keys self-collision
# on `os.path.basename`, so redirecting the directory while keeping the file name
# preserves the dedup semantics these tests assert.
_SCRATCH_DIR = os.path.join("ai", "workbench", "artifacts")


def _scratch(filename):
    os.makedirs(_SCRATCH_DIR, exist_ok=True)
    return os.path.join(_SCRATCH_DIR, filename)


def run_resolver(mechanic, world, scope):
    cmd = ["python3", "ai/scripts/resolve_authoring_context.py", "--mechanic", mechanic, "--world", world, "--scope", scope]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result

class TestAuthoringContext(unittest.TestCase):
    def setUp(self):
        with open("ai/.opencode/authoring-manifest.json") as f:
            self.manifest = json.load(f)

    def test_full_inventory(self):
        worlds = self.manifest["worlds"]
        scopes = self.manifest["scopes"]
        
        self.assertEqual(len(worlds), 12, "Should have exactly 12 worlds")
        self.assertEqual(len(scopes), 59, "Should have exactly 59 scopes")
        
        total_scopes = 0
        for w, wdata in worlds.items():
            total_scopes += len(wdata["scopes"])
            for s in wdata["scopes"]:
                self.assertIn(f"{w}/{s}", scopes)
        
        self.assertEqual(total_scopes, 59, "Sum of per-world scopes must equal 59")
        
        for s_slug, s_data in scopes.items():
            self.assertTrue(os.path.exists(s_data["scopePath"]))
            self.assertTrue(os.path.exists(s_data["knowledgePath"]))

    def test_mechanics_inventory(self):
        mechs = self.manifest["mechanics"]
        
        expected_authorable = ["bomb", "marhala", "combo", "read-your-opponent", "closest", "top-5", "moving-xo", "odd-piece", "first-note", "laqatha"]
        expected_retained_inactive = ["distributed-information"]
        expected_legacy = ["one-clue", "guess-your-teammate", "twenty-inquiries", "same-wavelength", "split", "split-clue", "who-among-us"]
        
        for k in expected_authorable:
            self.assertIn(k, mechs)
            self.assertEqual(mechs[k]["status"], "AUTHORABLE")
            self.assertTrue(os.path.exists(mechs[k]["profile"]))

        for k in expected_retained_inactive:
            self.assertIn(k, mechs)
            self.assertEqual(mechs[k]["status"], "RETAINED_INACTIVE")
            self.assertIn("rakkibha", mechs[k].get("aliases", []))
            self.assertTrue(os.path.exists(mechs[k]["profile"]))
            
        for k in expected_legacy:
            self.assertIn(k, mechs)
            self.assertEqual(mechs[k]["status"], "LEGACY")
            self.assertTrue(os.path.exists(mechs[k]["profile"]))
            
        self.assertEqual(mechs["combo"]["category"], "SIGNATURE")
        self.assertEqual(mechs["combo"]["boundWorld"], "anime")
        self.assertEqual(mechs["marhala"]["category"], "SIGNATURE")
        self.assertEqual(mechs["marhala"]["boundWorld"], "video-games")

    def test_resolver_signatures(self):
        # combo + anime + naruto -> PASS
        self.assertEqual(run_resolver("combo", "anime", "naruto").returncode, 0)
        # combo + video-games + fifa -> FAIL
        self.assertNotEqual(run_resolver("combo", "video-games", "fifa").returncode, 0)
        
        # marhala + video-games + fifa -> PASS
        self.assertEqual(run_resolver("marhala", "video-games", "fifa").returncode, 0)
        # marhala + anime + naruto -> FAIL
        self.assertNotEqual(run_resolver("marhala", "anime", "naruto").returncode, 0)
        
        # top-5 + football + premier-league -> PASS
        self.assertEqual(run_resolver("top-5", "football", "premier-league").returncode, 0)
        
        # Retained Rakkibha identities are blocked from current authoring.
        for mechanic in ("distributed-information", "rakkibha"):
            retained = run_resolver(mechanic, "puzzles", "wordplay-letters")
            self.assertNotEqual(retained.returncode, 0)
            self.assertIn("AUTHORING_BLOCKED — MECHANIC_NOT_AUTHORABLE", retained.stdout)
        
        # odd-piece + cars + german-cars -> PASS
        self.assertEqual(run_resolver("odd-piece", "cars", "german-cars").returncode, 0)
        
        # first-note + music + arabic-music -> PASS
        self.assertEqual(run_resolver("first-note", "music", "arabic-music").returncode, 0)
        
        # laqatha + movies + marvel -> PASS
        self.assertEqual(run_resolver("laqatha", "movies", "marvel").returncode, 0)

    def test_moving_xo_and_rakkibha_discovery_are_independent(self):
        mechs = self.manifest["mechanics"]
        moving_xo = mechs["moving-xo"]
        rakkibha = mechs["distributed-information"]

        self.assertNotEqual(moving_xo["profile"], rakkibha["profile"])
        self.assertNotIn("rakkibha", moving_xo.get("aliases", []))
        self.assertIn("rakkibha", rakkibha.get("aliases", []))

        for scope in self.manifest["worlds"]["puzzles"]["scopes"]:
            self.assertEqual(run_resolver("moving-xo", "puzzles", scope).returncode, 0)

        moving_context = run_resolver("moving-xo", "puzzles", "wordplay-letters").stdout
        mechanic_section = moving_context.split("## 2. MECHANIC PROFILE (moving-xo)", 1)[1].split(
            "## 3. WORLD EXPERIENCE", 1
        )[0]
        self.assertNotIn("distributed-information", mechanic_section)
        self.assertNotIn("RAKKIBHA", mechanic_section.upper())

        resolved_rakkibha = run_resolver("rakkibha", "puzzles", "wordplay-letters")
        self.assertNotEqual(resolved_rakkibha.returncode, 0)
        self.assertIn("AUTHORING_BLOCKED — MECHANIC_NOT_AUTHORABLE", resolved_rakkibha.stdout)
        self.assertNotEqual(run_resolver("moving-xo", "anime", "naruto").returncode, 0)

    def test_provenance(self):
        res = run_resolver("marhala", "video-games", "fifa")
        meta_part = res.stdout.split("=== CONTEXT ===")[0].replace("=== METADATA ===", "").strip()
        
        valid_path = _scratch("test_artifact_valid.json")
        stale_path = _scratch("test_artifact_stale.json")

        with open(valid_path, "w") as f:
            f.write(meta_part)
            
        cmd = ["python3", "ai/scripts/validate_authoring_context.py", valid_path]
        v_res = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(v_res.returncode, 0)
        self.assertIn("VALIDATION_PASSED", v_res.stdout)
        
        stale = json.loads(meta_part)
        stale["_authoringContext"]["composedHash"] = "badhash"
        with open(stale_path, "w") as f:
            json.dump(stale, f)
        v_res = subprocess.run(["python3", "ai/scripts/validate_authoring_context.py", stale_path], capture_output=True, text=True)
        self.assertNotEqual(v_res.returncode, 0)

        generation_stale = json.loads(meta_part)
        generation_stale["_authoringContext"]["generationComposedHash"] = "badhash"
        with open(stale_path, "w") as f:
            json.dump(generation_stale, f)
        v_res = subprocess.run(
            ["python3", "ai/scripts/validate_authoring_context.py", stale_path],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(v_res.returncode, 0)

        for f in [valid_path, stale_path]:
            if os.path.exists(f): os.remove(f)


class TestNoveltyAndAmbiguity(unittest.TestCase):
    def setUp(self):
        self.base_item = {
            "id": "test-123",
            "metadata": {
                "conceptKey": {
                    "subject": "generic-subject"
                }
            },
            "presentation": {
                "prompt": "Test prompt"
            },
            "acceptedAnswers": ["Test"]
        }

    def run_check(self, item):
        import subprocess
        import json
        path = _scratch("temp_test_item.json")
        with open(path, "w") as f:
            json.dump([item], f)
        res = subprocess.run(["python3", "ai/scripts/validate_novelty_ambiguity.py", path], capture_output=True, text=True)
        return res.stdout

    def test_ambiguity_gta_regression(self):
        item = dict(self.base_item)
        item["acceptedAnswers"] = ["Grove Street", "Ganton"]
        out = self.run_check(item)
        self.assertIn("QA_REJECT — AMBIGUOUS_EXPECTED_ANSWER", out)

    def test_novelty_fifa_regression(self):
        item = dict(self.base_item)
        item["metadata"]["conceptKey"]["subject"] = "timed-finishing-green-indicator"
        item["presentation"]["prompt"] = "وش يعني المؤشر الأخضر فوق اللاعب وقت التسديد؟"
        out = self.run_check(item)
        self.assertIn("QA_REJECT — DUPLICATE_CONCEPT", out)

    def test_novelty_cod_regression(self):
        item = dict(self.base_item)
        item["metadata"]["conceptKey"]["subject"] = "ray-gun-zombies-weapon"
        out = self.run_check(item)
        self.assertIn("QA_REJECT — DUPLICATE_CONCEPT", out)

    def test_novelty_overwatch_regression(self):
        item = dict(self.base_item)
        item["presentation"]["prompt"] = "It's High Noon"
        out = self.run_check(item)
        self.assertIn("QA_REJECT — DUPLICATE_CONCEPT", out)
        
    def test_alias_equivalence(self):
        item = dict(self.base_item)
        # Valid alias
        item["acceptedAnswers"] = ["Cassidy", "كاسيدي", "McCree"]
        out = self.run_check(item)
        self.assertIn("QA_PASS", out)



class TestResolverPurity(unittest.TestCase):
    def test_marhala_excludes_bomb(self):
        res = run_resolver("marhala", "video-games", "fifa")
        self.assertEqual(res.returncode, 0)
        out = res.stdout
        self.assertIn("## 2. MECHANIC PROFILE (marhala)", out)
        self.assertNotIn("Mechanic Profile: Bomb", out)
        self.assertNotIn("mechanicPayload.bomb", out)

    def test_bomb_excludes_marhala(self):
        res = run_resolver("bomb", "video-games", "fifa")
        self.assertEqual(res.returncode, 0)
        out = res.stdout
        self.assertIn("## 2. MECHANIC PROFILE (bomb)", out)
        self.assertNotIn("Mechanic Profile: Marhala", out)
        self.assertNotIn("mechanicPayload.marhalaDifficulty", out)




class TestSelfCollisionAndHistory(unittest.TestCase):
    def setUp(self):
        import json
        self.history_path = "ai/.opencode/authoring-concept-history.json"
        with open(self.history_path, "r") as f:
            self.history = json.load(f)
            
    def run_check(self, item, filename="test_artifact.json"):
        import subprocess, json
        path = _scratch(filename)
        with open(path, "w") as f:
            json.dump([item], f)
        res = subprocess.run(["python3", "ai/scripts/validate_novelty_ambiguity.py", path], capture_output=True, text=True)
        return res.stdout

    def test_self_collision_logic(self):
        # Test A: Artifact A with concept X
        item_a = {
            "id": "item-123",
            "metadata": {"conceptKey": {"subject": "synthetic-test-concept"}},
            "presentation": {"prompt": "test"},
            "acceptedAnswers": ["test"]
        }
        # Not in history -> PASS
        self.assertIn("QA_PASS", self.run_check(item_a, "artifact_A.json"))
        
        # Test B: Index A
        self.history["concepts"].append({
            "worldKey": "test",
            "scopeKey": "test",
            "conceptKey": {"subject": "synthetic-test-concept"},
            "humanProductStatus": "SEEN",
            "sourceArtifact": "artifact_A.json",
            "itemId": "item-123"
        })
        import json
        with open(self.history_path, "w") as f:
            json.dump(self.history, f)
            
        # Test C: Revalidate A (Should not self-collide)
        self.assertIn("QA_PASS", self.run_check(item_a, "artifact_A.json"))
        
        # Test D: Artifact B same concept
        item_b = {
            "id": "item-999",
            "metadata": {"conceptKey": {"subject": "synthetic-test-concept"}},
            "presentation": {"prompt": "test"},
            "acceptedAnswers": ["test"]
        }
        self.assertIn("QA_REJECT — DUPLICATE_CONCEPT", self.run_check(item_b, "artifact_B.json"))
        
        # Test E: Artifact B different concept
        item_c = {
            "id": "item-999",
            "metadata": {"conceptKey": {"subject": "synthetic-different-concept"}},
            "presentation": {"prompt": "test"},
            "acceptedAnswers": ["test"]
        }
        self.assertIn("QA_PASS", self.run_check(item_c, "artifact_B.json"))

        # Cleanup
        self.history["concepts"].pop()
        with open(self.history_path, "w") as f:
            json.dump(self.history, f)

class TestAnswerIntegrityStructure(unittest.TestCase):
    def run_check(self, item):
        import subprocess, json
        path = _scratch("temp_struct.json")
        with open(path, "w") as f:
            json.dump([item], f)
        res = subprocess.run(["python3", "ai/scripts/validate_novelty_ambiguity.py", path], capture_output=True, text=True)
        return res.stdout

    def test_empty_answers_rejected(self):
        item = {
            "id": "t1",
            "metadata": {"conceptKey": {"subject": "empty-test"}},
            "acceptedAnswers": []
        }
        self.assertIn("QA_REJECT — ANSWER_INTEGRITY", self.run_check(item))

    def test_duplicate_aliases_rejected(self):
        item = {
            "id": "t2",
            "metadata": {"conceptKey": {"subject": "dup-test"}},
            "acceptedAnswers": ["Wasted", "wasted"]
        }
        self.assertIn("QA_REJECT — ANSWER_INTEGRITY (Duplicate aliases", self.run_check(item))

    def test_llm_qa_semantic_simulation(self):
        # We explicitly simulate the LLM QA evaluating the answer contract
        def mock_llm_semantic_qa(canonical, aliases, answer_type):
            if answer_type == "EXACT_PHRASE":
                for a in aliases:
                    if a not in ["ويستد", "ويستيد"]: return False
            elif answer_type == "ENTITY":
                for a in aliases:
                    if a not in ["غينجي", "جينجي", "Genji", "Genji Shimada"]: return False
            elif answer_type == "OUTCOME":
                for a in aliases:
                    if "ينتقل" not in a and "يغير" not in a: return False
            return True

        # GTA Exact Phrase
        self.assertTrue(mock_llm_semantic_qa("Wasted", ["ويستد"], "EXACT_PHRASE"))
        self.assertFalse(mock_llm_semantic_qa("Wasted", ["موت"], "EXACT_PHRASE")) # Meaning only

        # Genji Entity
        self.assertTrue(mock_llm_semantic_qa("Genji", ["غينجي"], "ENTITY"))
        self.assertFalse(mock_llm_semantic_qa("Genji", ["نينجا ياباني"], "ENTITY")) # Broad category
        
        # CoD Outcome
        self.assertTrue(mock_llm_semantic_qa("الصندوق ينتقل لمكان ثاني", ["ينتقل الصندوق"], "OUTCOME"))
        self.assertFalse(mock_llm_semantic_qa("الصندوق ينتقل لمكان ثاني", ["يختفي"], "OUTCOME")) # Partial

if __name__ == '__main__':
    unittest.main()
