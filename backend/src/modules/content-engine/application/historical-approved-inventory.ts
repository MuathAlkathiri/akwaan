import { ClientSession, Model, Types } from 'mongoose';
import { ContentItem } from '../../world-content/schemas/content-item.schema';
import { Scope } from '../../world-content/schemas/scope.schema';
import { World } from '../../world-content/schemas/world.schema';
import { EngineCandidateDocument } from '../schemas/engine-candidate.schema';
import { EngineDraftPublicationDocument } from '../schemas/engine-draft-publication.schema';
import { EngineJobDocument } from '../schemas/engine-job.schema';
import { hasTrustedCandidateApproval } from '../domain/candidate-approval-provenance';
import {
  resolveHistoricalTarget,
  useMongoSession,
} from './authoring-target-resolver';

/** Enumerate approvals before target filtering; a missing identity is never evidence of another Scope. */
export async function classifyHistoricalApprovals(
  models: {
    candidates: Model<EngineCandidateDocument>;
    jobs: Model<EngineJobDocument>;
    publications: Model<EngineDraftPublicationDocument>;
    contentItems: Model<ContentItem>;
    worlds: Model<World>;
    scopes: Model<Scope>;
  },
  targetScopeId: unknown,
  session?: ClientSession,
): Promise<string[]> {
  const candidates = await useMongoSession(
    models.candidates.find({
      reviewStatus: 'approved',
      publishedContentItemId: null,
    }),
    session,
  )
    .select(
      'candidateId jobId reviewStatus reviewDecision reviewEvents publishedContentItemId',
    )
    .sort({ _id: 1 })
    .limit(1001)
    .lean()
    .exec();
  if (candidates.length > 1000)
    throw new Error(
      'Historical approved unpublished candidate inventory exceeds safety limit',
    );
  if (!candidates.length) return [];
  if (candidates.some((c) => !hasTrustedCandidateApproval(c)))
    throw new Error('Historical approval provenance is untrusted');
  const candidateIds = candidates.map((c) => c.candidateId);
  const rawJobIds = [...new Set(candidates.map((c) => c.jobId))];
  if (rawJobIds.some((id) => !Types.ObjectId.isValid(id)))
    throw new Error('Historical approved candidate job identity is invalid');
  const jobs = await useMongoSession(
    models.jobs.find({
      _id: { $in: rawJobIds.map((id) => new Types.ObjectId(id)) },
    }),
    session,
  )
    .select('_id worldKey scopeKey')
    .limit(1001)
    .lean()
    .exec();
  const jobMap = new Map(jobs.map((j) => [String(j._id), j]));
  const pubs = await useMongoSession(
    models.publications.find({ candidateId: { $in: candidateIds } }),
    session,
  )
    .select('candidateId jobId contentItemId reviewRevision')
    .limit(1001)
    .lean()
    .exec();
  if (pubs.length > 1000)
    throw new Error('Historical publication inventory exceeds safety limit');
  const byCandidate = new Map<string, typeof pubs>();
  for (const pub of pubs)
    byCandidate.set(pub.candidateId, [
      ...(byCandidate.get(pub.candidateId) ?? []),
      pub,
    ]);
  const resolved = new Map<
    string,
    Awaited<ReturnType<typeof resolveHistoricalTarget>>
  >();
  const matched: string[] = [];
  for (const candidate of candidates) {
    const job = jobMap.get(candidate.jobId);
    if (!job)
      throw new Error('Historical approved candidate references a missing job');
    const key = JSON.stringify([job.worldKey, job.scopeKey]);
    if (!resolved.has(key))
      resolved.set(
        key,
        await resolveHistoricalTarget(
          models.worlds,
          models.scopes,
          job.worldKey,
          job.scopeKey,
          session,
        ),
      );
    const target = resolved.get(key);
    if (!target)
      throw new Error(
        'Historical approved candidate target is missing or ambiguous',
      );
    const links = byCandidate.get(candidate.candidateId) ?? [];
    if (links.length)
      throw new Error('Historical candidate publication state is inconsistent');
    if (String(target.scope._id) === String(targetScopeId))
      matched.push(candidate.candidateId);
  }
  return matched;
}
