import {
  diagnosticFetch,
  runBatchSession,
  runWorldRyoBatch,
  WORLD_RYO_PAYLOADS,
} from '../../../ai/workbench/scripts/gsap-admin-draft-cli';
import { deriveTutorialOutcome } from '../../src/modules/world-content/domain/mechanic-tutorial.policy';
import { MechanicTutorialService } from '../../src/modules/world-content/application/mechanic-tutorial.service';
import { ScopedMechanicTutorialSchema } from '../../src/modules/world-content/schemas/scoped-mechanic-tutorial.schema';
import { model, Types } from 'mongoose';

const ids = ['6a6e46a747bc63bdaf2e3800', '6a6e54159e10fe3b881da006'];
const worlds = [
  { id: ids[0], slug: 'test', name: 'عالم كرة القدم' },
  { id: ids[1], slug: 'world-1785615381449', name: 'عالم الانمي' },
];
const mechanic = 'read-your-opponent';
const outcome = deriveTutorialOutcome(WORLD_RYO_PAYLOADS.football as any);
const stored = (key: string) => ({
  ...structuredClone(WORLD_RYO_PAYLOADS[key]),
  outcome,
});

function setup() {
  const records: Record<string, any> = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        worldId: id,
        mechanicKey: mechanic,
        associated: true,
        generic: { published: true, publishedRevision: 1 },
        draft: null,
        published: null,
        publishedRevision: 0,
        withdrawnAt: null,
        revisions: [],
      },
    ]),
  );
  const generic = {
    publishedRevision: 1,
    published: { prompt: 'generic', outcome: { delta: 1 } },
  };
  const publicGeneric = { revision: 1, scenario: generic.published };
  const writes: string[] = [];
  const logs: any[] = [];
  let failWorld = '';
  let ambiguous = false;
  const request = jest.fn(
    async (path: string, init?: RequestInit): Promise<any> => {
      if (path === '/auth/me') return { role: 'admin' };
      if (path === '/admin/worlds') return structuredClone(worlds);
      if (path === `/admin/mechanics/${mechanic}/tutorial`)
        return structuredClone(generic);
      if (path === `/mechanics/${mechanic}/tutorial`)
        return structuredClone(publicGeneric);
      const id = ids.find((value) => path.includes(value));
      if (!id) throw new Error(`Unexpected path: ${path}`);
      if (!path.startsWith('/admin/')) return { source: 'generic' };
      if (path.endsWith('/validate'))
        return { valid: true, issues: [], competitiveOverlap: [], outcome };
      if (path.endsWith('/draft')) {
        writes.push(id);
        if (failWorld === id && !ambiguous) throw new Error('write failed');
        records[id].draft = { ...JSON.parse(String(init?.body)), outcome };
        if (failWorld === id && ambiguous) throw new Error('connection lost');
        return structuredClone(records[id]);
      }
      return structuredClone(records[id]);
    },
  );
  return {
    records,
    generic,
    worlds,
    writes,
    logs,
    request,
    confirm: jest.fn(async () => 'SAVE APPROVED RYO DRAFTS'),
    log: (value: unknown) => logs.push(value),
    setFailure: (id: string, ambiguousWrite = false) => {
      failWorld = id;
      ambiguous = ambiguousWrite;
    },
  };
}

