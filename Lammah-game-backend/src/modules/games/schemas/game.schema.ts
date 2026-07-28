import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export enum GameStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  FINISHED = 'finished',
}

export enum QuestionSelectionMode {
  FIXED = 'fixed',
  RANDOM = 'random',
}

export enum RankedListRoundStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
}

export enum RankedListOutcomeType {
  WINNER = 'winner',
  TIE = 'tie',
}

export interface RankedListRoundTeamState {
  teamIndex: number;
  strikes: number;
  temporaryScore: number;
  eliminated: boolean;
}

export interface RankedListRoundEntrySnapshot {
  id: string;
  rank: number;
  answer: {
    ar: string;
    en?: string;
  };
  aliases: string[];
  points: number;
}

export interface RankedListRevealedEntry {
  entryId: string;
  rank: number;
  teamIndex: number;
  points: number;
  submittedAnswer: string;
  revealedAt: Date;
}

export interface RankedListRoundOutcome {
  type: RankedListOutcomeType;
  winnerTeamIndex?: number;
  awardedPointsByTeam: number[];
}

export interface RankedListRoundState {
  questionId: Types.ObjectId;
  status: RankedListRoundStatus;
  activeTeamIndex: number;
  turnStartedAt: Date;
  turnExpiresAt: Date;
  turnSequence: number;
  turnDurationSeconds: number;
  maxStrikesPerTeam: number;
  teams: RankedListRoundTeamState[];
  entries: RankedListRoundEntrySnapshot[];
  revealedEntries: RankedListRevealedEntry[];
  outcome?: RankedListRoundOutcome;
  finalizedAt?: Date;
}

const RankedListRoundEntrySchema = new MongooseSchema(
  {
    id: {
      type: String,
      required: true,
    },
    rank: {
      type: Number,
      required: true,
    },
    answer: {
      ar: {
        type: String,
        required: true,
      },
      en: {
        type: String,
        required: false,
      },
    },
    aliases: {
      type: [String],
      default: [],
    },
    points: {
      type: Number,
      required: true,
    },
  },
  {
    _id: false,
  },
);

