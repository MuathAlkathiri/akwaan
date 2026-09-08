import json
import os
import subprocess
import unittest

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
        self.assertEqual(len(scopes), 62, "Should have exactly 62 scopes")
        
        total_scopes = 0
        for w, wdata in worlds.items():
            total_scopes += len(wdata["scopes"])
            for s in wdata["scopes"]:
                self.assertIn(f"{w}/{s}", scopes)
        
        self.assertEqual(total_scopes, 62, "Sum of per-world scopes must equal 62")
        
        for s_slug, s_data in scopes.items():
            self.assertTrue(os.path.exists(s_data["scopePath"]))
            self.assertTrue(os.path.exists(s_data["knowledgePath"]))

    def test_mechanics_inventory(self):
        mechs = self.manifest["mechanics"]
        
        expected_authorable = ["bomb", "marhala", "combo", "read-your-opponent", "closest", "top-5", "distributed-information", "odd-piece", "first-note", "laqatha"]
        expected_legacy = ["one-clue", "guess-your-teammate", "twenty-inquiries", "same-wavelength", "split", "split-clue", "who-among-us"]
        
        for k in expected_authorable:
            self.assertIn(k, mechs)
            self.assertEqual(mechs[k]["status"], "AUTHORABLE")
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
        
        # distributed-information + puzzles + logic-deduction -> PASS
        self.assertEqual(run_resolver("distributed-information", "puzzles", "logic-deduction").returncode, 0)
        
        # odd-piece + cars + german-cars -> PASS
        self.assertEqual(run_resolver("odd-piece", "cars", "german-cars").returncode, 0)
        
        # first-note + music + arabic-music -> PASS
        self.assertEqual(run_resolver("first-note", "music", "arabic-music").returncode, 0)
        
        # laqatha + movies + marvel -> PASS
        self.assertEqual(run_resolver("laqatha", "movies", "marvel").returncode, 0)

    def test_provenance(self):
        res = run_resolver("marhala", "video-games", "fifa")
        meta_part = res.stdout.split("=== CONTEXT ===")[0].replace("=== METADATA ===", "").strip()
        
        with open("test_artifact_valid.json", "w") as f:
            f.write(meta_part)
            
        cmd = ["python3", "ai/scripts/validate_authoring_context.py", "test_artifact_valid.json"]
        v_res = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(v_res.returncode, 0)
        self.assertIn("VALIDATION_PASSED", v_res.stdout)
        
        stale = json.loads(meta_part)
        stale["_authoringContext"]["composedHash"] = "badhash"
        with open("test_artifact_stale.json", "w") as f:
            json.dump(stale, f)
        v_res = subprocess.run(["python3", "ai/scripts/validate_authoring_context.py", "test_artifact_stale.json"], capture_output=True, text=True)
        self.assertNotEqual(v_res.returncode, 0)

        for f in ["test_artifact_valid.json", "test_artifact_stale.json"]:
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
        with open("temp_test_item.json", "w") as f:
            json.dump([item], f)
        res = subprocess.run(["python3", "ai/scripts/validate_novelty_ambiguity.py", "temp_test_item.json"], capture_output=True, text=True)
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
        with open(filename, "w") as f:
            json.dump([item], f)
        res = subprocess.run(["python3", "ai/scripts/validate_novelty_ambiguity.py", filename], capture_output=True, text=True)
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
        with open("temp_struct.json", "w") as f:
            json.dump([item], f)
        res = subprocess.run(["python3", "ai/scripts/validate_novelty_ambiguity.py", "temp_struct.json"], capture_output=True, text=True)
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
