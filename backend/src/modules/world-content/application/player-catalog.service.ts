import { Injectable, NotFoundException } from '@nestjs/common';
import { BoardSlot } from '../domain/board-definition.policy';
import { WorldContentStatus } from '../domain/world-content.constants';
import { ContentAssetRef } from '../domain/world-content.types';
import { WorldRepository } from '../persistence/world.repository';
import { ScopeService, ScopeSummary } from './scope.service';
import { WorldService, WorldSummary } from './world.service';

/**
 * What a player is allowed to know about a World.
 *
 * Deliberately narrower than `WorldSummary`: no readiness report, no content
 * item counts, no sound/timer/tone profiles. Those are authoring and runtime
 * concerns, and a player screen has no use for them.
 */
/**
 * Whether a player may select this World, or is only being told it is coming.
 *
 * `available` means the Match's own selection gate will accept it — not merely
 * that somebody flipped the World to active. Those are different facts, and
 * treating the second as the first is what put عالم الالغاز in the selectable
 * grid while `MatchWorldSelectionPolicy` was rejecting it for an incomplete
 * board: the catalogue advertised a World the server would refuse.
 *
 * One answer, carried by the catalogue, so no screen keeps its own list of which
 * Worlds are open. A World that becomes selectable moves from `upcoming` to
 * `available` on the next response, with no client release.
 */
export type PlayableWorldAvailability = 'available' | 'upcoming';

export interface PlayableWorld {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: ContentAssetRef;
  banner?: ContentAssetRef;
  sortOrder: number;
  scopeCount: number;
  challengeConfigurationCount: number;
  availability: PlayableWorldAvailability;
}

/**
 * A board position as a player sees it: what it is called and where it sits.
 * Configuration ids, challenge type ids, scoring rules, answer modes and item
 * structures stay server-side. Guests receive only presentation metadata.
 */
export interface PlayableBoardSlot {
  slotKey: BoardSlot['slotKey'];
  challengeTypeSlug: string;
  family: BoardSlot['family'];
  displayName: string;
  description?: string;
  instructions?: string;
  sortOrder: number;
}

export interface PlayableScope {
  id: string;
  worldId: string;
  name: string;
  slug: string;
  description?: string;
  image?: ContentAssetRef;
  sortOrder: number;
  readyContentItemCount: number;
  /** Playability signal: a Scope with no usable slot cannot open a board. */
  usableSlots: PlayableBoardSlot[];
}

/**
 * The player read surface for World Content.
 *
 * The player journey used to call the admin endpoints, so every non-admin
 * session got a 403 that the UI rendered as "nothing is ready". This service
 * exists so players have their own surface, and it *projects* the admin
 * services rather than recomputing anything: readiness is still evaluated in
 * exactly one place.
 */
@Injectable()
export class PlayerCatalogService {
  constructor(
    private readonly worlds: WorldService,
    private readonly scopes: ScopeService,
    private readonly worldRecords: WorldRepository,
  ) {}

  /**
   * Every World a player may be shown: the ones they can select, and the ones
   * announced as coming.
   *
   * Worlds the selection gate would refuse are listed but not openable —
   * `availability` says which is which, and `getPlayableWorld` and
   * `listPlayableScopes` below still refuse anything that is not active. That
   * asymmetry is the point: a player may learn that عالم الأفلام is on the way
   * without being able to walk into it. Archived Worlds are not announcements
   * and are not listed at all.
   */
  async listPlayableWorlds(): Promise<PlayableWorld[]> {
    const summaries = await this.worlds.list();
    return summaries
      .filter((world) => world.status !== WorldContentStatus.ARCHIVED)
      .map((world) => toPlayableWorld(world));
  }

  async getPlayableWorld(worldId: string): Promise<PlayableWorld> {
    const world = await this.worlds.findOne(worldId);
    if (world.status !== WorldContentStatus.ACTIVE) {
      throw new NotFoundException('World not found');
    }
    return toPlayableWorld(world);
  }

  /**
   * Scopes of one active World. An inactive World is indistinguishable from a
   * missing one here: a player must not be able to probe drafts by id.
   */
  async listPlayableScopes(worldId: string): Promise<PlayableScope[]> {
    await this.requireActiveWorld(worldId);
    const summaries = await this.scopes.listByWorld(worldId);
    return summaries
      .filter((scope) => scope.status === WorldContentStatus.ACTIVE)
      .map((scope) => toPlayableScope(scope));
  }

  private async requireActiveWorld(worldId: string): Promise<void> {
    const world = await this.worldRecords.findById(worldId);
    if (!world || world.status !== WorldContentStatus.ACTIVE) {
      throw new NotFoundException('World not found');
    }
  }
}

/**
 * The Match's own selection gate, read rather than re-derived.
 *
 * `MatchWorldSelectionPolicy` refuses a World on exactly two per-World facts:
 * it must be active (`MATCH_WORLD_NOT_ACTIVE`) and its board must be complete
 * (`MATCH_WORLD_BOARD_NOT_READY`). Both are already decided — `boardReady`
 * comes off the readiness report `WorldService` computed for this very summary
 * — so this reads the answer instead of computing a second one. Relational
 * composition is deliberately not consulted: the policy raises it as a
 * production warning, never as a structural blocker, so it does not decide
 * whether one World may be chosen.
 */
function isSelectableForMatch(world: WorldSummary): boolean {
  return (
    world.status === WorldContentStatus.ACTIVE && world.readiness.boardReady
  );
}

function toPlayableWorld(world: WorldSummary): PlayableWorld {
  return {
    availability: isSelectableForMatch(world) ? 'available' : 'upcoming',
    id: world.id,
    name: world.name,
    slug: world.slug,
    ...(world.description ? { description: world.description } : {}),
    ...(world.icon ? { icon: toPlayerAsset(world.icon) } : {}),
    ...(world.banner ? { banner: toPlayerAsset(world.banner) } : {}),
    sortOrder: world.sortOrder,
    scopeCount: world.scopeCount,
    challengeConfigurationCount: world.challengeConfigurationCount,
  };
}

function toPlayableScope(scope: ScopeSummary): PlayableScope {
  return {
    id: scope.id,
    worldId: scope.worldId,
    name: scope.name,
    slug: scope.slug,
    ...(scope.description ? { description: scope.description } : {}),
    ...(scope.image ? { image: toPlayerAsset(scope.image) } : {}),
    sortOrder: scope.sortOrder,
    readyContentItemCount: scope.readyContentItemCount,
    usableSlots: scope.compatibility.usableSlots.map(toPlayableSlot),
  };
}

function toPlayableSlot(slot: BoardSlot): PlayableBoardSlot {
  return {
    slotKey: slot.slotKey,
    challengeTypeSlug: slot.challengeTypeSlug,
    family: slot.family,
    displayName: slot.displayName,
    ...(slot.description ? { description: slot.description } : {}),
    ...(slot.instructions ? { instructions: slot.instructions } : {}),
    sortOrder: slot.sortOrder,
  };
}

function toPlayerAsset(asset: ContentAssetRef): ContentAssetRef {
  return {
    url: asset.url,
    ...(asset.altText ? { altText: asset.altText } : {}),
  };
}
