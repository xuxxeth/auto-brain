import { Module } from '@nestjs/common';
import { CrawlerModule } from './modules/crawler/crawler.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { ExportModule } from './modules/export/export.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [HealthModule, CrawlerModule, PipelineModule, ScoringModule, ExportModule],
})
export class AppModule {}
