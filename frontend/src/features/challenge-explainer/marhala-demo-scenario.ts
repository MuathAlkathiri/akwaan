import type { MarhalaTutorialScenario } from "./tutorial-scenario";

export type MarhalaDemoStepId =
  | "board"
  | "difficulty"
  | "question"
  | "correct"
  | "roll"
  | "movement"
  | "boost"
  | "pressure"
  | "takeaway";

export interface MarhalaDemoStep {
  id: MarhalaDemoStepId;
  caption: string;
  holdSeconds: number;
}

export const MARHALA_DEMO_STEPS: readonly MarhalaDemoStep[] = [
  { id: "board", caption: "سباق المرحلة يبدأ من لوحة 4×4 — الوصول إلى المربع 16 يفوز.", holdSeconds: 2.6 },
  { id: "difficulty", caption: "قبل السؤال، يختار الفريق مقدار المخاطرة: سهل 1–2، متوسط 2–4، أو صعب 4–6.", holdSeconds: 3.2 },
  { id: "question", caption: "اختار الفريق صعبًا؛ الآن يجيب عن السؤال قبل أن يعرف مقدار الحركة.", holdSeconds: 2.8 },
  { id: "correct", caption: "الإجابة الصحيحة تفتح الحركة داخل النطاق المختار.", holdSeconds: 2.2 },
  { id: "roll", caption: "هذا ليس نردًا: الشريط يعرض قيم صعب الحقيقية، والنتيجة المعتمدة هي +6.", holdSeconds: 2.5 },
  { id: "movement", caption: "يتحرك الفريق الأول من 5 إلى 11 على المسار المتعرج.", holdSeconds: 2.8 },
  { id: "boost", caption: "المحطة 11 قفزة: السلم يطلّعهم من 11 إلى 15.", holdSeconds: 2.9 },
  { id: "pressure", caption: "الفريق الثاني ما زال قريبًا؛ كل دور يكرر الاختيار ثم السؤال ثم تأثير المربع.", holdSeconds: 2.4 },
  { id: "takeaway", caption: "اختيار الصعوبة يحدد مدى الحركة، والإجابة الخاطئة لا تحرك الفريق، وأول من يصل إلى 16 يفوز.", holdSeconds: 4.2 },
];

export const SAMPLE_MARHALA_TUTORIAL_SCENARIO: MarhalaTutorialScenario = {
  kind: "marhala",
  version: 1,
  prompt: "أي لعبة ترتبط بشخصية كريتوس؟",
  correctAnswer: "غود أوف وور",
  submittedAnswer: "غود أوف وور",
  teamAPosition: 5,
  teamBPosition: 9,
  activeTeam: "team-a",
  difficulty: "hard",
  movement: 6,
  baseLanding: 11,
  tile: "boost",
  finalLanding: 15,
  caption: "مثال تعليمي فقط — يشرح دورة المرحلة على لوحة حقيقية.",
  outcome: {
    teamAPosition: 15,
    teamBPosition: 9,
    activeTeam: "team-a",
    difficulty: "hard",
    movement: 6,
    baseLanding: 11,
    tile: "boost",
    finalLanding: 15,
    correct: true,
    matchPointDelta: 0,
    reason: "marhala.tutorial-turn",
  },
};
