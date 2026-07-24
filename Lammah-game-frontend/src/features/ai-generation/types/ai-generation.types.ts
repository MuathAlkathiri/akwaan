import type {
  AssetRequest,
  AssetStatus,
  DraftAsset,
  DraftAssetType,
  GameMode,
  QuestionCoverImage,
  QuestionDifficulty,
} from "@/types";

export type GenerateReviewedInput = {
  categoryId?: string;
  catalogName?: string;
  categoryName?: string;
  count?: number;
  difficulty?: QuestionDifficulty;
  language?: "ar";
  strategy?: "source-curated";
  sourceIds?: string[];
  allowGeneratedFallback?: boolean;
};

export type AgentTrace = {
  agent: string;
  status: "completed" | "failed" | "fallback";
  durationMs: number;
  reason?: string;
};

export interface ReviewedQuestionDraft {
  question: string;
  correctAnswer: string;
  wrongAnswers: string[];
  difficulty: QuestionDifficulty;
  gameMode: GameMode;
  type: DraftAssetType;
  assetRequest: AssetRequest | null;
  assetStatus: AssetStatus;
  asset: DraftAsset | null;
  primaryAssetRequest: AssetRequest | null;
  primaryAssetStatus: AssetStatus;
  primaryAsset: DraftAsset | null;
  coverImageRequest: AssetRequest | null;
  coverImageStatus: AssetStatus;
  coverImage: QuestionCoverImage | null;
  coverImageFailureReason?: string | null;
  assetFailureReason?: string;
  assetFailureStep?: string;
  assetFailureDiagnostics?: Record<string, unknown> | Record<string, unknown>[];
  wasGameplayAutoFixed?: boolean;
  gameplayFixReason?: string;
  explanation: string;
  qualityScore: number;
  issues: string[];
  agentTrace?: AgentTrace[];
  gameplayMetadata?: Record<string, unknown>;
  aiMetadata?: Record<string, unknown>;
  musicMetadata?: {
    title: string;
    artist: string;
    aliases?: string[];
    artistAliases?: string[];
    releaseYear?: number;
    region: "gulf";
    country?: string;
    language: "ar";
  };
  verificationDiagnostics?: {
    verificationRequired: boolean;
    verificationProvider: "wigolo" | "local-knowledge";
    verificationStatus:
      "VERIFIED" | "PARTIALLY_VERIFIED" | "REJECTED" | "UNAVAILABLE";
    verificationCacheHit: boolean;
    canonicalEntity: string;
    canonicalAnswer: string;
    verifiedAliasesCount: number;
    evidenceSourceCount: number;
    overallConfidence: number;
    identityConfidence: number;
    answerConfidence: number;
    associationConfidence: number;
    verificationDurationMs: number;
    verificationIssueCodes: string[];
    canonicalSongTitle?: string;
    canonicalArtist?: string;
    verifiedFranchise?: string;
  };
}

export interface GenerateReviewedQuestionsResult {
  statusCode: number;
  message: string;
  count: number;
  meta: Record<string, unknown>;
  data: { questions: ReviewedQuestionDraft[] };
}
