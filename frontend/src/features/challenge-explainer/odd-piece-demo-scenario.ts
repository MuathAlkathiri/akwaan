import type {
  OddPieceHotspotTutorialScenario,
  OddPieceLegacyTutorialScenario,
  OddPieceTutorialScenario,
} from "./tutorial-scenario";

export type OddPieceV2DemoStepId =
  | "inspection"
  | "claim"
  | "team-1-answering"
  | "team-1-wrong"
  | "handoff"
  | "team-2-correct"
  | "reveal"
  | "three-puzzles";

export type OddPieceLegacyDemoStepId =
  | "opening"
  | "answer"
  | "wrong"
  | "handoff"
  | "correct"
  | "reveal"
  | "three-puzzles";

export type OddPieceDemoStepId =
  OddPieceV2DemoStepId | OddPieceLegacyDemoStepId;

export interface OddPieceDemoStep {
  id: OddPieceDemoStepId;
  caption: string;
  holdSeconds: number;
}

export const ODD_PIECE_V2_DEMO_STEPS: readonly OddPieceDemoStep[] = [
  {
    id: "inspection",
    caption:
      "صورة واحدة لسيارة معدّلة تحتوي على قطعة دخيلة من سيارة أخرى. بإمكان الفريقين تكبير الصورة وتحريكها للمناقشة.",
    holdSeconds: 3.5,
  },
  {
    id: "claim",
    caption:
      "الفريق الأول يضغط «جاوب» على هاتفه لحجز فرصة التحديد قبل الفريق المنافس.",
    holdSeconds: 3.0,
  },
  {
    id: "team-1-answering",
    caption:
      "تبدأ نافذة 5 ثوانٍ حصرية للفريق الأول لتحديد موضع القطعة الدخيلة على شاشة الهاتف.",
    holdSeconds: 3.0,
  },
  {
    id: "team-1-wrong",
    caption:
      "الفريق الأول يحدد موضعاً خاطئاً؛ تضيع محاولته فوراً وتُقفل دون كشف الحل.",
    holdSeconds: 3.0,
  },
  {
    id: "handoff",
    caption:
      "تنتقل فرصة مستقلة لمدة 5 ثوانٍ للفريق الثاني لتحديد القطعة الدخيلة على نفس السؤال.",
    holdSeconds: 3.0,
  },
  {
    id: "team-2-correct",
    caption:
      "الفريق الثاني يحدد موضع القطعة الدخيلة الصحيح بدقة ويكسب نقطة اللغز.",
    holdSeconds: 3.2,
  },
  {
    id: "reveal",
    caption:
      "كشف الحل الرسمي: إبراز القطعة الدخيلة على الصورة المعدّلة، والمقارنة مع الصورة الأصلية بدون تعديل.",
    holdSeconds: 5.2,
  },
  {
    id: "three-puzzles",
    caption:
      "يتكون التحدي من 3 ألغاز متتالية؛ الفريق صاحب النقاط الأكثر يكسب نقطة التحدي في المباراة.",
    holdSeconds: 6.5,
  },
];

export const ODD_PIECE_V1_DEMO_STEPS: readonly OddPieceDemoStep[] = [
  {
    id: "opening",
    caption:
      "أمامكم أربع قطع من تفاصيل سيارات؛ ثلاث منها لنفس السيارة وواحدة دخيلة.",
    holdSeconds: 3,
  },
  {
    id: "answer",
    caption:
      "الفريق الأول يضغط جاوب ويختار القطعة التي يظن أنها لا تنتمي للمجموعة.",
    holdSeconds: 2.8,
  },
  {
    id: "wrong",
    caption:
      "الاختيار الأول غير صحيح؛ القطعة ما زالت من السيارة الهدف، فتضيع المحاولة.",
    holdSeconds: 2.8,
  },
  {
    id: "handoff",
    caption:
      "تنتقل الفرصة الحقيقية للفريق الثاني — لا يتغير السؤال ولا تُعاد المحاولة الأولى.",
    holdSeconds: 2.8,
  },
  {
    id: "correct",
    caption: "الفريق الثاني يلتقط القطعة الدخيلة ويحصل على نقطة المباراة.",
    holdSeconds: 2.8,
  },
  {
    id: "reveal",
    caption:
      "بعد الحسم يظهر أصل القطع: ثلاث تفاصيل من BMW M4 G82، والقطعة الدخيلة من Mercedes-AMG C63 W206.",
    holdSeconds: 5.2,
  },
  {
    id: "three-puzzles",
    caption: "هذا سؤال واحد من أصل 3 ألغاز في التحدي الكامل.",
    holdSeconds: 7.4,
  },
];

