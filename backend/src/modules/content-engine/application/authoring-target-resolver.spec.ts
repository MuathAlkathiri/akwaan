import * as fs from 'fs';
import * as path from 'path';
import {
  resolveCanonicalWorld,
  resolveCanonicalScope,
  resolveCanonicalChallengeType,
} from './authoring-target-resolver';
import {
  CANONICAL_WORLD_ALIASES,
  CANONICAL_SCOPE_ALIASES,
  CANONICAL_CHALLENGE_TYPE_ALIASES,
} from './authoring-target-aliases';
import { WorldContentStatus } from '../../world-content/domain/world-content.constants';

describe('AuthoringTargetResolver', () => {
  describe('Authoritative Parity with promote_approved_content.py', () => {
    it('verifies TypeScript aliases strictly mirror promote_approved_content.py canonical tables', () => {
      // Find promote_approved_content.py by relative path
      const scriptPath = path.resolve(
        __dirname,
        '../../../../../ai/scripts/promote_approved_content.py',
      );
      expect(fs.existsSync(scriptPath)).toBe(true);

      const pyContent = fs.readFileSync(scriptPath, 'utf8');

      function parsePyDict(name: string): Record<string, string[]> {
        const match = pyContent.match(
          new RegExp(
            name +
              '\\s*:\\s*dict\\[str,\\s*tuple\\[str,\\s*\\.\\.\\.\\]\\]\\s*=\\s*\\{([\\s\\S]*?)\\n\\}',
          ),
        );
        if (!match) throw new Error('Could not find ' + name);
        const body = match[1];
        const result: Record<string, string[]> = {};
        const lines = body.split('\n');
        for (const line of lines) {
          const m = line.match(/"([^"]+)":\s*\(([^)]+)\)/);
          if (m) {
            const key = m[1];
            const tupleItems = [...m[2].matchAll(/"([^"]+)"/g)].map(
              (x) => x[1],
            );
            result[key] = tupleItems;
          }
        }
        return result;
      }

      const pyWorlds = parsePyDict('CANONICAL_WORLD_ALIASES');
      const pyScopes = parsePyDict('CANONICAL_SCOPE_ALIASES');
      const pyTypes = parsePyDict('CANONICAL_CHALLENGE_TYPE_ALIASES');

      // Every Python world alias must exist in TypeScript
      for (const [key, aliases] of Object.entries(pyWorlds)) {
        expect(CANONICAL_WORLD_ALIASES[key]).toBeDefined();
        for (const alias of aliases) {
          expect(CANONICAL_WORLD_ALIASES[key]).toContain(alias);
        }
      }

      // Every Python scope alias must exist in TypeScript
      for (const [key, aliases] of Object.entries(pyScopes)) {
        expect(CANONICAL_SCOPE_ALIASES[key]).toBeDefined();
        for (const alias of aliases) {
          expect(CANONICAL_SCOPE_ALIASES[key]).toContain(alias);
        }
      }

      // Every Python challenge type alias must exist in TypeScript
      for (const [key, aliases] of Object.entries(pyTypes)) {
        expect(CANONICAL_CHALLENGE_TYPE_ALIASES[key]).toBeDefined();
        for (const alias of aliases) {
          expect(CANONICAL_CHALLENGE_TYPE_ALIASES[key]).toContain(alias);
        }
      }
    });
  });

  describe('World Resolution', () => {
    it('resolves direct slug matches', async () => {
      const mockRepo = {
        findBySlug: jest.fn().mockImplementation(async (slug: string) => {
          if (slug === 'football')
            return { _id: 'w-1', slug: 'football', name: 'كرة قدم' };
          return null;
        }),
      };

      const result = await resolveCanonicalWorld(mockRepo, 'football');
      expect(result).toEqual({ _id: 'w-1', slug: 'football', name: 'كرة قدم' });
      expect(mockRepo.findBySlug).toHaveBeenCalledWith('football');
    });

    it('resolves off-board authoring key "puzzles" to production slug "world-1786388973542"', async () => {
      const mockRepo = {
        findBySlug: jest.fn().mockImplementation(async (slug: string) => {
          if (slug === 'world-1786388973542') {
            return {
              _id: 'w-puzzles',
              slug: 'world-1786388973542',
              name: 'عالم الألغاز',
            };
          }
          return null;
        }),
      };

      const result = await resolveCanonicalWorld(mockRepo, 'puzzles');
      expect(result).toEqual({
        _id: 'w-puzzles',
        slug: 'world-1786388973542',
        name: 'عالم الألغاز',
      });
      expect(mockRepo.findBySlug).toHaveBeenCalledWith('puzzles');
      expect(mockRepo.findBySlug).toHaveBeenCalledWith('world-1786388973542');
    });

    it('resolves world via list() if slug is stored in Arabic or custom name', async () => {
      const mockRepo = {
        findBySlug: jest.fn().mockResolvedValue(null),
        list: jest
          .fn()
          .mockResolvedValue([
            { _id: 'w-custom', slug: 'some-custom-slug', name: 'عالم الألغاز' },
          ]),
      };

      const result = await resolveCanonicalWorld(mockRepo, 'puzzles');
      expect(result).toEqual({
        _id: 'w-custom',
        slug: 'some-custom-slug',
        name: 'عالم الألغاز',
      });
    });

    it('disambiguates by preferring active entities when an archived duplicate exists', async () => {
      const mockRepo = {
        findBySlug: jest.fn().mockResolvedValue(null),
        list: jest.fn().mockResolvedValue([
          {
            _id: 'w-archived',
            slug: 'world-1786388973542',
            name: 'عالم الألغاز القديم',
            status: WorldContentStatus.ARCHIVED,
          },
          {
            _id: 'w-active',
            slug: 'world-active-puzzles',
            name: 'عالم الألغاز',
            status: WorldContentStatus.ACTIVE,
          },
        ]),
      };

      const result = await resolveCanonicalWorld(mockRepo, 'puzzles');
      expect(result).toBeDefined();
      expect(result?._id).toBe('w-active');
    });

    it('fails safely (returns null) on ambiguous collisions when multiple active entities match', async () => {
      const mockRepo = {
        findBySlug: jest.fn().mockResolvedValue(null),
        list: jest.fn().mockResolvedValue([
          {
            _id: 'w-1',
            slug: 'puzzles-team-a',
            name: 'عالم الألغاز',
            status: WorldContentStatus.ACTIVE,
          },
          {
            _id: 'w-2',
            slug: 'puzzles-team-b',
            name: 'عالم الألغاز',
            status: WorldContentStatus.ACTIVE,
          },
        ]),
      };

      const result = await resolveCanonicalWorld(mockRepo, 'puzzles');
      expect(result).toBeNull();
    });

    it('returns null if world cannot be resolved', async () => {
      const mockRepo = {
        findBySlug: jest.fn().mockResolvedValue(null),
      };

      const result = await resolveCanonicalWorld(
        mockRepo,
        'non-existent-world',
      );
      expect(result).toBeNull();
    });
  });

  describe('Scope Resolution', () => {
    it('resolves scope using alias list (e.g. "world-cup")', async () => {
      const mockRepo = {
        findBySlugInWorld: jest
          .fn()
          .mockImplementation(async (worldId: string, slug: string) => {
            if (slug === 'scope-1785788790909') {
              return {
                _id: 's-wc',
                worldId,
                slug: 'scope-1785788790909',
                name: 'كأس العالم',
              };
            }
            return null;
          }),
      };

      const result = await resolveCanonicalScope(mockRepo, 'w-1', 'world-cup');
      expect(result).toEqual({
        _id: 's-wc',
        worldId: 'w-1',
        slug: 'scope-1785788790909',
        name: 'كأس العالم',
      });
    });

    it('resolves wordplay-letters scope', async () => {
      const mockRepo = {
        findBySlugInWorld: jest
          .fn()
          .mockImplementation(async (worldId: string, slug: string) => {
            if (slug === 'wordplay-letters') {
              return {
                _id: 's-wp',
                worldId,
                slug: 'wordplay-letters',
                name: 'تلاعب بالكلمات',
              };
            }
            return null;
          }),
      };

      const result = await resolveCanonicalScope(
        mockRepo,
        'w-puzzles',
        'wordplay-letters',
      );
      expect(result).toBeDefined();
      expect(result?.slug).toBe('wordplay-letters');
    });

    it('strictly confines scope resolution to the requested worldId', async () => {
      const mockRepo = {
        findBySlugInWorld: jest
          .fn()
          .mockImplementation(async (worldId: string, slug: string) => {
            if (worldId === 'w-football' && slug === 'world-cup') {
              return {
                _id: 's-football-wc',
                worldId: 'w-football',
                slug: 'world-cup',
              };
            }
            return null;
          }),
      };

      const resolvedInFootball = await resolveCanonicalScope(
        mockRepo,
        'w-football',
        'world-cup',
      );
      expect(resolvedInFootball).toBeDefined();
      expect(resolvedInFootball?._id).toBe('s-football-wc');

      // Attempting to resolve in a different world fails
      const resolvedInAnime = await resolveCanonicalScope(
        mockRepo,
        'w-anime',
        'world-cup',
      );
      expect(resolvedInAnime).toBeNull();
    });
  });

  describe('ChallengeType Resolution', () => {
    it('resolves read-your-opponent and arabic aliases', async () => {
      const mockRepo = {
        findBySlug: jest.fn().mockImplementation(async (slug: string) => {
          if (slug === 'read-your-opponent') {
            return {
              _id: 'ct-ryo',
              slug: 'read-your-opponent',
              name: 'اقرأ خصمك',
            };
          }
          return null;
        }),
      };

      const result1 = await resolveCanonicalChallengeType(
        mockRepo,
        'read-your-opponent',
      );
      expect(result1).toBeDefined();
      expect(result1?.slug).toBe('read-your-opponent');

      const result2 = await resolveCanonicalChallengeType(
        mockRepo,
        'اقرأ خصمك',
      );
      expect(result2).toBeDefined();
      expect(result2?.slug).toBe('read-your-opponent');
    });
  });
});
