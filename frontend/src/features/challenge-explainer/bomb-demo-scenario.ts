import type { BombTutorialScenario } from "./tutorial-scenario";

export const BOMB_DEMO_STEPS = [
  {
    id: "question",
    caption: "يبدأ فريق واحد والساعة تتحرك.",
    holdSeconds: 2.7,
  },
  {
    id: "typing-incorrect",
    caption: "يكتب الفريق الأول إجابته — ثم يضغط إرسال.",
    holdSeconds: 2.2,
  },
  {
    id: "incorrect",
    caption: "إجابة خاطئة — تبقى القنبلة والساعة مع الفريق نفسه.",
    holdSeconds: 2.4,
  },
  {
    id: "typing-correct",
    caption: "يبقى الدور مع الفريق الأول؛ يكتب الإجابة الصحيحة ويرسلها.",
    holdSeconds: 2.2,
  },
  {
    id: "answer",
    caption: "إجابة صحيحة — تتوقف ساعة الفريق الأول.",
    holdSeconds: 2.4,
  },
  {
    id: "pass",
    caption: "إجابة صحيحة — تنتقل القنبلة للفريق الثاني، من دون تصفير الوقت.",
    holdSeconds: 2.3,
  },
  {
    id: "typing-opponent-correct",
    caption: "الفريق الثاني يكتب إجابته الصحيحة ويرسلها.",
    holdSeconds: 2.2,
  },
  {
    id: "opponent-answer",
    caption: "إجابة الفريق الثاني صحيحة — تتوقف ساعته.",
    holdSeconds: 2.4,
  },
  {
    id: "return-pass",
    caption: "تنتقل القنبلة للفريق الأول مجددًا، وتظهر مسألة جديدة.",
    holdSeconds: 2.3,
  },
  {
    id: "skip",
    caption: "الفريق الأول يتخطّى المسألة الجديدة؛ خُصمت 5 ثوانٍ وبقي الدور معه.",
    holdSeconds: 2.7,
  },
  {
    id: "pressure",
    caption: "يستمر العدّ التنازلي مع الفريق الأول بعد عودة الضغط.",
    holdSeconds: 2.7,
  },
  {
    id: "expiry",
    caption: "نفد وقت الفريق الأول؛ الفريق الثاني يفوز بالتحدي، لا بالمباراة كاملة.",
    holdSeconds: 3.8,
  },
] as const;

export const SAMPLE_BOMB_TUTORIAL_SCENARIO: BombTutorialScenario = {
  kind: "bomb",
  version: 1,
  prompt: "ما هو أكبر كوكب في المجموعة الشمسية؟",
  acceptedAnswer: "المشتري",
  nextPrompt: "وش اسم هذا الكوكب؟",
  nextQuestion: {
    prompt: "وش اسم هذا الكوكب؟",
    acceptedAnswer: "زحل",
    media: {
      type: "image",
      url: "/brand/cosmic/luxurious_ringed_planet_illustration.webp",
      altText: "رسم توضيحي لكوكب ذي حلقات",
    },
  },
  returnQuestion: {
    prompt: "كم ضلعًا للمثلث؟",
    acceptedAnswer: "ثلاثة",
  },
  startingTeam: "team-a",
  correctAtSecondsRemaining: 18,
  opponentExpiresAtSecondsRemaining: 0,
  outcome: {
    passedToTeam: "team-a",
    expiredTeam: "team-a",
    winnerTeam: "team-b",
    correctAnswerPassesTurn: true,
    timerResetsOnPass: false,
    matchPointDelta: 1,
    reason: "bomb.clock-expired",
  },
};
