/**
 * Find real images of a subject, from the terminal.
 *
 *   cd backend
 *   npx ts-node --transpile-only src/scripts/discover-media.ts "Arsène Wenger"
 *   npx ts-node --transpile-only src/scripts/discover-media.ts "Arsène Wenger" \
 *       --alt="أرسين فينغر" --limit=4 --download
 *
 * Read-only by default: it prints what the providers found — size, the licence
 * each page states, the author, and the page to open. With `--download` it also
 * fetches the suggestions through the same guarded downloader the engine uses
 * and saves them, with a `<name>.sources.json` beside them, under
 * `ai/workbench/artifacts/handoff/images/` (or `--out=<dir>`).
 *
 * It talks to no database, writes no content record and uploads nothing. The
 * licence shown is what the page claims, not a clearance: rights are decided by
 * a person, in the media-rights record, when an image is actually used.
 *
 * It runs the same `MediaDiscoveryService` and provider the Content Engine
 * registers — this is a second way in, not a second pipeline.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { MediaDiscoveryService } from '../modules/content-engine/application/media-discovery.service';
import {
  DiscoveredMedia,
  licenceNoteOf,
  MediaDiscoveryError,
} from '../modules/content-engine/domain/media-discovery';
import { WikimediaCommonsDiscoveryProvider } from '../modules/content-engine/infrastructure/wikimedia-commons.discovery';
import { WikidataDiscoveryProvider } from '../modules/content-engine/infrastructure/wikidata.discovery';
import {
  ImageDownloadService,
  ImageFetchError,
} from '../modules/ai-agent/infrastructure/assets/image-download.service';
import { ENGINE_IMAGE_MAX_BYTES } from '../modules/content-engine/infrastructure/engine-image-ingestion.service';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DEFAULT_OUT = join(
  REPO_ROOT,
  'ai',
  'workbench',
  'artifacts',
  'handoff',
  'images',
);

interface Arguments {
  subject: string;
  alternatives: string[];
  limit?: number;
  kind?: string;
  download: boolean;
  out: string;
  json: boolean;
}

export function parseArguments(argv: string[]): Arguments {
  const value = (flag: string) =>
    argv
      .filter((argument) => argument.startsWith(`${flag}=`))
      .map((argument) => argument.slice(flag.length + 1));
  const positional = argv.filter((argument) => !argument.startsWith('--'));
  const limit = value('--limit')[0];
  const kind = value('--kind')[0];
  return {
    subject: positional.join(' ').trim(),
    alternatives: value('--alt'),
    ...(limit !== undefined ? { limit: Number(limit) } : {}),
    ...(kind ? { kind } : {}),
    download: argv.includes('--download'),
    out: value('--out')[0] ? resolve(value('--out')[0]) : DEFAULT_OUT,
    json: argv.includes('--json'),
  };
}

/** `Arsène Wenger` -> `arsene-wenger`: a name `run.sh place` accepts. */
export function fileSlug(subject: string): string {
  const slug = subject
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'image';
}

const DOWNLOAD_PAUSE_MS = 2_000;
/** Waits used when a throttling server does not say how long. */
const THROTTLE_BACKOFF_MS = [10_000, 30_000];
const THROTTLE_MAX_WAIT_MS = 180_000;

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * How long to wait before each retry of a throttled request: the server's own
 * `Retry-After` when it sent one, otherwise a fixed backoff. Waiting less than
 * the server asked is asking again while still refused, so the stated time is
 * honoured in full up to three minutes.
 */
export function throttleWaitMs(
  attempt: number,
  retryAfterSeconds: number | undefined,
): number | null {
  if (attempt >= THROTTLE_BACKOFF_MS.length) return null;
  if (retryAfterSeconds !== undefined) {
    return Math.min(retryAfterSeconds * 1000, THROTTLE_MAX_WAIT_MS);
  }
  return THROTTLE_BACKOFF_MS[attempt];
}

/**
 * HTTP 429 means "later", not "no". The first two live runs each lost one
 * image in four to a 429 that a plain request minutes later did not get, and a
 * single 6-second retry was not enough — so this waits as long as the server
 * asks, twice, and says what it is doing.
 */
async function fetchPatiently(downloader: ImageDownloadService, url: string) {
  const options = { maxBytes: ENGINE_IMAGE_MAX_BYTES };
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await downloader.fetchImage(url, options);
    } catch (error) {
      if (!(error instanceof ImageFetchError) || error.status !== 429) {
        throw error;
      }
      const wait = throttleWaitMs(attempt, error.retryAfterSeconds);
      if (wait === null) throw error;
      console.error(
        `throttled (HTTP 429, Retry-After: ${error.retryAfterSeconds ?? 'not sent'}); waiting ${Math.round(wait / 1000)}s`,
      );
      await sleep(wait);
    }
  }
}

