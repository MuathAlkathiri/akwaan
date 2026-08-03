import 'dotenv/config';
import mongoose, { ClientSession, Types } from 'mongoose';
import type { Db, IndexDescription } from 'mongodb';
import {
  WORLD_BOARD_SLOT_COUNT,
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  ContentItemStatus,
  ContentMediaType,
  SLOT_KEY_TYPES,
  WorldChallengeSlotKey,
  WorldChallengeSlotType,
  WorldContentStatus,
} from '../modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../modules/scoring/domain/scoring-rule';

/**
 * Migrates the previous content structures into the World Content model.
 *
 *   npm run migrate:world-content              # dry run (default)
 *   npm run migrate:world-content -- --apply   # write
 *
 * Sources handled, in order:
 *   1. legacy `catalogs` / `categories`         -> Worlds / Scopes
 *   2. previous `content_categories`            -> Scopes
 *   3. previous world-owned `challenge_types`   -> global ChallengeTypes
 *                                                  + WorldChallengeConfigurations
 *   4. classified legacy `questions`            -> ContentItems
 *
 * Nothing that cannot be derived safely is invented: unknown mechanics, ambiguous
 * free-text answers, Signature assignments, and Flex families are reported for
 * manual review and left out rather than guessed (roadmap 4, 6.5, 18).
 *
 * Every write is an upsert on a natural key, so repeated runs are idempotent.
 */

const CLI_APPLY = process.argv.includes('--apply');
const MONGO_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/lammah-quiz';
const QUESTION_BATCH_SIZE = 200;

/** Marks a Content Item as derived from a specific legacy question. */
const LEGACY_QUESTION_SOURCE_PREFIX = 'legacy-question:';

type LegacyMechanicDefinition = {
  slug: string;
  name: string;
  family: ChallengeFamily;
  answerMode: ChallengeAnswerMode;
  itemStructure: ChallengeItemStructure;
  scoringRuleId: string;
  slotKey: WorldChallengeSlotKey;
  timerSeconds: number | null;
  inputType: string;
};

/**
 * The only mechanic mapping the roadmap authorises.
 *
 * Traditional host-judged trivia is replaced by RYO wherever it appeared
 * (roadmap 6.1), with the RYO pacing budget from 3.4 — so `standard` maps
 * deterministically. Ranked-list and Bomb are candidate *Signature* mechanics and
 * no Signature has been assigned to any World yet (roadmap 4), so they are
 * reported for manual definition instead of being given a family.
 */
const LEGACY_MECHANIC_MAP: Record<string, LegacyMechanicDefinition | 'manual'> =
  {
    standard: {
      slug: 'read-your-opponent',
      name: 'اقرأ خصمك',
      family: ChallengeFamily.RYO,
      answerMode: ChallengeAnswerMode.RYO,
      itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
      scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      slotKey: WorldChallengeSlotKey.RYO_1,
      timerSeconds: 25,
      inputType: 'phone-multiple-choice',
    },
    'top-10': 'manual',
    bomb: 'manual',
  };

interface LegacyCatalog {
  _id: Types.ObjectId;
  name?: { ar?: string; en?: string } | string;
  slug?: string;
  banner?: { url?: string };
  isActive?: boolean;
  sortOrder?: number;
}

interface LegacyCategory {
  _id: Types.ObjectId;
  catalogId?: Types.ObjectId | null;
  name: string;
  slug: string;
  banner?: { url?: string };
  gameplayMode?: string;
  isActive?: boolean;
  sortOrder?: number;
}

interface PreviousWorld {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  status?: string;
  sortOrder?: number;
  banner?: unknown;
  icon?: unknown;
  signatureMechanicId?: Types.ObjectId | null;
}

interface PreviousContentCategory {
  _id: Types.ObjectId;
  worldId: Types.ObjectId;
  name: string;
  slug: string;
  image?: unknown;
  status?: string;
  sortOrder?: number;
}

interface PreviousChallengeType {
  _id: Types.ObjectId;
  worldId?: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  icon?: unknown;
  status?: string;
  sortOrder?: number;
}

interface LegacyQuestion {
  _id: Types.ObjectId;
  worldId?: Types.ObjectId;
  contentCategoryId?: Types.ObjectId;
  challengeTypeId?: Types.ObjectId;
  question?: string;
  text?: { ar?: string; en?: string };
  answer?: string;
  correctAnswer?: string;
  wrongAnswers?: string[];
  acceptedAnswers?: string[];
  questionType?: string;
  type?: string;
  mediaUrl?: string;
  primaryAsset?: { type?: string; url?: string };
  status?: string;
  explanation?: string;
}