const RankedListRoundSchema = new MongooseSchema(
  {
    questionId: {
      type: Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    status: {
      type: String,
      enum: RankedListRoundStatus,
      required: true,
    },
    activeTeamIndex: {
      type: Number,
      required: true,
    },
    turnStartedAt: {
      type: Date,
      required: true,
    },
    turnExpiresAt: {
      type: Date,
      required: true,
    },
    turnSequence: {
      type: Number,
      required: true,
    },
    turnDurationSeconds: {
      type: Number,
      required: true,
    },
    maxStrikesPerTeam: {
      type: Number,
      required: true,
    },
    teams: [
      {
        _id: false,
        teamIndex: {
          type: Number,
          required: true,
        },
        strikes: {
          type: Number,
          required: true,
        },
        temporaryScore: {
          type: Number,
          required: true,
        },
        eliminated: {
          type: Boolean,
          required: true,
        },
      },
    ],
    entries: {
      type: [RankedListRoundEntrySchema],
      required: true,
    },
    revealedEntries: [
      {
        _id: false,
        entryId: {
          type: String,
          required: true,
        },
        rank: {
          type: Number,
          required: true,
        },
        teamIndex: {
          type: Number,
          required: true,
        },
        points: {
          type: Number,
          required: true,
        },
        submittedAnswer: {
          type: String,
          required: true,
        },
        revealedAt: {
          type: Date,
          required: true,
        },
      },
    ],
    outcome: {
      _id: false,
      type: {
        type: String,
        enum: RankedListOutcomeType,
      },
      winnerTeamIndex: {
        type: Number,
      },
      awardedPointsByTeam: {
        type: [Number],
      },
    },
    finalizedAt: {
      type: Date,
    },
  },
  {
    _id: false,
  },
);

export interface TeamData {
  _id?: Types.ObjectId;
  name: string;
  members: string[];
  score: number;
}

interface GameQuestionSnapshotBase {
  sourceQuestionId: Types.ObjectId;
  categoryId: Types.ObjectId;
  categoryName: string;
  question: string;
  explanation?: string;
}

export interface StandardGameQuestionSnapshot extends GameQuestionSnapshotBase {
  questionType: 'standard';
  answer: string;
  acceptedAnswers: string[];

  rankedList?: never;
  turnDurationSeconds?: never;
  maxStrikesPerTeam?: never;
}

export interface RankedListGameQuestionSnapshot extends GameQuestionSnapshotBase {
  questionType: 'ranked_list';

  rankedList: {
    displayName: {
      ar: string;
      en?: string;
    };
    entries: Array<{
      id: string;
      rank: number;
      answer: {
        ar: string;
        en?: string;
      };
      aliases: string[];
      points: number;
    }>;
  };

  turnDurationSeconds?: number;
  maxStrikesPerTeam?: number;

  answer?: never;
  acceptedAnswers?: never;
}

export interface BombGameQuestionSnapshot extends GameQuestionSnapshotBase {
  questionType: 'bomb_sequence';
  bombContent: {
    items: Array<{
      id: string;
      order: number;
      image: {
        url: string;
        storageKey: string;
        mimetype: string;
        size: number;
      };
      acceptedAnswers: string[];
      altText?: string;
      note?: string;
    }>;
  };
  answer?: never;
  acceptedAnswers?: never;
  rankedList?: never;
}

export type GameQuestionSnapshot =
  | StandardGameQuestionSnapshot
  | RankedListGameQuestionSnapshot
  | BombGameQuestionSnapshot;

export interface QuestionInGame {
  _id?: Types.ObjectId;
  question: Types.ObjectId;
  snapshot?: GameQuestionSnapshot;
  points: 200 | 400 | 600;
  isAnswered: boolean;
  isAnswerRevealed: boolean;
  answeredByTeamIndex?: number;
  awardedPoints?: number;
  presentation?: {
    preferredType: 'text' | 'image' | 'audio' | 'video' | 'gif';
    type: 'text' | 'image' | 'audio' | 'video';
    mediaAvailable: boolean;
    mediaUrl?: string;
    mediaDuration?: number;
    fallbackReason?: string;
  };
}

export interface CategoryBoard {
  category: Types.ObjectId;
  questions: QuestionInGame[];
}

const QuestionPresentationSchema = new MongooseSchema(
  {
    preferredType: {
      type: String,
      enum: ['text', 'image', 'audio', 'video', 'gif'],
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'audio', 'video'],
      required: true,
    },
    mediaAvailable: {
      type: Boolean,
      required: true,
    },
    mediaUrl: {
      type: String,
      required: false,
    },
    mediaDuration: {
      type: Number,
      required: false,
    },
    fallbackReason: {
      type: String,
      required: false,
    },
  },
  {
    _id: false,
  },
);

const RankedListSnapshotEntrySchema = new MongooseSchema(
  {
    id: {
      type: String,
      required: true,
    },
    rank: {
      type: Number,
      required: true,
    },
    answer: {
      ar: {
        type: String,
        required: true,
      },
      en: {
        type: String,
        required: false,
      },
    },
    aliases: {
      type: [String],
      default: [],
    },
    points: {
      type: Number,
      required: true,
    },
  },
  {
    _id: false,
  },
);

const RankedListSnapshotSchema = new MongooseSchema(
  {
    displayName: {
      ar: {
        type: String,
        required: true,
      },
      en: {
        type: String,
        required: false,
      },
    },
    entries: {
      type: [RankedListSnapshotEntrySchema],
      required: true,
      validate: {
        validator: (entries: unknown[]) =>
          Array.isArray(entries) && entries.length > 0,
        message: 'A ranked-list snapshot must contain at least one entry.',
      },
    },
  },
  {
    _id: false,
  },
);

interface GameQuestionSnapshotSchemaContext {
  questionType?: 'standard' | 'ranked_list' | 'bomb_sequence';
}

