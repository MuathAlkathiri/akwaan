import { createHash } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import {
  CandidateMediaIntent,
  mediaIntentOf,
} from '../domain/candidate-media-intent';
import {
  CandidateMediaSlot,
  CandidateMediaSuggestion,
  MediaVisualCheck,
  replaceMediaSlotAsset,
} from '../domain/candidate-media-plan';
import {
  DiscoveredMedia,
  licenceNoteOf,
  titleNamesSubject,
} from '../domain/media-discovery';
import { resolveMediaRequirements } from '../domain/media-requirements';
import { EngineImageIngestionService } from '../infrastructure/engine-image-ingestion.service';
import { MediaDiscoveryService } from './media-discovery.service';
import {
  MEDIA_LIBRARY_PROVIDER,
  MediaLibraryService,
} from './media-library.service';
import { MediaVisualCheckService } from './media-visual-check.service';

/** One image attached and up to three more to choose from. */
export const ENRICHMENT_DISCOVERY_LIMIT = 4;
/** Web results offered when nothing trustworthy was found. One paid request. */
const WEB_SUGGESTION_LIMIT = 6;
/** Between download attempts, so a batch is never a burst at one host. */
const DEFAULT_PAUSE_MS = 1_000;

export interface MediaEnrichmentInput {
  mechanicKey: string;
  scopeKey: string;
  authoring: unknown;
  mediaPlan: readonly CandidateMediaSlot[];
  mediaReviewRevision?: number | null;
  /**
   * What is needed to look at an image for the answer written on it. Without
   * it (or with the check switched off) images are attached unlooked-at.
   */
  check?: {
    jobId: string;
    candidateId: string;
    question: string;
    acceptedAnswers: string[];
  };
}

export interface MediaEnrichmentOutcome {
  /** Fields to `$set` on the candidate. Empty when nothing changed. */
  set: Record<string, unknown>;
  /** Slots that now hold a found image awaiting review. */
  resolved: string[];
  /** Slots still waiting, with the reason recorded on each. */
  unresolved: string[];
}

/**
 * Fills a candidate's awaited image slots with a real, found image (roadmap
 * §30.22 decision 2, step 6 — the part that used to say "not configured").
 *
 * For each slot that is still `planned`, may be retrieved, and whose candidate
 * says what the picture should show: ask discovery, download the best result
 * through the guarded ingestion, and write it into the slot and the draft. The
 * other results stay on the slot as suggestions.
 *
 * What this never does is decide. The image arrives unreviewed and with rights
 * `UNKNOWN`, so the candidate is exactly as blocked as before — by a pending
 * media review and a rights acknowledgment instead of by a missing file. A
 * person still approves every image; this only saves them finding it.
 *
 * It also never fails the job. A subject nobody photographed, a provider that
 * is down, a download that is refused — each leaves the slot `planned` with the
 * reason, and the reviewer uploads one by hand as before.
 */
@Injectable()
export class CandidateMediaEnrichmentService {
  /** Replaced in tests; production waits for real. */
  pause: (ms: number) => Promise<void> = (ms) =>
    new Promise((done) => setTimeout(done, ms));

  constructor(
    private readonly discovery: MediaDiscoveryService,
    private readonly ingestion: EngineImageIngestionService,
    @Optional() private readonly visual?: MediaVisualCheckService,
    @Optional() private readonly library?: MediaLibraryService,
  ) {}

  /** False when no discovery provider is switched on. */
  isAvailable(): boolean {
    return this.discovery.isAvailable();
  }

