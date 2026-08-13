import { Global, Module } from '@nestjs/common';
import { AI_PROVIDER_TOKEN } from './domain/ai-provider.interface';
import { AiProviderFactory } from './infrastructure/ai-provider.factory';

@Global()
@Module({
  providers: [
    AiProviderFactory,
    {
      provide: AI_PROVIDER_TOKEN,
      inject: [AiProviderFactory],
      useFactory: (factory: AiProviderFactory) => factory.create(),
    },
  ],
  exports: [AI_PROVIDER_TOKEN, AiProviderFactory],
})
export class AiTextProviderModule {}