describe('guarded world RYO batch', () => {
  it('reports a redacted network failure without leaking request or cause secrets', async () => {
    const fetcher = jest.fn().mockRejectedValue(
      Object.assign(new TypeError('token=secret'), {
        cause: { code: 'ENOTFOUND', message: 'otp=123456' },
      }),
    );
    let message = '';
    try {
      await diagnosticFetch(
        '/admin/worlds/private-id/mechanics/read-your-opponent/tutorial?token=secret',
        { headers: { Authorization: 'Bearer private-token' } },
        'read-only preflight',
        fetcher,
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('phase=read-only preflight; method=GET');
    expect(message).toContain(
      '/admin/worlds/:redacted/mechanics/read-your-opponent/tutorial',
    );
    expect(message).toContain('cause_code=ENOTFOUND');
    expect(message).toContain(
      'current_draft_write_may_have_been_transmitted=false',
    );
    expect(message).not.toMatch(/secret|123456|private-id|private-token/);
  });
  it('marks an interrupted draft PUT and later read as potentially written', async () => {
    const fetcher = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('private'), { cause: { code: 'ECONNRESET' } }),
      );
    const path = `/admin/worlds/${ids[0]}/mechanics/${mechanic}/tutorial/draft`;
    await expect(
      diagnosticFetch(
        path,
        { method: 'PUT', body: 'private draft' },
        'draft PUT',
        fetcher,
      ),
    ).rejects.toThrow(
      /phase=draft PUT; method=PUT.*cause_code=ECONNRESET;.*current_draft_write_may_have_been_transmitted=true/,
    );
    await expect(
      diagnosticFetch('/health', {}, 'read-after-write', fetcher),
    ).rejects.toThrow(
      /current_draft_write_may_have_been_transmitted=false; any_draft_write_may_have_been_transmitted=true/,
    );
  });
  it('authenticates once for both Worlds', async () => {
    const s = setup();
    const authenticate = jest.fn(async () => 'session-token');
    await runBatchSession(false, {
      health: async () => {},
      authenticate,
      request: (path, token, init) => {
        expect(token).toBe('session-token');
        return s.request(path, init);
      },
      confirm: s.confirm,
      log: s.log,
    });
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
  it('preserves caption through service composition and scoped schema casting', () => {
    const service = Object.create(MechanicTutorialService.prototype) as any;
    const composed = service.compose(WORLD_RYO_PAYLOADS.football);
    const Scoped = model('BatchCaptionTest', ScopedMechanicTutorialSchema);
    const doc = new Scoped({
      worldId: new Types.ObjectId(ids[0]),
      challengeTypeId: new Types.ObjectId(),
      mechanicKey: mechanic,
      draft: composed,
    });
    expect(doc.validateSync()).toBeUndefined();
    expect((doc.toObject().draft as any).caption).toBe(
      WORLD_RYO_PAYLOADS.football.caption,
    );
  });
  afterEach(() => {
    worlds[0].slug = 'test';
  });
  it('runs both preflights read-only and checks identity, association and validation', async () => {
    const s = setup();
    await runWorldRyoBatch(false, s);
    expect(s.writes).toEqual([]);
    expect(s.confirm).not.toHaveBeenCalled();
    expect(
      s.request.mock.calls.filter(([p]) => p.endsWith('/validate')),
    ).toHaveLength(2);
  });
  it('uses one confirmation and preserves captions in sequential read-back without publishing', async () => {
    const s = setup();
    await runWorldRyoBatch(true, s);
    expect(s.confirm).toHaveBeenCalledTimes(1);
    expect(s.writes).toEqual(ids);
    expect(s.records[ids[0]].draft).toEqual(stored('football'));
    expect(s.records[ids[1]].draft).toEqual(stored('anime'));
    expect(s.request.mock.calls.some(([p]) => p.includes('/publish'))).toBe(
      false,
    );
  });
  it('skips an identical draft', async () => {
    const s = setup();
    s.records[ids[0]].draft = stored('football');
    await runWorldRyoBatch(true, s);
    expect(s.writes).toEqual([ids[1]]);
  });
  it.each(['identity', 'association', 'draft', 'publication', 'generic'])(
    'refuses %s conflict before writing',
    async (kind) => {
      const s = setup();
      if (kind === 'identity') worlds[0].slug = 'other';
      if (kind === 'association') s.records[ids[0]].associated = false;
      if (kind === 'draft') s.records[ids[0]].draft = { prompt: 'conflict' };
      if (kind === 'publication') s.records[ids[0]].published = {};
      if (kind === 'generic') s.generic.publishedRevision = 2;
      await expect(runWorldRyoBatch(true, s)).rejects.toThrow();
      expect(s.writes).toEqual([]);
    },
  );
  it('reports a partial batch when the second write fails', async () => {
    const s = setup();
    s.setFailure(ids[1]);
    await expect(runWorldRyoBatch(true, s)).rejects.toThrow(/anime/);
    expect(s.records[ids[0]].draft).toEqual(stored('football'));
    expect(
      s.logs.some(
        (v) => v.world === 'football' && v.result === 'saved and read back',
      ),
    ).toBe(true);
    expect(s.writes).toEqual(ids);
  });
  it('reads an ambiguous write once and does not retry it', async () => {
    const s = setup();
    s.setFailure(ids[0], true);
    await runWorldRyoBatch(true, s);
    expect(s.writes).toEqual(ids);
    expect(
      s.logs.some((v) => v.world === 'football' && v.responseAmbiguous),
    ).toBe(true);
  });
});