  async enrich(input: MediaEnrichmentInput): Promise<MediaEnrichmentOutcome> {
    const requirements = resolveMediaRequirements({
      mechanicKey: input.mechanicKey,
      scopeKey: input.scopeKey,
    });
    let plan: CandidateMediaSlot[] = input.mediaPlan.map((slot) => ({
      ...slot,
    }));
    let revision =
      typeof input.mediaReviewRevision === 'number'
        ? input.mediaReviewRevision
        : 0;
    const set: Record<string, unknown> = {};
    const resolved: string[] = [];
    const unresolved: string[] = [];
    let touched = false;

    for (const requirement of requirements) {
      const index = plan.findIndex(
        (slot) => slot.slotKey === requirement.slotKey,
      );
      const slot = plan[index];
      // Only a slot that is still waiting. One that holds an asset, a decision
      // or an acknowledgment belongs to whoever put it there.
      if (!slot || slot.status !== 'planned' || slot.asset?.url) continue;
      if (
        requirement.mediaType !== 'image' ||
        !requirement.acquisition.includes('retrieve')
      ) {
        continue;
      }

      const wait = (failureReason: string) => {
        if (slot.failureReason !== failureReason) {
          plan[index] = { ...slot, failureReason };
          touched = true;
        }
        unresolved.push(requirement.slotKey);
      };

      const intent = mediaIntentOf(input.authoring, requirement.slotKey);
      if (!intent) {
        wait('MEDIA_INTENT_MISSING');
        continue;
      }

      // What a model saw written in each image it was shown. Empty when the
      // check is off; a missing entry always means "nobody looked".
      const looks = new Map<string, MediaVisualCheck>();
      const lookAt = async (
        imageUrl: string,
      ): Promise<MediaVisualCheck | undefined> => {
        if (!input.check || !this.visual?.isAvailable()) return undefined;
        const known = looks.get(imageUrl);
        if (known) return known;
        const verdict = await this.visual.check({
          jobId: input.check.jobId,
          reservationKey: `${input.check.candidateId}:${requirement.slotKey}:${createHash(
            'sha256',
          )
            .update(imageUrl)
            .digest('hex')
            .slice(0, 16)}`,
          imageUrl,
          question: input.check.question,
          acceptedAnswers: input.check.acceptedAnswers,
          mustNotShow: intent.mustNotShow,
        });
        looks.set(imageUrl, verdict);
        return verdict;
      };
      const shown = (media: DiscoveredMedia) =>
        media.previewUrl ?? media.downloadUrl;
      const look = (media: DiscoveredMedia) => lookAt(shown(media));
      const suggest = async (
        offered: DiscoveredMedia[],
      ): Promise<CandidateMediaSuggestion[]> => {
        // One at a time: each look is a budget reservation on the same job,
        // and concurrent reservations contend for the same ledger row.
        for (const media of offered) await look(media);
        return offered.map((media) => {
          const seen = looks.get(shown(media));
          return {
            ...toSuggestion(media),
            ...(seen ? { visualCheck: seen } : {}),
          };
        });
      };
      /** Nothing attached: record why, and offer everything that was found. */
      const offer = async (
        failureReason: string,
        offered: DiscoveredMedia[],
      ) => {
        plan[index] = {
          ...slot,
          failureReason,
          suggestions: await suggest(offered),
        };
        touched = true;
        unresolved.push(requirement.slotKey);
      };

      // The Admin's own picture for this subject, if they have uploaded one:
      // already chosen, already stored, so nothing is searched for or fetched.
      const owned = await this.library?.find(
        [intent.subject, intent.subjectAr],
        intent.kind,
      );
      if (owned) {
        // Only a public address can be shown to a model; a local one is used
        // unlooked-at, which records as "nobody looked", never as clear.
        const seen = /^https:\/\//i.test(owned.asset.url)
          ? await lookAt(owned.asset.url)
          : undefined;
        if (seen?.status !== 'leaks') {
          const next = replaceMediaSlotAsset(
            { mediaPlan: plan, mediaReviewRevision: revision },
            {
              requirement,
              expectedMediaReviewRevision: revision,
              asset: owned.asset,
              provenance: {
                acquisition: 'upload',
                provider: MEDIA_LIBRARY_PROVIDER,
              },
              rights: { status: 'UNKNOWN', source: 'unrecorded' },
            },
          );
          plan = next.mediaPlan.map((entry) =>
            entry.slotKey === requirement.slotKey && seen
              ? { ...entry, visualCheck: seen }
              : entry,
          );
          revision = next.mediaReviewRevision;
          set[`draft.${requirement.targetPath}`] = {
            type: requirement.mediaType,
            assets: [
              {
                url: owned.asset.url,
                ...(intent.altText
                  ? { altText: intent.altText.slice(0, 200) }
                  : {}),
              },
            ],
          };
          touched = true;
          resolved.push(requirement.slotKey);
          continue;
        }
        // It shows the answer for this particular question: search instead.
      }

      let found: DiscoveredMedia[];
      try {
        const result = await this.discovery.discover({
          subject: intent.subject,
          alternatives: intent.subjectAr ? [intent.subjectAr] : [],
          kind: intent.kind,
          limit: ENRICHMENT_DISCOVERY_LIMIT,
        });
        found = result.candidates;
        if (found.length === 0) {
          const fromWeb = await this.webSearch(intent);
          if (fromWeb.length > 0) {
            await offer('MEDIA_DISCOVERY_NO_CONFIDENT_MATCH', fromWeb);
            continue;
          }
          // "Nobody could be asked" and "nothing exists" need different
          // actions from a reviewer, so they are different reasons.
          const everyProviderFailed =
            result.reports.length > 0 &&
            result.reports.every((report) => report.status === 'failed');
          wait(
            everyProviderFailed
              ? 'MEDIA_DISCOVERY_UNAVAILABLE'
              : 'MEDIA_DISCOVERY_NO_RESULT',
          );
          continue;
        }
      } catch {
        wait('MEDIA_DISCOVERY_UNAVAILABLE');
        continue;
      }

      // A mark is one specific drawing. A file named after the club is far
      // more often a match photo or a chart than its crest, so for a mark only
      // the catalogue's own choice counts.
      const nameIsEnough = intent.kind !== 'club-or-brand-mark';
      // Only a file tied to the subject may be attached unseen. The rest stay
      // on the slot as suggestions for the reviewer to choose from.
      const confident = found.filter(
        (media) =>
          media.subjectVerified === true ||
          (nameIsEnough &&
            titleNamesSubject(media.title, [intent.subject, intent.subjectAr])),
      );
      if (confident.length === 0) {
        await offer('MEDIA_DISCOVERY_NO_CONFIDENT_MATCH', [
          ...found,
          ...(await this.webSearch(intent)),
        ]);
        continue;
      }
      const others = found.filter((media) => !confident.includes(media));

      let attached: DiscoveredMedia | null = null;
      let lastFailure = 'MEDIA_RETRIEVAL_FAILED';
      let downloads = 0;
      for (const media of confident) {
        // The right subject with its name written across it is a spoiled
        // question; it stays a suggestion, flagged, and the next one is tried.
        if ((await look(media))?.status === 'leaks') {
          lastFailure = 'MEDIA_ANSWER_VISIBLE';
          continue;
        }
        if (downloads > 0) await this.pause(DEFAULT_PAUSE_MS);
        downloads += 1;
        const ingested = await this.ingestion.ingestRemote({
          url: media.downloadUrl,
          provenance: {
            provider: media.provider,
            licenceNote: licenceNoteOf(media),
          },
        });
        if (ingested.status !== 'resolved') {
          lastFailure = `MEDIA_RETRIEVAL_FAILED:${ingested.failureReason}`;
          // Storage is ours, not the image's: another image will not fix it.
          if (
            ingested.failureReason === 'STORAGE_NOT_DURABLE' ||
            ingested.failureReason === 'MEDIA_ENRICHMENT_DISABLED'
          ) {
            break;
          }
          continue;
        }

        const next = replaceMediaSlotAsset(
          { mediaPlan: plan, mediaReviewRevision: revision },
          {
            requirement,
            expectedMediaReviewRevision: revision,
            asset: ingested.asset,
            provenance: ingested.provenance,
            rights: ingested.rights,
          },
        );
        const suggestions = await suggest([
          ...confident.filter((other) => other !== media),
          ...others,
        ]);
        const seen = looks.get(shown(media));
        plan = next.mediaPlan.map((entry) =>
          entry.slotKey === requirement.slotKey
            ? { ...entry, suggestions, ...(seen ? { visualCheck: seen } : {}) }
            : entry,
        );
        revision = next.mediaReviewRevision;
        // The draft field the readiness gate compares the slot against, in the
        // canonical `ContentAssetDto` shape.
        set[`draft.${requirement.targetPath}`] = {
          type: requirement.mediaType,
          assets: [
            {
              url: ingested.asset.url,
              ...(intent.altText
                ? { altText: intent.altText.slice(0, 200) }
                : {}),
            },
          ],
        };
        attached = media;
        touched = true;
        resolved.push(requirement.slotKey);
        break;
      }
      if (attached === null) {
        if (lastFailure === 'MEDIA_ANSWER_VISIBLE') {
          await offer('MEDIA_ANSWER_VISIBLE_IN_ALL', [
            ...found,
            ...(await this.webSearch(intent)),
          ]);
        } else {
          wait(lastFailure);
        }
      }
    }

    if (!touched) return { set: {}, resolved, unresolved };
    return {
      set: {
        ...set,
        mediaPlan: plan,
        ...(resolved.length ? { mediaReviewRevision: revision } : {}),
      },
      resolved,
      unresolved,
    };
  }

  /**
   * Last resort, for the reviewer's eyes only: whatever a general web search
   * shows. Never attached from here, and a failure is simply no suggestions.
   */
  private async webSearch(
    intent: CandidateMediaIntent,
  ): Promise<DiscoveredMedia[]> {
    if (!this.discovery.hasFallback()) return [];
    try {
      const result = await this.discovery.discover({
        subject: intent.subject,
        kind: intent.kind,
        tier: 'fallback',
        limit: WEB_SUGGESTION_LIMIT,
      });
      return result.candidates;
    } catch {
      return [];
    }
  }
}

const toSuggestion = (media: DiscoveredMedia): CandidateMediaSuggestion => ({
  provider: media.provider,
  title: media.title,
  downloadUrl: media.downloadUrl,
  pageUrl: media.pageUrl,
  width: media.width,
  height: media.height,
  licenceNote: licenceNoteOf(media),
  ...(media.previewUrl ? { previewUrl: media.previewUrl } : {}),
});