export const ODD_PIECE_DEMO_STEPS = ODD_PIECE_V2_DEMO_STEPS;

const media = (file: string) => `/tutorial-media/odd-piece-v1/${file}`;

// Historical controlled SVG fixtures retained for V2 regression coverage only.
// The current BMW tutorial scenario below uses the owner-supplied PNG instead.
const V2_FIXTURE_MODIFIED_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800' viewBox='0 0 1200 800'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%230f172a'/%3E%3Cstop offset='50%25' stop-color='%231e293b'/%3E%3Cstop offset='100%25' stop-color='%23020617'/%3E%3C/linearGradient%3E%3ClinearGradient id='carBody' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0%25' stop-color='%231e3a8a'/%3E%3Cstop offset='50%25' stop-color='%233b82f6'/%3E%3Cstop offset='100%25' stop-color='%231d4ed8'/%3E%3C/linearGradient%3E%3ClinearGradient id='intruderScoop' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0%25' stop-color='%23ea580c'/%3E%3Cstop offset='100%25' stop-color='%239a3412'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='800' fill='url(%23bg)'/%3E%3Ctext x='600' y='760' fill='%2364748b' font-family='sans-serif' font-size='18' text-anchor='middle'%3E%5B%D9%85%D8%B9%D8%A7%D9%8A%D9%86%D8%A9 %D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1%D9%8A%D8%A9 %D9%85%D8%B6%D8%A8%D9%88%D8%B7%D8%A9 %E2%80%94 Controlled Test Fixture%5D%3C/text%3E%3Cpath d='M150 560 Q280 430 460 410 L680 400 Q860 410 1020 480 L1070 580 L130 580 Z' fill='url(%23carBody)' stroke='%2360a5fa' stroke-width='3'/%3E%3Cpath d='M420 408 L520 280 L760 280 L880 405 Z' fill='%230f172a' stroke='%2338bdf8' stroke-width='2' opacity='.85'/%3E%3Ccircle cx='300' cy='580' r='85' fill='%23020617' stroke='%2394a3b8' stroke-width='8'/%3E%3Ccircle cx='300' cy='580' r='45' fill='%23475569'/%3E%3Ccircle cx='920' cy='580' r='85' fill='%23020617' stroke='%2394a3b8' stroke-width='8'/%3E%3Ccircle cx='920' cy='580' r='45' fill='%23475569'/%3E%3Cg id='intruder-part'%3E%3Crect x='670' y='300' width='140' height='100' rx='16' fill='url(%23intruderScoop)' stroke='%23fb923c' stroke-width='4'/%3E%3Cellipse cx='740' cy='335' rx='45' ry='18' fill='%23020617' stroke='%23ea580c' stroke-width='2'/%3E%3Cellipse cx='740' cy='368' rx='45' ry='18' fill='%23020617' stroke='%23ea580c' stroke-width='2'/%3E%3C/g%3E%3C/svg%3E";

