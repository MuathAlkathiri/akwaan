import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigService } from '@nestjs/config';
import { WigoloClient } from './wigolo-client';

const connect = jest.fn();
const listTools = jest.fn();

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({ connect, listTools })),
}));

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: jest.fn().mockImplementation((options) => options),
}));

function executable(root: string, relative = 'wigolo') {
  const file = join(root, relative);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, '#!/bin/sh\necho wigolo 0.2.0\n');
  chmodSync(file, 0o755);
  return file;
}

function client(env: Record<string, string | undefined> = {}) {
  return new WigoloClient(new ConfigService(env));
}

async function runtime(env: Record<string, string | undefined> = {}) {
  const info = await client(env).runtimeInfo();
  return info;
}

describe('WigoloClient executable resolution', () => {
  const originalCwd = process.cwd();
  const originalPath = process.env.PATH;

  beforeEach(() => {
    jest.clearAllMocks();
    connect.mockResolvedValue(undefined);
    listTools.mockResolvedValue({
      tools: ['research', 'search', 'fetch', 'extract', 'agent'].map(
        (name) => ({
          name,
          inputSchema: { required: [], properties: {} },
        }),
      ),
    });
    process.env.PATH = originalPath;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env.PATH = originalPath;
  });

  it('uses explicit WIGOLO_EXECUTABLE_PATH first', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wigolo-explicit-'));
    const bin = executable(root);

    const info = await runtime({ WIGOLO_EXECUTABLE_PATH: bin });

    expect(info.installationType).toBe('executable-path');
    expect(info.commandBasename).toBe('wigolo');
  });

  it('passes configured Wigolo cache location to the child process', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wigolo-cache-env-'));
    const bin = executable(root);

    const info = await runtime({
      WIGOLO_EXECUTABLE_PATH: bin,
      WIGOLO_CACHE_FILE: join(root, '.cache/entity-verification.json'),
    });

    expect(info.envNames).toContain('WIGOLO_CACHE_FILE');
  });

  it('uses a Docker-style /app node_modules executable when configured explicitly', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wigolo-docker-style-'));
    const bin = executable(root, 'app/node_modules/.bin/wigolo');

    const info = await runtime({ WIGOLO_EXECUTABLE_PATH: bin });

    expect(info.installationType).toBe('executable-path');
    expect(info.commandBasename).toBe('wigolo');
  });

  it('falls back to a repository-local node_modules executable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wigolo-local-'));
    executable(root, 'node_modules/.bin/wigolo');
    process.chdir(root);

    const info = await runtime();

    expect(info.installationType).toBe('project-local');
    expect(info.commandBasename).toBe('wigolo');
  });

  it('accepts an executable symlink from node_modules/.bin', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wigolo-symlink-'));
    const target = executable(root, 'node_modules/wigolo/dist/index.js');
    mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
    symlinkSync(target, join(root, 'node_modules/.bin/wigolo'));
    process.chdir(root);

    const info = await runtime();

    expect(info.installationType).toBe('project-local');
    expect(info.commandBasename).toBe('wigolo');
  });

  it('falls back to wigolo from PATH when no local executable exists', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wigolo-path-'));
    process.chdir(root);
    const wigolo = client();
    jest
      .spyOn(
        wigolo as unknown as {
          projectLocalExecutable: () => string | undefined;
        },
        'projectLocalExecutable',
      )
      .mockReturnValue(undefined);
    jest
      .spyOn(
        wigolo as unknown as { projectLocalBin: () => string | undefined },
        'projectLocalBin',
      )
      .mockReturnValue(undefined);

    const info = await wigolo.runtimeInfo();

    expect(info.installationType).toBe('path');
    expect(info.commandBasename).toBe('wigolo');
  });

  it('reports missing explicit executable safely', async () => {
    const result = await client({
      WIGOLO_EXECUTABLE_PATH: join(tmpdir(), 'missing-wigolo-bin'),
    }).readiness();

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.issueCodes).toEqual(['WIGOLO_EXECUTABLE_NOT_FOUND']);
    expect(JSON.stringify(result)).not.toContain(tmpdir());
  });

  it('reports invalid explicit executable safely', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wigolo-invalid-'));
    const invalid = join(root, 'wigolo');
    writeFileSync(invalid, '#!/bin/sh\necho nope\n');
    chmodSync(invalid, 0o644);

    const result = await client({
      WIGOLO_EXECUTABLE_PATH: invalid,
    }).readiness();

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.issueCodes).toEqual(['WIGOLO_EXECUTABLE_NOT_RUNNABLE']);
    expect(JSON.stringify(result)).not.toContain(root);
  });

  it('reports ready after successful executable resolution and tool discovery', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wigolo-ready-'));
    const bin = executable(root);

    const result = await client({ WIGOLO_EXECUTABLE_PATH: bin }).readiness();

    expect(result).toMatchObject({
      status: 'READY',
      installationType: 'executable-path',
      requiredToolsAvailable: true,
      cacheAvailable: true,
      issueCodes: [],
    });
  });

  it('distinguishes MCP initialization failure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wigolo-mcp-fail-'));
    const bin = executable(root);
    connect.mockRejectedValueOnce(new Error('boom'));

    const result = await client({ WIGOLO_EXECUTABLE_PATH: bin }).readiness();

    expect(result.status).toBe('UNAVAILABLE');
    expect(result.issueCodes).toEqual(['WIGOLO_MCP_INITIALIZATION_FAILED']);
  });
});
