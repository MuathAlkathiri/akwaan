import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFile } from 'node:child_process';
import {
  constants,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  accessSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

type JsonObject = Record<string, unknown>;
type WigoloInstallationType =
  'configured' | 'executable-path' | 'project-local' | 'path';
type WigoloRuntimeIssueCode =
  | 'WIGOLO_EXECUTABLE_NOT_FOUND'
  | 'WIGOLO_EXECUTABLE_NOT_RUNNABLE'
  | 'WIGOLO_MCP_INITIALIZATION_FAILED'
  | 'WIGOLO_OPERATION_FAILED'
  | 'ENTITY_VERIFICATION_TIMEOUT';

class WigoloRuntimeError extends Error {
  constructor(
    readonly code: WigoloRuntimeIssueCode,
    message = code,
  ) {
    super(message);
  }
}

export interface WigoloToolResponse {
  data: JsonObject;
  diagnostics: WigoloResponseDiagnostics;
}

export interface WigoloResponseDiagnostics {
  isError: boolean;
  topLevelKeys: string[];
  contentBlockTypes: string[];
  contentBlockCount: number;
  textBlockLengths: number[];
  structuredContentPresent: boolean;
  resourceBlockCount: number;
  parsedJsonBlockCount: number;
  parsedJsonKeys: string[][];
}

export interface WigoloRuntimeInfo {
  installationType: WigoloInstallationType;
  version: string;
  transport: 'stdio';
  commandBasename: string;
  startupArgs: string[];
  cwdBasename?: string;
  nodeVersion: string;
  envNames: string[];
  tools: Array<{
    name: string;
    required: string[];
    inputKeys: string[];
  }>;
}

const requireFromHere = createRequire(__filename);
const execFileAsync = promisify(execFile);

@Injectable()
export class WigoloClient implements OnModuleDestroy {
  private client?: Client;
  private transport?: StdioClientTransport;
  private connecting?: Promise<Client>;
  private runtime?: {
    command: string;
    args: string[];
    installationType: WigoloInstallationType;
    version: string;
    cwd?: string;
    env: Record<string, string>;
  };
  private healthCache?: {
    value: { available: boolean; researchToolAvailable: boolean };
    expires: number;
  };

  constructor(private readonly config: ConfigService) {}

  async callTool(name: string, args: JsonObject): Promise<JsonObject> {
    return (await this.callToolDetailed(name, args)).data;
  }

  async callToolDetailed(
    name: string,
    args: JsonObject,
  ): Promise<WigoloToolResponse> {
    const timeout = this.number('WIGOLO_OPERATION_TIMEOUT_MS', 45_000);
    const result = await this.callMcpTool(name, args, timeout).catch(async () =>
      this.callOneShotTool(name, args, timeout),
    );
    return this.parseToolResult(result);
  }

  private async callMcpTool(
    name: string,
    args: JsonObject,
    timeout: number,
  ): Promise<unknown> {
    const client = await this.connect();
    return this.deadline(client.callTool({ name, arguments: args }), timeout);
  }

  private parseToolResult(result: unknown): WigoloToolResponse {
    const envelope = z
      .object({
        content: z.array(
          z
            .object({ type: z.string(), text: z.string().optional() })
            .passthrough(),
        ),
        isError: z.boolean().optional(),
        structuredContent: z.unknown().optional(),
      })
      .passthrough()
      .safeParse(result);
    if (!envelope.success) throw new Error('WIGOLO_RESPONSE_INVALID');
    const parsedBlocks = envelope.data.content
      .filter((item) => item.type === 'text' && item.text)
      .map((item) => this.parseJson(item.text ?? ''))
      .filter((item): item is JsonObject => Boolean(item));
    const parsed = parsedBlocks.find((item) => this.looksLikeToolData(item));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('WIGOLO_RESPONSE_INVALID');
    if (envelope.data.isError || 'error' in parsed)
      throw new Error('WIGOLO_OPERATION_FAILED');
    return {
      data: parsed as JsonObject,
      diagnostics: this.responseDiagnostics(envelope.data, parsedBlocks),
    };
  }

  private async callOneShotTool(
    name: string,
    args: JsonObject,
    timeout: number,
  ): Promise<unknown> {
    if (!['search', 'research'].includes(name))
      throw new WigoloRuntimeError('WIGOLO_OPERATION_FAILED');
    const runtime = this.resolveRuntime();
    const cliArgs = this.oneShotArgs(name, args);
    try {
      const { stdout } = await this.deadline(
        execFileAsync(runtime.command, cliArgs, {
          cwd: runtime.cwd,
          env: runtime.env,
          maxBuffer: this.number('WIGOLO_STDOUT_MAX_BUFFER_BYTES', 8_000_000),
          timeout,
        }),
        timeout + 1_000,
      );
      const parsed = this.parseToolJsonFromStdout(stdout);
      if (!parsed) throw new Error('WIGOLO_RESPONSE_INVALID');
      return { content: [{ type: 'text', text: JSON.stringify(parsed) }] };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('ENTITY_VERIFICATION_TIMEOUT')
      )
        throw error;
      throw new WigoloRuntimeError('WIGOLO_OPERATION_FAILED');
    }
  }

  private oneShotArgs(name: string, args: JsonObject): string[] {
    if (name === 'search') {
      return [
        'search',
        this.primaryQuery(args.query),
        '--json',
        '--max-results',
        String(this.positiveInt(args.max_results, 8)),
      ];
    }
    return [
      'research',
      String(args.question ?? ''),
      '--json',
      '--max-sources',
      String(this.positiveInt(args.max_sources, 8)),
    ];
  }

  private primaryQuery(value: unknown): string {
    if (Array.isArray(value))
      return value.filter((item) => typeof item === 'string').join(' ');
    return typeof value === 'string' ? value : '';
  }

  private positiveInt(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }

  private parseToolJsonFromStdout(stdout: string): JsonObject | undefined {
    const parsedObjects: JsonObject[] = [];
    for (let index = 0; index < stdout.length; index += 1) {
      if (stdout[index] !== '{') continue;
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let cursor = index; cursor < stdout.length; cursor += 1) {
        const char = stdout[cursor];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === '\\') {
            escaped = true;
          } else if (char === '"') {
            inString = false;
          }
          continue;
        }
        if (char === '"') {
          inString = true;
          continue;
        }
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        if (depth === 0) {
          const parsed = this.parseJson(stdout.slice(index, cursor + 1));
          if (parsed) parsedObjects.push(parsed);
          index = cursor;
          break;
        }
      }
    }
    return parsedObjects.reverse().find((item) => this.looksLikeToolData(item));
  }

  async health(): Promise<{
    available: boolean;
    researchToolAvailable: boolean;
  }> {
    if (this.healthCache && this.healthCache.expires > Date.now())
      return this.healthCache.value;
    try {
      const client = await this.connect();
      const listed = await this.deadline(
        client.listTools(),
        this.number('WIGOLO_CONNECTION_TIMEOUT_MS', 30_000),
      );
      const value = {
        available: true,
        researchToolAvailable: listed.tools.some(
          (tool) => tool.name === 'research',
        ),
      };
      this.healthCache = { value, expires: Date.now() + 30_000 };
      return value;
    } catch {
      return { available: false, researchToolAvailable: false };
    }
  }

  async readiness(): Promise<{
    provider: 'wigolo';
    enabled: boolean;
    status: 'READY' | 'DEGRADED' | 'UNAVAILABLE';
    version?: string;
    installationType?: WigoloInstallationType;
    transport?: 'stdio';
    requiredToolsAvailable: boolean;
    cacheAvailable: boolean;
    lastCheckedAt: string;
    issueCodes: string[];
  }> {
    const enabled = this.enabled();
    const checkedAt = new Date().toISOString();
    if (!enabled) {
      return {
        provider: 'wigolo',
        enabled,
        status: 'UNAVAILABLE',
        requiredToolsAvailable: false,
        cacheAvailable: false,
        lastCheckedAt: checkedAt,
        issueCodes: ['WIGOLO_TRANSPORT_UNAVAILABLE'],
      };
    }
    try {
      const info = await this.runtimeInfo();
      const required = ['research', 'search', 'fetch', 'extract', 'agent'];
      const names = new Set(info.tools.map((tool) => tool.name));
      const requiredToolsAvailable = required.every((tool) => names.has(tool));
      return {
        provider: 'wigolo',
        enabled,
        status: requiredToolsAvailable ? 'READY' : 'DEGRADED',
        version: info.version,
        installationType: info.installationType,
        transport: info.transport,
        requiredToolsAvailable,
        cacheAvailable: true,
        lastCheckedAt: checkedAt,
        issueCodes: requiredToolsAvailable
          ? []
          : ['WIGOLO_REQUIRED_TOOL_MISSING'],
      };
    } catch (error) {
      const timeout =
        error instanceof Error && error.message.includes('TIMEOUT');
      const runtimeCode =
        error instanceof WigoloRuntimeError ? error.code : undefined;
      return {
        provider: 'wigolo',
        enabled,
        status: 'UNAVAILABLE',
        requiredToolsAvailable: false,
        cacheAvailable: false,
        lastCheckedAt: checkedAt,
        issueCodes: [
          runtimeCode ??
            (timeout
              ? 'ENTITY_VERIFICATION_TIMEOUT'
              : 'WIGOLO_OPERATION_FAILED'),
        ],
      };
    }
  }

  async runtimeInfo(): Promise<WigoloRuntimeInfo> {
    const client = await this.connect();
    const runtime = this.resolveRuntime();
    const listed = await this.deadline(
      client.listTools(),
      this.number('WIGOLO_CONNECTION_TIMEOUT_MS', 30_000),
    );
    return {
      installationType: runtime.installationType,
      version: runtime.version,
      transport: 'stdio',
      commandBasename: runtime.command.split('/').pop() ?? runtime.command,
      startupArgs: runtime.args.map((arg) => arg.split('/').pop() ?? arg),
      cwdBasename: runtime.cwd?.split('/').pop(),
      nodeVersion: process.version,
      envNames: Object.keys(runtime.env).sort(),
      tools: listed.tools.map((tool) => ({
        name: tool.name,
        required: Array.isArray(tool.inputSchema.required)
          ? tool.inputSchema.required.filter(
              (item): item is string => typeof item === 'string',
            )
          : [],
        inputKeys: Object.keys(tool.inputSchema.properties ?? {}),
      })),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.transport?.close().catch(() => undefined);
  }

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      if (!this.enabled()) throw new Error('WIGOLO_TRANSPORT_UNAVAILABLE');
      const runtime = this.resolveRuntime();
      const transport = new StdioClientTransport({
        command: runtime.command,
        args: runtime.args,
        cwd: runtime.cwd,
        env: runtime.env,
        stderr: 'pipe',
      });
      const client = new Client({
        name: 'lammah-entity-verification',
        version: '1.0.0',
      });
      try {
        await this.deadline(
          client.connect(transport),
          this.number('WIGOLO_CONNECTION_TIMEOUT_MS', 30_000),
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('ENTITY_VERIFICATION_TIMEOUT')
        )
          throw error;
        throw new WigoloRuntimeError('WIGOLO_MCP_INITIALIZATION_FAILED');
      }
      this.transport = transport;
      this.client = client;
      return client;
    })();
    try {
      return await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private parseArgs(value: string): string[] {
    return value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
  }
  private resolveRuntime(): {
    command: string;
    args: string[];
    installationType: WigoloInstallationType;
    version: string;
    cwd?: string;
    env: Record<string, string>;
  } {
    if (this.runtime) return this.runtime;
    const executablePath = this.config
      .get<string>('WIGOLO_EXECUTABLE_PATH')
      ?.trim();
    if (executablePath) {
      const executable = this.validateExecutablePath(executablePath);
      this.runtime = {
        command: executable,
        args: [],
        installationType: 'executable-path',
        version: this.packageVersion(),
        cwd: process.cwd(),
        env: this.safeEnv(),
      };
      return this.runtime;
    }

    const configured = this.config.get<string>('WIGOLO_COMMAND')?.trim();
    const configuredArgs = this.parseArgs(
      this.config.get<string>('WIGOLO_COMMAND_ARGS') ?? '',
    );
    if (configured) {
      const command = configured.includes('/')
        ? this.validateExecutablePath(configured)
        : configured;
      this.runtime = {
        command,
        args: configuredArgs,
        installationType: 'configured',
        version: this.packageVersion(),
        cwd: process.cwd(),
        env: this.safeEnv(),
      };
      return this.runtime;
    }
    const localExecutable = this.projectLocalExecutable();
    if (localExecutable) {
      this.runtime = {
        command: localExecutable,
        args: [],
        installationType: 'project-local',
        version: this.packageVersion(),
        cwd: process.cwd(),
        env: this.safeEnv(),
      };
      return this.runtime;
    }
    const localBin = this.projectLocalBin();
    if (localBin) {
      this.runtime = {
        command: process.execPath,
        args: [localBin],
        installationType: 'project-local',
        version: this.packageVersion(),
        cwd: process.cwd(),
        env: this.safeEnv(),
      };
      return this.runtime;
    }
    this.runtime = {
      command: 'wigolo',
      args: [],
      installationType: 'path',
      version: this.packageVersion(),
      cwd: process.cwd(),
      env: this.safeEnv(),
    };
    return this.runtime;
  }
  private projectLocalExecutable(): string | undefined {
    const candidates = this.executableCandidates();
    for (const candidate of candidates) {
      const executable = this.tryExecutable(candidate);
      if (executable) return executable;
    }
    return undefined;
  }
  private executableCandidates(): string[] {
    const cwd = process.cwd();
    const packageDir = this.packageDir();
    const candidates = [
      join(cwd, 'node_modules/.bin/wigolo'),
      join(cwd, '../node_modules/.bin/wigolo'),
      join(cwd, '../../node_modules/.bin/wigolo'),
      join(dirname(__filename), '../../../../../../node_modules/.bin/wigolo'),
      packageDir ? join(dirname(packageDir), '.bin/wigolo') : '',
    ].filter(Boolean);
    return [...new Set(candidates.map((candidate) => resolve(candidate)))];
  }
  private validateExecutablePath(value: string): string {
    const executable = this.tryExecutable(resolve(value));
    if (!executable)
      throw new WigoloRuntimeError(
        existsSync(value)
          ? 'WIGOLO_EXECUTABLE_NOT_RUNNABLE'
          : 'WIGOLO_EXECUTABLE_NOT_FOUND',
      );
    return executable;
  }
  private tryExecutable(candidate: string): string | undefined {
    try {
      const link = lstatSync(candidate);
      if (!link.isFile() && !link.isSymbolicLink()) return undefined;
      const resolved = link.isSymbolicLink()
        ? realpathSync(candidate)
        : candidate;
      const stats = statSync(resolved);
      if (!stats.isFile()) return undefined;
      accessSync(resolved, constants.R_OK);
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      return undefined;
    }
  }
  private projectLocalBin(): string | undefined {
    try {
      const packageDir = this.packageDir();
      if (!packageDir) return undefined;
      const bin = join(packageDir, 'dist/index.js');
      return existsSync(bin) ? bin : undefined;
    } catch {
      return undefined;
    }
  }
  private packageVersion(): string {
    try {
      const packageDir = this.packageDir();
      if (!packageDir) return 'unknown';
      const packageJson = JSON.parse(
        readFileSync(join(packageDir, 'package.json'), 'utf8'),
      ) as {
        version?: unknown;
      };
      return typeof packageJson.version === 'string'
        ? packageJson.version
        : 'unknown';
    } catch {
      return 'unknown';
    }
  }
  private packageDir(): string | undefined {
    const paths = requireFromHere.resolve.paths('wigolo') ?? [];
    for (const modulesDir of paths) {
      const packageDir = join(modulesDir, 'wigolo');
      if (existsSync(join(packageDir, 'package.json'))) return packageDir;
    }
    return undefined;
  }
  private safeEnv(): Record<string, string> {
    const names = [
      'HOME',
      'PATH',
      'XDG_CONFIG_HOME',
      'XDG_CACHE_HOME',
      'LANG',
      'LC_ALL',
      'LC_CTYPE',
      'NODE_EXTRA_CA_CERTS',
      'SSL_CERT_FILE',
      'SSL_CERT_DIR',
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'NO_PROXY',
      'http_proxy',
      'https_proxy',
      'no_proxy',
      'WIGOLO_SEARCH',
      'WIGOLO_EXECUTABLE_PATH',
      'WIGOLO_DATA_DIR',
      'WIGOLO_CONFIG_DIR',
      'WIGOLO_CACHE_DIR',
      'WIGOLO_CACHE_FILE',
      'WIGOLO_LOCAL_LLM',
      'WIGOLO_LLM_PROVIDER',
      'WIGOLO_GITHUB_TOKEN',
      'BRAVE_API_KEY',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GOOGLE_API_KEY',
      'GROQ_API_KEY',
    ];
    return Object.fromEntries(
      names
        .map((name) => [
          name,
          this.config.get<string>(name) ?? process.env[name],
        ])
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  }
  private parseJson(text: string): JsonObject | undefined {
    try {
      const parsed: unknown = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as JsonObject)
        : undefined;
    } catch {
      return undefined;
    }
  }
  private looksLikeToolData(value: JsonObject): boolean {
    return [
      'results',
      'sources',
      'citations',
      'evidence',
      'report',
      'brief',
      'structured_output',
      'error',
    ].some((key) => key in value);
  }
  private responseDiagnostics(
    envelope: {
      content: Array<{ type: string; text?: string } & Record<string, unknown>>;
      isError?: boolean;
      structuredContent?: unknown;
    },
    parsedBlocks: JsonObject[],
  ): WigoloResponseDiagnostics {
    return {
      isError: Boolean(envelope.isError),
      topLevelKeys: Object.keys(envelope),
      contentBlockTypes: envelope.content.map((item) => item.type),
      contentBlockCount: envelope.content.length,
      textBlockLengths: envelope.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text?.length ?? 0),
      structuredContentPresent: envelope.structuredContent !== undefined,
      resourceBlockCount: envelope.content.filter(
        (item) => item.type === 'resource',
      ).length,
      parsedJsonBlockCount: parsedBlocks.length,
      parsedJsonKeys: parsedBlocks.map((item) => Object.keys(item)),
    };
  }
  private enabled(): boolean {
    return !['false', '0', 'off'].includes(
      (this.config.get<string>('WIGOLO_ENABLED') ?? 'true').toLowerCase(),
    );
  }
  private number(key: string, fallback: number): number {
    const n = Number(this.config.get<string>(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  private async deadline<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('ENTITY_VERIFICATION_TIMEOUT')),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