const cell = (text: string, width: number) =>
  text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);

function printTable(found: DiscoveredMedia[]): void {
  console.log(
    `${cell('#', 3)}${cell('SOURCE', 20)}${cell('SIZE', 12)}${cell('LICENCE', 18)}${cell('AUTHOR', 26)}PAGE`,
  );
  found.forEach((media, index) => {
    console.log(
      `${cell(String(index + 1), 3)}${cell(media.provider + (media.subjectVerified ? ' *' : ''), 20)}` +
        `${cell(`${media.width}x${media.height}`, 12)}` +
        `${cell(media.licence.name ?? 'not stated', 18)}` +
        `${cell(media.author ?? 'not stated', 26)}${media.pageUrl}`,
    );
  });
}

async function main(): Promise<number> {
  const args = parseArguments(process.argv.slice(2));
  if (!args.subject) {
    console.error(
      'usage: discover-media.ts "<subject>" [--alt="<other name>"]... [--kind=person|place|club-or-brand-mark] [--limit=N] [--download] [--out=<dir>] [--json]',
    );
    return 2;
  }

  const service = new MediaDiscoveryService([
    new WikidataDiscoveryProvider({
      userAgent: process.env.ENGINE_MEDIA_DISCOVERY_USER_AGENT?.trim(),
    }),
    new WikimediaCommonsDiscoveryProvider({
      userAgent: process.env.ENGINE_MEDIA_DISCOVERY_USER_AGENT?.trim(),
    }),
  ]);

  let result;
  try {
    result = await service.discover({
      subject: args.subject,
      alternatives: args.alternatives,
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
      ...(args.kind ? { kind: args.kind } : {}),
    });
  } catch (error) {
    console.error(
      error instanceof MediaDiscoveryError ? error.message : String(error),
    );
    return 2;
  }

  for (const report of result.reports) {
    if (report.status === 'failed') {
      console.error(
        `provider ${report.provider} failed for "${report.phrase}": ${report.detail}`,
      );
    }
  }

  const everyProviderFailed =
    result.reports.length > 0 &&
    result.reports.every((report) => report.status === 'failed');

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (everyProviderFailed) {
    // Not "no images exist": nobody could be asked.
    console.log(
      `Could not search for "${args.subject}": no provider answered.`,
    );
  } else if (result.candidates.length === 0) {
    console.log(`No usable images found for "${args.subject}".`);
  } else {
    printTable(result.candidates);
  }
  if (!args.download || result.candidates.length === 0) {
    // "Nothing found" and "could not ask" must not look the same to a script.
    return everyProviderFailed ? 1 : 0;
  }

  // The engine's own downloader: destination guard, redirect re-validation,
  // streaming byte cap, and proof that the bytes are a real image.
  const downloader = new ImageDownloadService({
    get: (key: string) => process.env[key],
  } as never);
  mkdirSync(args.out, { recursive: true });
  const slug = fileSlug(args.subject);
  const sources: Record<string, unknown>[] = [];
  let failed = 0;

  for (const [index, media] of result.candidates.entries()) {
    try {
      // One at a time, with a pause before each — the first included, since
      // it follows straight after the search request. A burst is what a
      // provider throttles first.
      await sleep(DOWNLOAD_PAUSE_MS);
      const fetched = await fetchPatiently(downloader, media.downloadUrl);
      const file = `${slug}-${index + 1}${fetched.image.extension}`;
      writeFileSync(join(args.out, file), fetched.bytes, { flag: 'wx' });
      sources.push({
        file,
        width: fetched.image.width,
        height: fetched.image.height,
        bytes: fetched.bytes.length,
        provider: media.provider,
        pageUrl: media.pageUrl,
        originalUrl: media.originalUrl,
        downloadedFrom: fetched.finalUrl,
        licence: media.licence,
        author: media.author,
        credit: media.credit,
        licenceNote: licenceNoteOf(media),
        rightsStatus: 'UNKNOWN',
        retrievedAt: new Date().toISOString(),
      });
      console.log(`saved ${file} (${fetched.bytes.length} bytes)`);
    } catch (error) {
      failed += 1;
      console.error(
        `could not save #${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (sources.length > 0) {
    const manifest = join(args.out, `${slug}.sources.json`);
    writeFileSync(
      manifest,
      `${JSON.stringify({ subject: args.subject, images: sources }, null, 2)}\n`,
    );
    console.log(`provenance: ${manifest}`);
    console.log(
      'next: ai/scripts/agents/run.sh place <path to the image you chose> <asset_name>',
    );
  }
  return failed > 0 && sources.length === 0 ? 1 : 0;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