interface ManualReviewEntry {
  kind: string;
  id: string;
  label: string;
  reason: string;
}

export class MigrationReport {
  constructor(private readonly apply: boolean) {}

  worldsMigrated = 0;
  scopesMigrated = 0;
  globalChallengeTypesCreated = 0;
  challengeTypesDeduplicated = 0;
  worldChallengeConfigurationsCreated = 0;
  legacyWorldOwnedChallengeTypesRemoved = 0;
  contentItemsMigrated = 0;
  contentItemsSkipped = 0;
  openAnswerItemsRequiringConversion = 0;
  worldsDemotedToDraft: string[] = [];
  worldsMissingSignatureMechanic: string[] = [];
  worldsWithInvalidBoardComposition: string[] = [];
  scopeExclusionsCausingReadinessFailure: string[] = [];
  invalidReferences: string[] = [];
  manualReview: ManualReviewEntry[] = [];
  errors: string[] = [];

  needsReview(entry: ManualReviewEntry): void {
    this.manualReview.push(entry);
  }

  print(): void {
    const lines = [
      '',
      `=== World Content migration — ${this.apply ? 'APPLIED' : 'DRY RUN'} ===`,
      `Worlds migrated:                          ${this.worldsMigrated}`,
      `Scopes migrated:                          ${this.scopesMigrated}`,
      `Global challenge types created:           ${this.globalChallengeTypesCreated}`,
      `Challenge types deduplicated:             ${this.challengeTypesDeduplicated}`,
      `World challenge configurations created:   ${this.worldChallengeConfigurationsCreated}`,
      `Legacy world-owned challenge types removed: ${this.legacyWorldOwnedChallengeTypesRemoved}`,
      `Content items migrated:                   ${this.contentItemsMigrated}`,
      `Content items skipped:                    ${this.contentItemsSkipped}`,
      `Worlds demoted to draft:                  ${this.worldsDemotedToDraft.length}`,
      `Open-answer items requiring conversion:   ${this.openAnswerItemsRequiringConversion}`,
      `Worlds missing a Signature mechanic:      ${this.worldsMissingSignatureMechanic.length}`,
      `Worlds with invalid board composition:    ${this.worldsWithInvalidBoardComposition.length}`,
      `Scope exclusions causing readiness fail:  ${this.scopeExclusionsCausingReadinessFailure.length}`,
      `Invalid references:                       ${this.invalidReferences.length}`,
      `Errors:                                   ${this.errors.length}`,
    ];
    console.log(lines.join('\n'));

    this.printList('Worlds demoted to draft', this.worldsDemotedToDraft);
    this.printList(
      'Worlds missing a Signature mechanic',
      this.worldsMissingSignatureMechanic,
    );
    this.printList(
      'Worlds with invalid board composition',
      this.worldsWithInvalidBoardComposition,
    );
    this.printList(
      'Scope exclusions causing readiness failure',
      this.scopeExclusionsCausingReadinessFailure,
    );
    this.printList('Invalid references', this.invalidReferences);
    this.printList('Errors', this.errors);

    if (this.manualReview.length) {
      console.log(`\n--- Manual review (${this.manualReview.length}) ---`);
      const grouped = new Map<string, ManualReviewEntry[]>();
      for (const entry of this.manualReview) {
        const bucket = grouped.get(entry.kind) ?? [];
        bucket.push(entry);
        grouped.set(entry.kind, bucket);
      }
      for (const [kind, entries] of grouped) {
        console.log(`\n[${kind}] ${entries.length}`);
        for (const entry of entries.slice(0, 25)) {
          console.log(`  - ${entry.label}: ${entry.reason}`);
        }
        if (entries.length > 25) {
          console.log(`  ... and ${entries.length - 25} more`);
        }
      }
    }

    if (!this.apply) {
      console.log(
        '\nDry run only — no documents were written. Re-run with --apply to migrate.',
      );
    }
  }

  private printList(title: string, values: string[]): void {
    if (!values.length) return;
    console.log(`\n--- ${title} (${values.length}) ---`);
    for (const value of values.slice(0, 25)) console.log(`  - ${value}`);
    if (values.length > 25) console.log(`  ... and ${values.length - 25} more`);
  }
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function localizedName(value: LegacyCatalog['name'], fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') {
    return value.ar?.trim() || value.en?.trim() || fallback;
  }
  return fallback;
}

