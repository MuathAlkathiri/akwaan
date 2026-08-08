import { Injectable } from '@nestjs/common';
import {
  CORE_ROUND_RUNTIME_PLUGIN,
  GameplayModePlugin,
} from './gameplay-mode.plugin';
import { LiveSessionDomainError } from './live-session.errors';
import { BOMB_GAMEPLAY_PLUGIN } from './bomb-gameplay.plugin';
import { RYO_GAMEPLAY_PLUGIN } from './ryo-gameplay.plugin';
import { TOP5_KEEP_OR_GIVE_PLUGIN } from './top5-keep-or-give.plugin';
import { DISTRIBUTED_INFORMATION_PLUGIN } from './distributed-information.plugin';
import { CLOSEST_GAMEPLAY_PLUGIN } from './closest-gameplay.plugin';

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
      this.registryKey(
        DISTRIBUTED_INFORMATION_PLUGIN.key,
        DISTRIBUTED_INFORMATION_PLUGIN.version,
      ),
      DISTRIBUTED_INFORMATION_PLUGIN,
    ],
    [
      this.registryKey(CLOSEST_GAMEPLAY_PLUGIN.key, CLOSEST_GAMEPLAY_PLUGIN.version),
      CLOSEST_GAMEPLAY_PLUGIN,
    ],
  ]);

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
