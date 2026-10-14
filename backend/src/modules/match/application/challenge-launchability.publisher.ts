import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChallengeLaunchabilityRegistry } from '../../world-content/domain/challenge-launchability.registry';
import { ChallengeLauncherRegistry } from './challenge-launcher.registry';

/**
 * Tells World Content which mechanics this runtime can actually launch.
 *
 * Match already depends on World Content, so the knowledge travels along the
 * edge that exists rather than a new one. Every launcher registers itself into
 * `ChallengeLauncherRegistry` at `onModuleInit`; this publishes that same
 * registry — not a copy of its keys — as the answer readiness consults, so a
 * mechanic gains and loses board-readiness on exactly the condition that decides
 * whether a Match can open it.
 */
@Injectable()
export class ChallengeLaunchabilityPublisher implements OnModuleInit {
  constructor(
    private readonly launchers: ChallengeLauncherRegistry,
    private readonly launchability: ChallengeLaunchabilityRegistry,
  ) {}

  onModuleInit(): void {
    this.launchability.publish((challengeTypeSlug) =>
      Boolean(this.launchers.find({ challengeTypeSlug })),
    );
    // Global World readiness sees only the deck requirement. An account-specific
    // on-demand inventory floor belongs to launch selection, where owner history
    // and live reservations exist; publishing it here would disable a World for
    // everyone because one account exhausted its own pool.
    this.launchability.publishContentRequirement(
      (challengeTypeSlug) =>
        this.launchers.find({ challengeTypeSlug })?.launchRequirements
          .contentItemCount ?? 0,
    );
  }
}
