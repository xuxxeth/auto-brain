import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { CrawlerModule } from '../crawler/crawler.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [CrawlerModule, PipelineModule, ScoringModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
