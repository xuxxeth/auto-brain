import { Module } from '@nestjs/common';
import { ScoringConfigService } from '../../config/scoring-config.service';
import { ScoringService } from './scoring.service';

@Module({
  providers: [ScoringConfigService, ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