/** Legacy active/inactive flags map onto the draft/active/archived lifecycle. */
function toStatus(value: boolean | string | undefined): WorldContentStatus {
  if (value === true || value === 'active') return WorldContentStatus.ACTIVE;
  if (value === 'archived') return WorldContentStatus.ARCHIVED;
  return WorldContentStatus.DRAFT;
}

function mediaTypeFor(question: LegacyQuestion): ContentMediaType {
  const raw = (
    question.primaryAsset?.type ??
    question.type ??
    ''
  ).toLowerCase();
  if (raw === 'image' || raw === 'gif') return ContentMediaType.IMAGE;
  if (raw === 'audio') return ContentMediaType.AUDIO;
  if (raw === 'video') return ContentMediaType.VIDEO;
  return ContentMediaType.NONE;
}

export class WorldContentMigration {
  private readonly report: MigrationReport;
  /** Legacy world-owned challenge type id -> migrated global challenge type id. */
  private readonly migratedChallengeTypeIds = new Map<string, Types.ObjectId>();

  constructor(
    private readonly db: Db,
    private readonly apply: boolean,
    private readonly session?: ClientSession,
  ) {
    this.report = new MigrationReport(apply);
  }

  async run(): Promise<MigrationReport> {
    await this.dropLegacyChallengeTypeIndex();
    await this.repairConfigurationIndexes();
    const canonicalRyoId = await this.repairCanonicalRyo();
    const worldIdByCatalog = await this.migrateCatalogsToWorlds();
    await this.migrateCategoriesToScopes(worldIdByCatalog);
    await this.migratePreviousContentCategories();
    await this.migrateChallengeTypes();
    if (canonicalRyoId) await this.repairRyoBoardSlots(canonicalRyoId);
    // Runs after the boards exist, so completeness is judged on the migrated
    // configurations rather than on an empty board.
    await this.normalizePreviousWorlds();
    await this.migrateQuestions();
    await this.auditWorlds();
    return this.report;
  }

  private async repairConfigurationIndexes(): Promise<void> {
    if (!this.apply) return;
    const collection = this.db.collection('world_challenge_configurations');
    try {
      const indexes = await collection.indexes();
      for (const index of indexes) {
        if (
          index.name &&
          index.key?.worldId === 1 &&
          index.key?.challengeTypeId === 1
        ) {
          await collection.dropIndex(index.name);
        }
      }
      await collection.createIndex(
        { worldId: 1, slotKey: 1 },
        { unique: true, name: 'worldId_1_slotKey_1' },
      );
    } catch (error) {
      if (!/ns does not exist/i.test(String(error))) {
        this.report.errors.push(`repairConfigurationIndexes: ${String(error)}`);
      }
    }
  }

  private async repairCanonicalRyo(): Promise<Types.ObjectId | undefined> {
    const collection = this.db.collection('challenge_types');
    const candidates = await collection
      .find({
        worldId: { $exists: false },
        $or: [{ slug: 'read-your-opponent' }, { family: ChallengeFamily.RYO }],
      })
      .toArray();
    if (candidates.length > 1) {
      for (const candidate of candidates) {
        this.report.needsReview({
          kind: 'ambiguous canonical RYO',
          id: String(candidate._id),
          label: String(candidate.name ?? candidate.slug ?? candidate._id),
          reason:
            'multiple global RYO candidates exist; the repair will not guess which record is canonical',
        });
      }
      return undefined;
    }
    const definition = LEGACY_MECHANIC_MAP.standard;
    if (definition === 'manual') return undefined;
    const existing = candidates[0];
    if (!existing) return this.upsertGlobalChallengeType(definition);
    if (this.apply) {
      await collection.updateOne(
        { _id: existing._id },
        {
          $set: {
            name: definition.name,
            slug: definition.slug,
            family: definition.family,
            isExclusive: false,
            itemStructure: definition.itemStructure,
            answerMode: definition.answerMode,
            scoringRuleId: definition.scoringRuleId,
            defaultPresentation: {
              inputType: definition.inputType,
              timerSeconds: definition.timerSeconds,
              soundPack: null,
              revealStyle: null,
            },
            updatedAt: new Date(),
          },
          $unset: { worldId: '', displayNameByWorld: '', mediaType: '' },
        },
        { session: this.session },
      );
    }
    return existing._id as Types.ObjectId;
  }