const BombSnapshotItemSchema = new MongooseSchema(
  {
    id: { type: String, required: true },
    order: { type: Number, required: true },
    image: {
      url: { type: String, required: true },
      storageKey: { type: String, required: true },
      mimetype: { type: String, required: true },
      size: { type: Number, required: true },
    },
    acceptedAnswers: { type: [String], required: true },
    altText: { type: String, required: false },
    note: { type: String, required: false },
  },
  { _id: false },
);

const GameQuestionSnapshotSchema = new MongooseSchema(
  {
    sourceQuestionId: {
      type: Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    categoryId: {
      type: Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    categoryName: {
      type: String,
      required: true,
    },
    question: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      required: function (this: GameQuestionSnapshotSchemaContext): boolean {
        return this.questionType === 'standard';
      },
    },
    acceptedAnswers: {
      type: [String],
      required: false,
      default: undefined,
    },
    explanation: {
      type: String,
      required: false,
    },
    questionType: {
      type: String,
      enum: ['standard', 'ranked_list', 'bomb_sequence'],
      required: true,
    },
    turnDurationSeconds: {
      type: Number,
      required: false,
    },
    maxStrikesPerTeam: {
      type: Number,
      required: false,
    },
    rankedList: {
      type: RankedListSnapshotSchema,
      required: function (this: GameQuestionSnapshotSchemaContext): boolean {
        return this.questionType === 'ranked_list';
      },
    },
    bombContent: {
      type: new MongooseSchema(
        {
          items: {
            type: [BombSnapshotItemSchema],
            required: true,
          },
        },
        { _id: false },
      ),
      required: function (this: GameQuestionSnapshotSchemaContext): boolean {
        return this.questionType === 'bomb_sequence';
      },
    },
  },
  {
    _id: false,
  },
);

@Schema({
  timestamps: true,
  optimisticConcurrency: true,
})
export class Game extends Document {
  @Prop({
    required: true,
  })
  name: string;

  @Prop({
    type: String,
    enum: GameStatus,
    default: GameStatus.ACTIVE,
  })
  status: GameStatus;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  owner: Types.ObjectId;

  @Prop({
    type: Boolean,
    default: false,
  })
  isFreeGame: boolean;

  @Prop({
    type: String,
    enum: QuestionSelectionMode,
    required: true,
  })
  questionSelectionMode: QuestionSelectionMode;

  @Prop({
    type: [
      {
        name: {
          type: String,
          required: true,
        },
        members: {
          type: [String],
          default: [],
        },
        score: {
          type: Number,
          default: 0,
        },
      },
    ],
    required: true,
  })
  teams: TeamData[];

  @Prop({
    type: [
      {
        type: Types.ObjectId,
        ref: 'Category',
      },
    ],
    required: true,
  })
  selectedCategories: Types.ObjectId[];

  @Prop({
    type: [
      {
        category: {
          type: Types.ObjectId,
          ref: 'Category',
          required: true,
        },
        questions: [
          {
            question: {
              type: Types.ObjectId,
              ref: 'Question',
              required: true,
            },
            snapshot: {
              type: GameQuestionSnapshotSchema,
              required: false,
            },
            points: {
              type: Number,
              enum: [200, 400, 600],
              required: true,
            },
            isAnswered: {
              type: Boolean,
              default: false,
            },
            isAnswerRevealed: {
              type: Boolean,
              default: false,
            },
            answeredByTeamIndex: {
              type: Number,
              required: false,
            },
            awardedPoints: {
              type: Number,
              required: false,
            },
            presentation: {
              type: QuestionPresentationSchema,
              required: false,
            },
          },
        ],
      },
    ],
    required: true,
  })
  board: CategoryBoard[];

  @Prop({
    type: Number,
    default: 0,
  })
  currentTurnTeamIndex: number;

  @Prop({
    type: [RankedListRoundSchema],
    default: [],
  })
  rankedListRounds: RankedListRoundState[];

  @Prop({
    default: Date.now,
  })
  createdAt: Date;

  @Prop({
    default: Date.now,
  })
  updatedAt: Date;

  @Prop()
  finishedAt?: Date;
}

export const GameSchema = SchemaFactory.createForClass(Game);
