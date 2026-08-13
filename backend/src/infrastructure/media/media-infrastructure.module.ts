import { Module } from '@nestjs/common';
import { AudioProcessorService } from './audio-processor.service';
import { MediaCommandRunnerService } from './media-command-runner.service';
import { MediaInspectorService } from './media-inspector.service';

@Module({
  providers: [
    MediaCommandRunnerService,
    MediaInspectorService,
    AudioProcessorService,
  ],
  exports: [
    MediaCommandRunnerService,
    MediaInspectorService,
    AudioProcessorService,
  ],
})
export class MediaInfrastructureModule {}