  private async repairRyoBoardSlots(
    canonicalRyoId: Types.ObjectId,
  ): Promise<void> {
    const collection = this.db.collection('world_challenge_configurations');
    const assignments = await collection
      .find({ challengeTypeId: canonicalRyoId })
      .toArray();
    const byWorld = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const bucket = byWorld.get(String(assignment.worldId)) ?? [];
      bucket.push(assignment);
      byWorld.set(String(assignment.worldId), bucket);
    }
    for (const [worldId, entries] of byWorld) {
      const occupied = new Set(entries.map((entry) => String(entry.slotKey)));
      const missing = [
        WorldChallengeSlotKey.RYO_1,
        WorldChallengeSlotKey.RYO_2,
      ].filter((slotKey) => !occupied.has(slotKey));
      const unkeyed = entries.filter((entry) => !entry.slotKey);
      if (unkeyed.length > missing.length) {
        this.report.needsReview({
          kind: 'ambiguous RYO board assignment',
          id: worldId,
          label: worldId,
          reason:
            'more unkeyed RYO assignments exist than available RYO board positions',
        });
        continue;
      }
      for (let index = 0; index < unkeyed.length; index += 1) {
        if (this.apply)
          await collection.updateOne(
            { _id: unkeyed[index]._id },
            {
              $set: {
                slotKey: missing[index],
                slotType: WorldChallengeSlotType.RYO,
              },
              $unset: { displayName: '' },
            },
            { session: this.session },
          );
        occupied.add(missing[index]);
      }
      for (const slotKey of [
        WorldChallengeSlotKey.RYO_1,
        WorldChallengeSlotKey.RYO_2,
      ]) {
        if (occupied.has(slotKey)) continue;
        this.report.worldChallengeConfigurationsCreated += 1;
        if (this.apply)
          await collection.insertOne(
            {
              worldId: new Types.ObjectId(worldId),
              challengeTypeId: canonicalRyoId,
              slotKey,
              slotType: WorldChallengeSlotType.RYO,
              sortOrder: slotKey === WorldChallengeSlotKey.RYO_1 ? 1 : 2,
              isEnabled: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            { session: this.session },
          );
      }
      if (this.apply)
        await collection.updateMany(
          {
            worldId: new Types.ObjectId(worldId),
            challengeTypeId: canonicalRyoId,
          },
          { $unset: { displayName: '', presentation: '', mediaType: '' } },
          { session: this.session },
        );
    }
  }

  /**
   * The previous schema made challenge types world-owned with a
   * {worldId, slug} unique index. Global mechanics need a unique slug, so the
   * stale compound index is removed before any global record is written.
   */
  private async dropLegacyChallengeTypeIndex(): Promise<void> {
    if (!this.apply) return;
    try {
      const indexes = await this.db.collection('challenge_types').indexes();
      const stale = indexes.find(
        (index: IndexDescription & { name?: string }) =>
          index.name === 'worldId_1_slug_1',
      );
      if (stale?.name) {
        await this.db.collection('challenge_types').dropIndex(stale.name);
        console.log('Dropped stale challenge_types index worldId_1_slug_1');
      }
    } catch (error) {
      // A missing collection is expected on a fresh database.
      if (!/ns does not exist|IndexNotFound/i.test(String(error))) {
        this.report.errors.push(
          `dropLegacyChallengeTypeIndex: ${String(error)}`,
        );
      }
    }
  }

  private async migrateCatalogsToWorlds(): Promise<
    Map<string, Types.ObjectId>
  > {
    const catalogs = await this.db
      .collection<LegacyCatalog>('catalogs')
      .find({})
      .toArray();
    const worldIdByCatalog = new Map<string, Types.ObjectId>();
    for (const catalog of catalogs) {
      const name = localizedName(catalog.name, catalog.slug ?? 'عالم');
      const slug = slugify(
        catalog.slug ?? name,
        `world-${String(catalog._id).slice(-6)}`,
      );
      const worldId = await this.upsertWorld({
        slug,
        name,
        sortOrder: catalog.sortOrder ?? 0,
        banner: catalog.banner?.url ? { url: catalog.banner.url } : undefined,
      });
      if (worldId) worldIdByCatalog.set(String(catalog._id), worldId);
    }
    return worldIdByCatalog;
  }

