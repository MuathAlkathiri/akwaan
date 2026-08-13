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
}

/**
 * A board position as a player sees it: what it is called and where it sits.
 * The configuration id, challenge type id, scoring rule, answer mode and item
 * structure stay server-side — a client never needs them to render a board.
 */
export interface PlayableBoardSlot {
  slotKey: BoardSlot['slotKey'];
  challengeTypeId: string;
  challengeTypeSlug: string;
  family: BoardSlot['family'];
  displayName: string;
  description?: string;
  instructions?: string;
  itemStructure: BoardSlot['itemStructure'];
  answerMode: BoardSlot['answerMode'];
  scoringRuleId: string;
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

  async listPlayableWorlds(): Promise<PlayableWorld[]> {
    const summaries = await this.worlds.list();
    return summaries
      .filter((world) => world.status === WorldContentStatus.ACTIVE)
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

function toPlayableWorld(world: WorldSummary): PlayableWorld {
  return {
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
    challengeTypeId: slot.challengeTypeId,
    challengeTypeSlug: slot.challengeTypeSlug,
    family: slot.family,
    displayName: slot.displayName,
    ...(slot.description ? { description: slot.description } : {}),
    ...(slot.instructions ? { instructions: slot.instructions } : {}),
    itemStructure: slot.itemStructure,
    answerMode: slot.answerMode,
    scoringRuleId: slot.scoringRuleId,
    sortOrder: slot.sortOrder,
  };
}

function toPlayerAsset(asset: ContentAssetRef): ContentAssetRef {
  return {
    url: asset.url,
    ...(asset.altText ? { altText: asset.altText } : {}),
  };
}
