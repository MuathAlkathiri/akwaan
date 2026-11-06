import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import type { Connection } from 'mongoose';
import { markStartupStep } from '../common/diagnostics/startup-diagnostics';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
        // Startup diagnostics only. @nestjs/mongoose strips both hooks before
        // building the Mongoose options, so connection settings, retries and
        // timeouts are unchanged. Nothing about the URI is logged.
        onConnectionCreate: () => markStartupStep('database: connecting'),
        connectionFactory: (connection: Connection) => {
          markStartupStep('database: connected');
          return connection;
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