  /** Brings already-migrated Worlds onto the new status vocabulary. */
  /**
   * Brings existing Worlds onto the new status vocabulary.
   *
   * A World that was active before the board model existed cannot satisfy the
   * activation rules, and leaving it active would block the very board edits
   * needed to make it valid. Those Worlds are demoted to draft and reported, so
   * activation stays an explicit decision (roadmap 5, 18).
   */
  private async normalizePreviousWorlds(): Promise<void> {
    const worlds = await this.db
      .collection<PreviousWorld>('worlds')
      .find({ status: { $ne: WorldContentStatus.DRAFT } })
      .toArray();
    for (const world of worlds) {
      if (world.status === WorldContentStatus.ARCHIVED) continue;
      const enabled = await this.db
        .collection('world_challenge_configurations')
        .countDocuments({ worldId: world._id, isEnabled: true });
      if (
        world.status === WorldContentStatus.ACTIVE &&
        enabled === WORLD_BOARD_SLOT_COUNT
      ) {
        continue;
      }
      this.report.worldsDemotedToDraft.push(
        `${world.name} (${enabled} enabled challenge configuration(s) of ${WORLD_BOARD_SLOT_COUNT})`,
      );
      if (!this.apply) continue;
      await this.db
        .collection('worlds')
        .updateOne(
          { _id: world._id },
          { $set: { status: WorldContentStatus.DRAFT } },
          { session: this.session },
        );
    }
  }

  private async migrateCategoriesToScopes(
    worldIdByCatalog: Map<string, Types.ObjectId>,
  ): Promise<void> {
    const categories = await this.db
      .collection<LegacyCategory>('categories')
      .find({})
      .toArray();
    for (const category of categories) {
      const worldId = category.catalogId
        ? worldIdByCatalog.get(String(category.catalogId))
        : undefined;
      if (!worldId) {
        this.report.invalidReferences.push(
          `category "${category.name}" has no catalog, so it cannot be placed in a World`,
        );
        continue;
      }
      await this.upsertScope({
        worldId,
        name: category.name,
        slug: slugify(
          category.slug ?? category.name,
          `scope-${String(category._id).slice(-6)}`,
        ),
        status: toStatus(category.isActive),
        sortOrder: category.sortOrder ?? 0,
        image: category.banner?.url ? { url: category.banner.url } : undefined,
      });
      const mechanicSlug = slugify(
        category.gameplayMode ?? 'STANDARD',
        'standard',
      );
      const definition = LEGACY_MECHANIC_MAP[mechanicSlug];
      if (definition === 'manual' || definition === undefined) {
        this.report.needsReview({
          kind: 'mechanic definition required',
          id: mechanicSlug,
          label: `legacy gameplay mode "${category.gameplayMode ?? 'STANDARD'}"`,
          reason:
            'candidate Signature mechanic — family, answer mode, and scoring rule must be assigned by hand (roadmap 4)',
        });
      }
    }
  }

