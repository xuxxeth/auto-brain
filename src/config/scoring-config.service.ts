import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ScoringConfig {
  weights: {
    price: number;
    mileage: number;
    age: number;
    quality: number;
    liquidity: number;
  };
  idealAnnualMileageKm: number;
  thresholds: {
    aMin: number;
    bMin: number;
    cMin: number;
  };
}

const defaultConfig: ScoringConfig = {
  weights: {
    price: 40,
    mileage: 20,
    age: 15,
    quality: 15,
    liquidity: 10,
  },
  idealAnnualMileageKm: 15000,
  thresholds: {
    aMin: 80,
    bMin: 65,
    cMin: 50,
  },
};

@Injectable()
export class ScoringConfigService {
  private readonly logger = new Logger(ScoringConfigService.name);

  getConfig(): ScoringConfig {
    const configPath = path.join(process.cwd(), 'config', 'scoring.weights.json');

    try {
      if (!fs.existsSync(configPath)) {
        this.logger.warn('scoring.weights.json not found, using default config');
        return defaultConfig;
      }

      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ScoringConfig>;

      return {
        weights: {
          ...defaultConfig.weights,
          ...(parsed.weights ?? {}),
        },
        idealAnnualMileageKm: parsed.idealAnnualMileageKm ?? defaultConfig.idealAnnualMileageKm,
        thresholds: {
          ...defaultConfig.thresholds,
          ...(parsed.thresholds ?? {}),
        },
      };
    } catch (error) {
      this.logger.warn(`failed to parse scoring config, using default: ${String(error)}`);
      return defaultConfig;
    }
  }
}
