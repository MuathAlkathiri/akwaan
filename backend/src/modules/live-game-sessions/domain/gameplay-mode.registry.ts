import { Injectable } from '@nestjs/common';
import {
  CORE_ROUND_RUNTIME_PLUGIN,
  GameplayModePlugin,
} from './gameplay-mode.plugin';
import { LiveSessionDomainError } from './live-session.errors';
import { BOMB_GAMEPLAY_PLUGIN } from './bomb-gameplay.plugin';
import { RYO_GAMEPLAY_PLUGIN } from './ryo-gameplay.plugin';
import { TOP5_KEEP_OR_GIVE_PLUGIN } from './top5-keep-or-give.plugin';
import { RAKKIBHA_PLUGIN } from './rakkibha.plugin';
import { COMBO_GAMEPLAY_PLUGIN } from './combo-gameplay.plugin';
import { CLOSEST_GAMEPLAY_PLUGIN } from './closest-gameplay.plugin';
import { ONE_CLUE_GAMEPLAY_PLUGIN } from './one-clue-gameplay.plugin';
import { MARHALA_GAMEPLAY_PLUGIN } from './marhala-gameplay.plugin';
import { ODD_PIECE_GAMEPLAY_PLUGIN } from './odd-piece-gameplay.plugin';
import { LAQATHA_GAMEPLAY_PLUGIN } from './laqatha-gameplay.plugin';
import { FIRST_NOTE_GAMEPLAY_PLUGIN } from './first-note-gameplay.plugin';

@Injectable()
export class GameplayModeRegistry {
  private readonly plugins = new Map<string, GameplayModePlugin>([
    [
      this.registryKey(
        CORE_ROUND_RUNTIME_PLUGIN.key,
        CORE_ROUND_RUNTIME_PLUGIN.version,
      ),
      CORE_ROUND_RUNTIME_PLUGIN,
    ],
    [
      this.registryKey(BOMB_GAMEPLAY_PLUGIN.key, BOMB_GAMEPLAY_PLUGIN.version),
      BOMB_GAMEPLAY_PLUGIN,
    ],
    [
      this.registryKey(RYO_GAMEPLAY_PLUGIN.key, RYO_GAMEPLAY_PLUGIN.version),
      RYO_GAMEPLAY_PLUGIN,
    ],
    [
      this.registryKey(
        TOP5_KEEP_OR_GIVE_PLUGIN.key,
        TOP5_KEEP_OR_GIVE_PLUGIN.version,
      ),
      TOP5_KEEP_OR_GIVE_PLUGIN,
    ],
    [
      this.registryKey(RAKKIBHA_PLUGIN.key, RAKKIBHA_PLUGIN.version),
      RAKKIBHA_PLUGIN,
    ],
    [
      this.registryKey(
        CLOSEST_GAMEPLAY_PLUGIN.key,
        CLOSEST_GAMEPLAY_PLUGIN.version,
      ),
      CLOSEST_GAMEPLAY_PLUGIN,
    ],
    [
      this.registryKey(
        COMBO_GAMEPLAY_PLUGIN.key,
        COMBO_GAMEPLAY_PLUGIN.version,
      ),
      COMBO_GAMEPLAY_PLUGIN,
    ],
    [
      this.registryKey(
        ONE_CLUE_GAMEPLAY_PLUGIN.key,
        ONE_CLUE_GAMEPLAY_PLUGIN.version,
      ),
      ONE_CLUE_GAMEPLAY_PLUGIN,
    ],
    [
      this.registryKey(
        MARHALA_GAMEPLAY_PLUGIN.key,
        MARHALA_GAMEPLAY_PLUGIN.version,
      ),
      MARHALA_GAMEPLAY_PLUGIN,
    ],
    [
      this.registryKey(
        ODD_PIECE_GAMEPLAY_PLUGIN.key,
        ODD_PIECE_GAMEPLAY_PLUGIN.version,
      ),
      ODD_PIECE_GAMEPLAY_PLUGIN,
    ],
    [
      this.registryKey(
        LAQATHA_GAMEPLAY_PLUGIN.key,
        LAQATHA_GAMEPLAY_PLUGIN.version,
      ),
      LAQATHA_GAMEPLAY_PLUGIN,
    ],
    [
      this.registryKey(
        FIRST_NOTE_GAMEPLAY_PLUGIN.key,
        FIRST_NOTE_GAMEPLAY_PLUGIN.version,
      ),
      FIRST_NOTE_GAMEPLAY_PLUGIN,
    ],
  ]);

  /**
   * Every registered mechanic.
   *
   * Exists so lifecycle guarantees can be asserted across the whole registry
   * rather than mechanic by mechanic — a new plugin is then covered the moment
   * it is registered, instead of when somebody remembers to extend a list.
   */
  all(): GameplayModePlugin[] {
    return [...this.plugins.values()];
  }

  resolve(key: string, version: number): GameplayModePlugin {
    const plugin = this.plugins.get(this.registryKey(key, version));
    if (!plugin) {
      throw new LiveSessionDomainError(
        'GAMEPLAY_PLUGIN_NOT_FOUND',
        `Gameplay plugin "${key}" version ${version} is not registered`,
      );
    }
    return plugin;
  }

  private registryKey(key: string, version: number): string {
    return `${key}:${version}`;
  }
}