  /**
   * The previous taxonomy work stored Scopes in `content_categories`. Documents
   * are copied into `scopes` under their original _id so classified legacy
   * questions keep resolving while they wait to become Content Items.
   */
  private async migratePreviousContentCategories(): Promise<void> {
    const collections = await this.db
      .listCollections({ name: 'content_categories' })
      .toArray();
    if (!collections.length) return;
    const documents = await this.db
      .collection<PreviousContentCategory>('content_categories')
      .find({})
      .toArray();
    for (const document of documents) {
      const world = await this.db
        .collection<PreviousWorld>('worlds')
        .findOne({ _id: document.worldId });
      if (!world) {
        this.report.invalidReferences.push(
          `content category "${document.name}" points at a missing World`,
        );
        continue;
      }
      const existing = await this.db
        .collection('scopes')
        .findOne({ _id: document._id });
      if (existing) continue;
      this.report.scopesMigrated += 1;
      if (!this.apply) continue;
      await this.db.collection('scopes').insertOne(
        {
          _id: document._id,
          worldId: document.worldId,
          name: document.name,
          slug: document.slug,
          image: document.image,
          excludedChallengeTypeIds: [],
          status: toStatus(document.status),
          sortOrder: document.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { session: this.session },
      );
    }
    console.log(
      `Legacy collection "content_categories" was copied into "scopes". It is no longer read; drop it once the migration has been verified.`,
    );
  }

  /**
   * Deduplicates the previous per-World challenge types into global mechanics and
   * turns each old World relationship into a WorldChallengeConfiguration.
   */
  private async migrateChallengeTypes(): Promise<void> {
    const worldOwned = await this.db
      .collection<PreviousChallengeType>('challenge_types')
      .find({ worldId: { $exists: true } })
      .toArray();
    if (!worldOwned.length) return;

    const bySlug = new Map<string, PreviousChallengeType[]>();
    for (const challengeType of worldOwned) {
      const slug = slugify(
        challengeType.slug ?? challengeType.name,
        'mechanic',
      );
      const bucket = bySlug.get(slug) ?? [];
      bucket.push(challengeType);
      bySlug.set(slug, bucket);
    }

    for (const [legacySlug, group] of bySlug) {
      const definition = LEGACY_MECHANIC_MAP[legacySlug];
      if (!definition || definition === 'manual') {
        for (const challengeType of group) {
          this.report.needsReview({
            kind: 'mechanic definition required',
            id: String(challengeType._id),
            label: `${challengeType.name} (${legacySlug})`,
            reason:
              'no roadmap-authorised family/answer-mode mapping exists; define this mechanic manually before its World can be activated',
          });
        }
        continue;
      }
      if (group.length > 1) {
        this.report.challengeTypesDeduplicated += group.length - 1;
      }
      const challengeTypeId = await this.upsertGlobalChallengeType(definition);
      if (!challengeTypeId) continue;
      for (const legacy of group) {
        if (!legacy.worldId) continue;
        this.migratedChallengeTypeIds.set(String(legacy._id), challengeTypeId);
        // Board positions are assigned in order; a mechanic keeps one global
        // name, so the legacy per-World label is not carried across.
        await this.upsertConfiguration({
          worldId: legacy.worldId,
          challengeTypeId,
          definition,
          slotKey: definition.slotKey,
          description: legacy.description,
          icon: legacy.icon,
          sortOrder: legacy.sortOrder ?? 0,
        });
      }
      if (this.apply) {
        const result = await this.db.collection('challenge_types').deleteMany(
          {
            _id: { $in: group.map((legacy) => legacy._id) },
            worldId: { $exists: true },
          },
          { session: this.session },
        );
        this.report.legacyWorldOwnedChallengeTypesRemoved +=
          result.deletedCount ?? 0;
      } else {
        this.report.legacyWorldOwnedChallengeTypesRemoved += group.length;
      }
    }
  }

  private async migrateQuestions(): Promise<void> {
    // `$type: 'objectId'` keeps the filter typed while still excluding the
    // legacy documents that carry an explicit null classification.
    const filter = {
      worldId: { $type: 'objectId' },
      contentCategoryId: { $type: 'objectId' },
      challengeTypeId: { $type: 'objectId' },
    } as const;
    const total = await this.db.collection('questions').countDocuments(filter);
    if (!total) return;

    for (let skip = 0; skip < total; skip += QUESTION_BATCH_SIZE) {
      const batch = await this.db
        .collection<LegacyQuestion>('questions')
        .find(filter)
        .sort({ _id: 1 })
        .skip(skip)
        .limit(QUESTION_BATCH_SIZE)
        .toArray();
      for (const question of batch) {
        await this.migrateQuestion(question);
      }
    }
  }

  private async migrateQuestion(question: LegacyQuestion): Promise<void> {
    const source = `${LEGACY_QUESTION_SOURCE_PREFIX}${String(question._id)}`;
    const alreadyMigrated = await this.db
      .collection('content_items')
      .findOne({ 'metadata.source': source });
    if (alreadyMigrated) return;

    const scope = await this.db
      .collection('scopes')
      .findOne({ _id: question.contentCategoryId });
    if (!scope) {
      this.report.contentItemsSkipped += 1;
      this.report.invalidReferences.push(
        `question ${String(question._id)} points at a Scope that does not exist`,
      );
      return;
    }

    // The legacy challenge type document is gone once deduplicated, so the
    // migrated mechanic is resolved by the slug mapping instead of by id.
    const challengeTypeId = await this.resolveMigratedChallengeType(question);
    if (!challengeTypeId) {
      this.report.contentItemsSkipped += 1;
      this.report.needsReview({
        kind: 'content awaiting mechanic',
        id: String(question._id),
        label: (question.question ?? '').slice(0, 60),
        reason:
          'its mechanic has no World Content definition yet, so the item cannot declare a compatible challenge type',
      });
      return;
    }

    const prompt = question.text?.ar?.trim() || question.question?.trim();
    if (!prompt) {
      this.report.contentItemsSkipped += 1;
      this.report.invalidReferences.push(
        `question ${String(question._id)} has no prompt text`,
      );
      return;
    }

    const correct = (question.correctAnswer ?? question.answer ?? '').trim();
    const wrongAnswers = (question.wrongAnswers ?? []).filter((value) =>
      Boolean(value?.trim()),
    );
    if ((question.questionType ?? 'standard') !== 'standard') {
      this.report.contentItemsSkipped += 1;
      this.report.needsReview({
        kind: 'mechanic-specific content',
        id: String(question._id),
        label: (question.question ?? '').slice(0, 60),
        reason: `"${question.questionType}" content belongs to a mechanic that is not defined yet`,
      });
      return;
    }
    if (!correct || !wrongAnswers.length) {
      // Roadmap 6.5: open answers must become multiple choice, but only a human
      // can write the distractors. Flagged, never fabricated.
      this.report.contentItemsSkipped += 1;
      this.report.openAnswerItemsRequiringConversion += 1;
      this.report.needsReview({
        kind: 'open answer requiring multiple-choice conversion',
        id: String(question._id),
        label: (question.question ?? '').slice(0, 60),
        reason:
          'no distractors exist, so a deterministic multiple-choice conversion is impossible',
      });
      return;
    }

    const options = [correct, ...wrongAnswers].map((label, index) => ({
      id: index === 0 ? 'correct' : `distractor-${index}`,
      label: { ar: label },
    }));
    const mediaType = mediaTypeFor(question);
    const mediaUrl = question.primaryAsset?.url ?? question.mediaUrl;

    this.report.contentItemsMigrated += 1;
    if (!this.apply) return;
    await this.db.collection('content_items').insertOne(
      {
        scopeId: question.contentCategoryId,
        worldId: question.worldId,
        prompt: {
          ar: prompt,
          ...(question.text?.en ? { en: question.text.en } : {}),
        },
        compatibleChallengeTypeIds: [challengeTypeId],
        ...(mediaType !== ContentMediaType.NONE && mediaUrl
          ? { media: { type: mediaType, assets: [{ url: mediaUrl }] } }
          : {}),
        answerPayload: {
          mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
          options,
          correctOptionId: 'correct',
        },
        isReusableAcrossSessions: false,
        // Migrated content always lands in draft: readiness is an editorial
        // decision, not something a migration should assert (roadmap 18).
        status: ContentItemStatus.DRAFT,
        metadata: {
          source,
          ...(question.explanation ? { notes: question.explanation } : {}),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { session: this.session },
    );
  }

  /**
   * Resolves the question's original mechanic to the global one it was
   * deduplicated into. Anything outside that map is ambiguous and is reported
   * rather than guessed.
   */
  private async resolveMigratedChallengeType(
    question: LegacyQuestion,
  ): Promise<Types.ObjectId | undefined> {
    const migrated = this.migratedChallengeTypeIds.get(
      String(question.challengeTypeId),
    );
    if (migrated) return migrated;
    const alreadyGlobal = await this.db
      .collection('challenge_types')
      .findOne({ _id: question.challengeTypeId, worldId: { $exists: false } });
    return alreadyGlobal ? (alreadyGlobal._id as Types.ObjectId) : undefined;
  }

  /** Flags the state every World still needs a human decision for. */
  private async auditWorlds(): Promise<void> {
    const worlds = await this.db
      .collection<PreviousWorld>('worlds')
      .find({})
      .toArray();
    for (const world of worlds) {
      const configurations = await this.db
        .collection('world_challenge_configurations')
        .find({ worldId: world._id })
        .toArray();
      const enabled = configurations.filter(
        (entry: Record<string, unknown>) => entry.isEnabled,
      );
      if (!world.signatureMechanicId) {
        this.report.worldsMissingSignatureMechanic.push(
          `${world.name} (${world.slug})`,
        );
      }
      if (enabled.length !== 4) {
        this.report.worldsWithInvalidBoardComposition.push(
          `${world.name}: ${enabled.length} enabled challenge configuration(s) of 4`,
        );
      }
      const scopes = await this.db
        .collection('scopes')
        .find({ worldId: world._id })
        .toArray();
      for (const scope of scopes) {
        const excluded = (scope.excludedChallengeTypeIds ?? []) as unknown[];
        if (!excluded.length) continue;
        const usable = enabled.filter(
          (entry: Record<string, unknown>) =>
            !excluded.some(
              (value) => String(value) === String(entry.challengeTypeId),
            ),
        );
        if (usable.length < 4) {
          this.report.scopeExclusionsCausingReadinessFailure.push(
            `${world.name} / ${String(scope.name)}: ${usable.length} usable challenge(s) of 4`,
          );
        }
      }
    }
  }

  private async upsertWorld(input: {
    slug: string;
    name: string;
    sortOrder: number;
    banner?: { url: string };
  }): Promise<Types.ObjectId | undefined> {
    const existing = await this.db
      .collection('worlds')
      .findOne({ slug: input.slug });
    if (existing) return existing._id as Types.ObjectId;
    this.report.worldsMigrated += 1;
    if (!this.apply) return undefined;
    const result = await this.db.collection('worlds').insertOne(
      {
        name: input.name,
        slug: input.slug,
        ...(input.banner ? { banner: input.banner } : {}),
        signatureMechanicId: null,
        soundPack: null,
        timerProfile: null,
        toneProfile: null,
        // Activation requires a complete four-slot board and a Signature
        // mechanic, neither of which a legacy catalog can supply (roadmap 5, 18).
        status: WorldContentStatus.DRAFT,
        sortOrder: input.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { session: this.session },
    );
    return result.insertedId as Types.ObjectId;
  }

  private async upsertScope(input: {
    worldId: Types.ObjectId;
    name: string;
    slug: string;
    status: WorldContentStatus;
    sortOrder: number;
    image?: { url: string };
  }): Promise<void> {
    const existing = await this.db
      .collection('scopes')
      .findOne({ worldId: input.worldId, slug: input.slug });
    if (existing) return;
    this.report.scopesMigrated += 1;
    if (!this.apply) return;
    await this.db.collection('scopes').insertOne(
      {
        worldId: input.worldId,
        name: input.name,
        slug: input.slug,
        ...(input.image ? { image: input.image } : {}),
        excludedChallengeTypeIds: [],
        status: input.status,
        sortOrder: input.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { session: this.session },
    );
  }

  private async upsertGlobalChallengeType(
    definition: LegacyMechanicDefinition,
  ): Promise<Types.ObjectId | undefined> {
    const existing = await this.db
      .collection('challenge_types')
      .findOne({ slug: definition.slug, worldId: { $exists: false } });
    if (existing) return existing._id as Types.ObjectId;
    this.report.globalChallengeTypesCreated += 1;
    if (!this.apply) return undefined;
    const result = await this.db.collection('challenge_types').insertOne(
      {
        name: definition.name,
        slug: definition.slug,
        family: definition.family,
        isExclusive: definition.family === ChallengeFamily.SIGNATURE,
        itemStructure: definition.itemStructure,
        answerMode: definition.answerMode,
        defaultPresentation: {
          inputType: definition.inputType,
          timerSeconds: definition.timerSeconds,
          soundPack: null,
          revealStyle: null,
        },
        scoringRuleId: definition.scoringRuleId,
        status: WorldContentStatus.DRAFT,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { session: this.session },
    );
    return result.insertedId as Types.ObjectId;
  }

  private async upsertConfiguration(input: {
    worldId: Types.ObjectId;
    challengeTypeId: Types.ObjectId;
    definition: LegacyMechanicDefinition;
    slotKey: WorldChallengeSlotKey;
    description?: string;
    icon?: unknown;
    sortOrder: number;
  }): Promise<void> {
    const existing = await this.db
      .collection('world_challenge_configurations')
      .findOne({ worldId: input.worldId, slotKey: input.slotKey });
    if (existing) return;
    this.report.worldChallengeConfigurationsCreated += 1;
    if (!this.apply) return;
    await this.db.collection('world_challenge_configurations').insertOne(
      {
        worldId: input.worldId,
        challengeTypeId: input.challengeTypeId,
        slotKey: input.slotKey,
        slotType: SLOT_KEY_TYPES[input.slotKey],
        ...(input.description ? { description: input.description } : {}),
        ...(input.icon ? { icon: input.icon } : {}),
        sortOrder: input.sortOrder,
        // Nothing is enabled automatically: a board slot is a deliberate
        // editorial decision (roadmap 10, 18).
        isEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { session: this.session },
    );
  }
}

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  let report: MigrationReport | undefined;
  let session: ClientSession | undefined;
  try {
    // Transactions need a replica set; a standalone development server falls
    // back to a non-transactional run rather than failing outright.
    session = await mongoose.connection.startSession();
    await session.withTransaction(async () => {
      report = await new WorldContentMigration(db, CLI_APPLY, session).run();
    });
  } catch (error) {
    if (session) {
      await session.endSession();
      session = undefined;
    }
    if (!/Transaction|replica set|not supported/i.test(String(error))) {
      throw error;
    }
    console.warn(
      'This MongoDB deployment does not support transactions; running without one.',
    );
    report = await new WorldContentMigration(db, CLI_APPLY).run();
  } finally {
    await session?.endSession();
  }

  report?.print();
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  });
}
