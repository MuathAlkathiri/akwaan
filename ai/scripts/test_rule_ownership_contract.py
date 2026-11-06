"""Documentation contracts for the Slice 2B-2 rule-ownership boundary."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
QUESTION_CRAFT = ROOT / "ai/.opencode/knowledge/architecture/QUESTION-CRAFT.md"
AUTHORING_SKILL = ROOT / ".agents/skills/akwaan-content/SKILL.md"
QA_SKILL = ROOT / ".agents/skills/akwaan-content-qa/SKILL.md"
BOMB_SKILL = ROOT / "ai/.opencode/skills/challenge-types/bomb/SKILL.md"
TOP5_SKILL = ROOT / "ai/.opencode/skills/challenge-types/top-5/SKILL.md"
DI_SKILL = ROOT / "ai/.opencode/skills/challenge-types/distributed-information/SKILL.md"
RESOLVER = ROOT / "ai/scripts/resolve_authoring_context.py"


class RuleOwnershipContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.global_rules = QUESTION_CRAFT.read_text(encoding="utf-8")
        cls.authoring = AUTHORING_SKILL.read_text(encoding="utf-8")
        cls.qa = QA_SKILL.read_text(encoding="utf-8")
        cls.bomb = BOMB_SKILL.read_text(encoding="utf-8")
        cls.top5 = TOP5_SKILL.read_text(encoding="utf-8")
        cls.di = DI_SKILL.read_text(encoding="utf-8")
        cls.resolver = RESOLVER.read_text(encoding="utf-8")

    def test_global_contract_declares_each_owner_and_precedence(self):
        for marker in (
            "## Rule Ownership and Precedence",
            "Global question craft, evidence, wording, and novelty principles",
            "Mechanic interaction, payload, modality, and answer semantics",
            "World identity, presentation, and broad taste boundaries",
            "Domain specialization and exclusions",
            "Context resolution, tool use, and artifact workflow",
            "Authoring-pack shape and fixture validation",
            "Candidate screening and canonical `ContentItem` compatibility",
            "Final acceptance, rejection, and promotion decisions",
            "Specific product decisions and runtime contracts take precedence",
            "AI evaluation or a validator never constitutes human approval",
        ):
            self.assertIn(marker, self.global_rules)

    def test_global_rules_include_moved_craft_contracts(self):
        self.assertIn("CONTEXTUAL_ANSWER_LEAKAGE", self.global_rules)
        self.assertIn("## Concept Identity and Novelty (GLOBAL CRAFT CONTRACT)", self.global_rules)

    def test_agent_skill_is_overlay_and_keeps_fail_closed_workflow(self):
        self.assertIn("workflow and tool-execution overlay", self.authoring)
        self.assertIn("QUESTION-CRAFT.md", self.authoring)
        self.assertIn("resolve_authoring_context.py", self.authoring)
        self.assertIn("_authoringContext", self.authoring)
        self.assertNotIn("## 0. Canonical Product Principles", self.authoring)
        self.assertNotIn("Cars Bomb", self.authoring)

    def test_qa_skill_is_overlay_not_global_owner(self):
        self.assertIn("QA workflow overlay", self.qa)
        self.assertIn("Global craft principles are owned by", self.qa)
        self.assertIn("Human Admin review remains the final approval", self.qa)

    def test_mechanic_specific_cars_rules_remain_in_bomb_skill(self):
        self.assertNotIn("Cars World specialization", self.global_rules)
        self.assertNotIn("Cars Bomb", self.global_rules)
        self.assertIn("When Bomb is used with the Cars World", self.bomb)
        for marker in (
            "### Cars World specialization",
            "shortest unambiguous model or trim designation",
            "generic labels such as `Turbo`, `Sport`, `RS`, or `GT`",
            "Manufacturer\nbranding may remain",
        ):
            self.assertIn(marker, self.bomb)
        self.assertIn("global contextual leakage rule", self.bomb)

    def test_bomb_world_contracts_are_owned_by_the_bomb_skill(self):
        # Phase 2B Batch 3B-1: moved out of the global profile, not dropped.
        self.assertNotIn("World-Native Bomb Interaction Contracts", self.global_rules)
        self.assertNotIn("Football Bomb", self.global_rules)
        for marker in (
            "### Football World specialization",
            "exactly one\nname-completion item (`NAME_FRAGMENT`) and at least two media-recognition items",
            "Football's name-fragment ratio does not generalise to any other World.",
            "### Anime World specialization",
            "### Video Games World specialization",
            "### Puzzles World specialization",
            "100% rapid visual\nmicro-puzzles",
        ):
            self.assertIn(marker, self.bomb)
        self.assertEqual(self.bomb.count("No\nname-completion templates.")
                         + self.bomb.count("No name-completion templates."), 3)
        # Video Games Bomb: §25.2 (text/image only) is current; §23.4 audio superseded.
        self.assertIn("roadmap\n§25.2 bans audio for forward Bomb and is the current policy", self.bomb)
        self.assertIn("does not authorize authoring audio Bomb items", self.bomb)
        self.assertIn("- FORBIDDEN: `audio`", self.bomb)

    def test_global_pointer_names_required_mechanic_skills(self):
        for marker in (
            "`ai/.opencode/skills/challenge-types/bomb/SKILL.md`",
            "`ai/.opencode/skills/challenge-types/top-5/SKILL.md`",
            "Bomb authoring and QA\nrequire the Bomb Skill",
            "Top-5 authoring and QA require the Top-5 Skill",
            "This file alone is not enough",
        ):
            self.assertIn(marker, self.global_rules)

    def test_top5_and_distributed_information_contracts_are_mechanic_owned(self):
        self.assertNotIn("Top-5 Keep-or-Give Contract", self.global_rules)
        self.assertNotIn("TOP5_VISIBLE_CANDIDATE_NAME_ONLY", self.global_rules)
        for marker in (
            "the challenge topic only",
            "zero tutorial wording",
            "entity names only",
            "Zero stats, numbers, ranks, or notes",
            "exact ranks (1–5, or none for a trap), metrics, evidence,\n  and cutoff dates",
            "`TOP5_VISIBLE_CANDIDATE_NAME_ONLY`",
        ):
            self.assertIn(marker, self.top5)
        # The QA overlay keeps its own Top-5 gate.
        self.assertIn("TOP5_VISIBLE_CANDIDATE_NAME_ONLY", self.qa)
        self.assertIn("visual clue cards, private diagrams, maps, or coordinate fragments", self.di)
        self.assertNotIn("visual clue cards", self.global_rules)

    def test_resolver_uses_the_canonical_global_profile(self):
        self.assertIn("QUESTION-CRAFT.md", self.resolver)
        self.assertNotIn(".agents/skills/akwaan-content/SKILL.md", self.resolver)


if __name__ == "__main__":
    unittest.main()
