import { Module } from '@nestjs/common';
import { AiAgentController } from './ai-agent.controller';
import { AdminAiGeneratorController } from './admin-ai-generator.controller';
import { WigoloClient } from './infrastructure/wigolo/wigolo-client';

/**
 * Compatibility surface for disabled generation routes and Wigolo readiness.
 * Generation-only agents and LLM providers are intentionally not registered.
 * Reusable media processing lives in AssetResolutionModule.
 */
@Module({
  providers: [WigoloClient],
  controllers: [AiAgentController, AdminAiGeneratorController],
})
export class AiAgentModule {}
