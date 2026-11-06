import type {
  FirstNoteTutorialScenario,
  FirstNoteTutorialBid,
} from "./tutorial-scenario";

export type FirstNoteDemoStepId =
  | "opening"
  | "bid-8"
  | "bid-5"
  | "bid-3"
  | "auction-won"
  | "playback"
  | "playback-complete"
  | "wrong"
  | "steal"
  | "correct"
  | "reveal";

export interface FirstNoteDemoStep {
  id: FirstNoteDemoStepId;
  caption: string;
  holdSeconds: number;
}

export const FIRST_NOTE_DEMO_STEPS: readonly FirstNoteDemoStep[] = [
  {
    id: "opening",
    caption: "دليل واحد يفتح المزاد: كم ثانية تحتاجون عشان تعرفون الأغنية؟",
    holdSeconds: 2.1,
  },
  {
    id: "bid-8",
    caption: "الفريق الأول يبدأ بمزايدة 8 ثوانٍ.",
    holdSeconds: 2.1,
  },
  {
    id: "bid-5",
    caption: "الفريق الثاني ينزلها إلى 5 ثوانٍ؛ كل رقم أقل يعني مخاطرة أكبر.",
    holdSeconds: 2.2,
  },
  {
    id: "bid-3",
    caption: "الفريق الأول يضغط إلى 3 ثوانٍ، وهي آخر مزايدة في المثال.",
    holdSeconds: 2.2,
  },
  {
    id: "auction-won",
    caption: "الفريق الثاني يترك المزايدة؛ الفريق الأول يأخذ أولوية الإجابة.",
    holdSeconds: 2.3,
  },
  {
    id: "playback",
    caption: "الجميع يسمع نفس المقطع العام لمدة 3 ثوانٍ فقط.",
    holdSeconds: 3.5,
  },
  {
    id: "playback-complete",
    caption: "انتهت الثلاث ثوانٍ — لا توجد لحظة إضافية للفريق الآخر.",
    holdSeconds: 1.1,
  },
  {
    id: "wrong",
    caption: "الفريق الأول يكتب عنوانًا خاطئًا، فتُفتح سرقة واحدة فقط.",
    holdSeconds: 2.4,
  },
  {
    id: "steal",
    caption: "الفريق الثاني يحصل على نفس نافذة 3 ثوانٍ — بلا تمديد.",
    holdSeconds: 2.5,
  },
  {
    id: "correct",
    caption: "إجابة السرقة صحيحة: الفريق الثاني يحصل على نقطة واحدة.",
    holdSeconds: 2.4,
  },
  {
    id: "reveal",
    caption: "ينكشف عنوان الأغنية ونتيجة هذا السؤال، ثم يبدأ السؤال التالي.",
    holdSeconds: 4.2,
  },
];

export const FIRST_NOTE_DEMO_BIDS: FirstNoteTutorialBid[] = [
  { team: "team-a", seconds: 8 },
  { team: "team-b", seconds: 5 },
  { team: "team-a", seconds: 3 },
];

export const SAMPLE_FIRST_NOTE_TUTORIAL_SCENARIO: FirstNoteTutorialScenario = {
  kind: "first-note",
  version: 1,
  prompt: "تعرّفوا على الأغنية من مزاد ثوانٍ قصير.",
  title: "على بالي",
  clueLabel: "السياق",
  contextualClue:
    "أغنية عربية معاصرة بصوت نسائي، من ألبوم حاز انتشارًا واسعًا.",
  bids: FIRST_NOTE_DEMO_BIDS,
  acceptedAnswers: ["على بالي"],
  firstSubmittedAnswer: "ليلة صيف",
  stealSubmittedAnswer: "على بالي",
  caption: "مثال تعليمي فقط — هذا ليس سؤال المباراة.",
  outcome: {
    songCount: 3,
    bids: FIRST_NOTE_DEMO_BIDS,
    finalBidSeconds: 3,
    auctionWinner: "team-a",
    firstAnswerTeam: "team-a",
    firstAnswerFailed: true,
    stealTeam: "team-b",
    stolen: true,
    firstCorrectReward: 3,
    stealReward: 1,
    points: { "team-a": 0, "team-b": 1 },
    reason: "first-note.auction-steal",
  },
};