const V2_FIXTURE_ORIGINAL_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800' viewBox='0 0 1200 800'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%230f172a'/%3E%3Cstop offset='50%25' stop-color='%231e293b'/%3E%3Cstop offset='100%25' stop-color='%23020617'/%3E%3C/linearGradient%3E%3ClinearGradient id='carBody' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0%25' stop-color='%231e3a8a'/%3E%3Cstop offset='50%25' stop-color='%233b82f6'/%3E%3Cstop offset='100%25' stop-color='%231d4ed8'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='800' fill='url(%23bg)'/%3E%3Ctext x='600' y='760' fill='%2364748b' font-family='sans-serif' font-size='18' text-anchor='middle'%3E%5B%D9%85%D8%B9%D8%A7%D9%8A%D9%86%D8%A9 %D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1%D9%8A%D8%A9 %D9%85%D8%B6%D8%A8%D9%88%D8%B7%D8%A9 %E2%80%94 Controlled Test Fixture%5D%3C/text%3E%3Cpath d='M150 560 Q280 430 460 410 L680 400 Q860 410 1020 480 L1070 580 L130 580 Z' fill='url(%23carBody)' stroke='%2360a5fa' stroke-width='3'/%3E%3Cpath d='M420 408 L520 280 L760 280 L880 405 Z' fill='%230f172a' stroke='%2338bdf8' stroke-width='2' opacity='.85'/%3E%3Ccircle cx='300' cy='580' r='85' fill='%23020617' stroke='%2394a3b8' stroke-width='8'/%3E%3Ccircle cx='300' cy='580' r='45' fill='%23475569'/%3E%3Ccircle cx='920' cy='580' r='85' fill='%23020617' stroke='%2394a3b8' stroke-width='8'/%3E%3Ccircle cx='920' cy='580' r='45' fill='%23475569'/%3E%3Cg id='original-part'%3E%3Cpath d='M680 340 L810 340 L790 380 L670 380 Z' fill='%231d4ed8' stroke='%2360a5fa' stroke-width='2'/%3E%3C/g%3E%3C/svg%3E";

/** Historical controlled fixture retained for V2 regression compatibility, not displayed by the BMW tutorial. */
export const CONTROLLED_V2_FIXTURE_MEDIA = {
  modified: V2_FIXTURE_MODIFIED_SVG,
  original: V2_FIXTURE_ORIGINAL_SVG,
};

export const SAMPLE_ODD_PIECE_V2_TUTORIAL_SCENARIO: OddPieceHotspotTutorialScenario =
  {
    kind: "odd-piece",
    version: 2,
    prompt: "أين القطعة الدخيلة في هذه السيارة؟",
    targetVehicleIdentity:
      "BMW M4-style tutorial depiction; owner-supplied AI image",
    targetVehicleLabel: "BMW M4 — تمثيل بصري تعليمي",
    intruderVehicleIdentity: "غير موثّق — لا تُنسب العجلة إلى مركبة محددة",
    intruderVehicleLabel: "عجلة دخيلة (محاكاة تعليمية)",
    intruderPartIdentity: "front-wheel-face-simulation",
    intruderPartLabel: "العجلة الأمامية الدخيلة (محاكاة)",
    modifiedImage: {
      width: 1942,
      height: 809,
      orientation: "landscape",
      media: {
        type: "image",
        assets: [
          {
            url: "/tutorial-media/odd-piece-v2/question-modified-bmw-m4.png",
          },
        ],
      },
    },
    originalImage: {
      width: 1942,
      height: 809,
      orientation: "landscape",
      media: {
        type: "image",
        // No authenticated original pair was supplied. This is intentionally
        // the same image only to satisfy the shared scenario shape; the renderer
        // suppresses original/comparison controls in hotspot-detail mode.
        assets: [
          {
            url: "/tutorial-media/odd-piece-v2/question-modified-bmw-m4.png",
          },
        ],
      },
    },
    hotspot: {
      polygon: [
        { x: 0.378, y: 0.495 },
        { x: 0.424, y: 0.478 },
        { x: 0.468, y: 0.495 },
        { x: 0.493, y: 0.555 },
        { x: 0.502, y: 0.66 },
        { x: 0.493, y: 0.79 },
        { x: 0.462, y: 0.895 },
        { x: 0.419, y: 0.93 },
        { x: 0.378, y: 0.905 },
        { x: 0.35, y: 0.81 },
        { x: 0.341, y: 0.68 },
        { x: 0.35, y: 0.56 },
      ],
      tolerance: 0.018,
    },
    tutorialRevealMode: "hotspot-detail",
    tutorialMediaDisclosure:
      "صورة AI مقدّمة من مالك المنتج للشرح فقط؛ لا تمثل محتوى إنتاجياً ولا تثبت هوية مصدر العجلة.",
    team1Tap: { x: 0.62, y: 0.45 },
    team2Tap: { x: 0.42, y: 0.7 },
    caption: "معاينة تجريبية — صورة تعليمية وليست سؤالاً إنتاجياً.",
    outcome: {
      firstClaimTeam: "team-a",
      firstClaimCorrect: false,
      handoffTeam: "team-b",
      secondClaimCorrect: true,
      winnerTeam: "team-b",
      points: { "team-a": 0, "team-b": 1 },
      matchPointDelta: 1,
      targetVehicleLabel: "BMW M4 — تمثيل بصري تعليمي",
      intruderVehicleLabel: "عجلة دخيلة (محاكاة تعليمية)",
      intruderPartLabel: "العجلة الأمامية الدخيلة (محاكاة)",
      puzzleCount: 3,
      reason: "odd-piece.hotspot-claim-handoff",
    },
  };

