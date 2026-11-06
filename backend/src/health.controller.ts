import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

const GIT_SHA = /^[0-9a-f]{7,40}$/i;

/**
 * The Git commit this process was deployed from, or null.
 *
 * Render sets RENDER_GIT_COMMIT ("the commit SHA for a service or deploy") for
 * every runtime. Only a well-formed SHA is reported — never the raw variable —
 * so a misconfigured value cannot leak anything else through /health. The
 * repository is public, so a commit SHA discloses nothing new.
 */
export function deployedCommit(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.RENDER_GIT_COMMIT?.trim();
  return value && GIT_SHA.test(value) ? value.toLowerCase() : null;
}

@ApiExcludeController()
@Controller('health')
export class HealthController {
  // Fixed for the life of the process: it is the code that is running.
  private readonly commit = deployedCommit();

  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * A 200 proves the service and its database answer; `commit` says which code
   * answered. A healthy response with the wrong commit is a stale deploy.
   */
  @Get()
  async check() {
    try {
      await this.connection.db?.admin().ping();
      return { status: 'ok', database: 'connected', commit: this.commit };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: 'disconnected',
        commit: this.commit,
      });
    }
  }
}
