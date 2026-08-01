import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  async check() {
    try {
      await this.connection.db?.admin().ping();
      return { status: 'ok', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: 'disconnected',
      });
    }
  }
}