export const SAMPLE_ODD_PIECE_V1_TUTORIAL_SCENARIO: OddPieceLegacyTutorialScenario =
  {
    kind: "odd-piece",
    version: 1,
    prompt: "أي قطعة لا تنتمي لنفس السيارة؟",
    targetVehicleIdentity: "BMW M4 Competition Coupe (G82), 2021-present",
    targetVehicleLabel: "BMW M4 Competition Coupe (G82)",
    intruderVehicleIdentity: "Mercedes-AMG C 63 (W206), 2022-present",
    intruderVehicleLabel: "Mercedes-AMG C 63 (W206)",
    pieces: [
      {
        id: "piece-a-headlight",
        imageUrl: media("target-headlight.jpg"),
        altText: "قطعة أ",
        vehicleIdentity: "BMW M4 Competition Coupe (G82), 2021-present",
        vehicleLabel: "BMW M4 G82",
      },
      {
        id: "piece-b-brake",
        imageUrl: media("target-brake.jpg"),
        altText: "قطعة ب",
        vehicleIdentity: "BMW M4 Competition Coupe (G82), 2021-present",
        vehicleLabel: "BMW M4 G82",
      },
      {
        id: "piece-c-diffuser",
        imageUrl: media("target-diffuser.jpg"),
        altText: "قطعة ج",
        vehicleIdentity: "BMW M4 Competition Coupe (G82), 2021-present",
        vehicleLabel: "BMW M4 G82",
      },
      {
        id: "piece-d-intruder",
        imageUrl: media("intruder-headlight.jpg"),
        altText: "قطعة د",
        vehicleIdentity: "Mercedes-AMG C 63 (W206), 2022-present",
        vehicleLabel: "Mercedes-AMG C63 W206",
      },
    ],
    wrongSelectionPieceId: "piece-b-brake",
    correctSelectionPieceId: "piece-d-intruder",
    targetReveal: {
      imageUrl: media("reveal-g82-blurred-plate.jpg"),
      altText: "BMW M4 Competition Coupe G82 بعد كشف الحل، مع طمس لوحة المركبة",
    },
    caption: "مثال محلي موثّق — لا يُستخدم كسؤال تنافسي.",
    outcome: {
      firstClaimTeam: "team-a",
      firstClaimPieceId: "piece-b-brake",
      firstClaimCorrect: false,
      handoffTeam: "team-b",
      secondClaimPieceId: "piece-d-intruder",
      secondClaimCorrect: true,
      winnerTeam: "team-b",
      points: { "team-a": 0, "team-b": 1 },
      matchPointDelta: 1,
      intruderPieceId: "piece-d-intruder",
      targetVehicleLabel: "BMW M4 Competition Coupe (G82)",
      targetReveal: {
        imageUrl: media("reveal-g82-blurred-plate.jpg"),
        altText:
          "BMW M4 Competition Coupe G82 بعد كشف الحل، مع طمس لوحة المركبة",
      },
      puzzleCount: 3,
      reason: "odd-piece.claim-handoff",
    },
  };

export const SAMPLE_ODD_PIECE_TUTORIAL_SCENARIO: OddPieceTutorialScenario =
  SAMPLE_ODD_PIECE_V2_TUTORIAL_SCENARIO;

export const ODD_PIECE_MEDIA_CREDITS = [
  {
    author: "Owner-supplied media (local tutorial review)",
    title: "Odd Piece V2 owner-supplied BMW tutorial image",
    source:
      "Local owner-supplied PNG; SHA-256 verified in the product-review manifest",
    modification:
      "Used unchanged as tutorial-only media. This is not an authenticated original/modified production pair and is not approved for ContentItem publication.",
  },
] as const;
