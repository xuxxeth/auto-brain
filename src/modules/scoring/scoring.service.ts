import { Injectable } from '@nestjs/common';
import { ScoringConfigService } from '../../config/scoring-config.service';
import { CleanListing, DailySummaryRow, ScoredListing } from '../../common/types/listing.types';

@Injectable()
export class ScoringService {
  constructor(private readonly scoringConfigService: ScoringConfigService) {}

  score(listings: CleanListing[]): ScoredListing[] {
    const config = this.scoringConfigService.getConfig();
    const median = this.medianPrice(listings);

    return listings.map((item) => {
      const priceDiff = median <= 0 ? 0 : (median - item.priceWan) / median;
      const scorePrice = this.clamp(config.weights.price / 2 + priceDiff * 120, 0, config.weights.price);

      const mileageRatio =
        Math.abs(item.annualMileageKm - config.idealAnnualMileageKm) / config.idealAnnualMileageKm;
      const scoreMileage = this.clamp(
        config.weights.mileage - mileageRatio * config.weights.mileage,
        0,
        config.weights.mileage,
      );

      const ageYears = item.ageMonth / 12;
      const scoreAge = this.clamp(config.weights.age - ageYears * 3, 0, config.weights.age);

      const scoreQuality = item.hasMajorAccident ? 2 : config.weights.quality;
      const scoreLiquidity = config.weights.liquidity;

      const scoreTotal = Math.round(scorePrice + scoreMileage + scoreAge + scoreQuality + scoreLiquidity);
      const { rating, decision } = this.toDecision(scoreTotal, config.thresholds);
      const finalDecision = item.needsReview ? '人工复核' : decision;

      return {
        ...item,
        scorePrice: Math.round(scorePrice),
        scoreMileage: Math.round(scoreMileage),
        scoreAge: Math.round(scoreAge),
        scoreQuality,
        scoreLiquidity,
        scoreTotal,
        rating,
        decision: finalDecision,
        scoreReason: `价格${Math.round(scorePrice)} 里程${Math.round(scoreMileage)} 车龄${Math.round(scoreAge)} 车况${scoreQuality} 流动性${scoreLiquidity}`,
      };
    });
  }

  summarize(listings: ScoredListing[]): DailySummaryRow[] {
    const groups = new Map<string, ScoredListing[]>();

    for (const item of listings) {
      const key = `${item.sourceLocationStd}__${item.modelStd}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(item);
      groups.set(key, bucket);
    }

    return [...groups.values()].map((items) => {
      const prices = items.map((item) => item.priceWan);
      return {
        sourceLocation: items[0].sourceLocationStd,
        model: items[0].modelStd,
        avgPriceWan: this.round(this.avg(prices)),
        minPriceWan: this.round(Math.min(...prices)),
        medianPriceWan: this.round(this.median(prices)),
        maxPriceWan: this.round(Math.max(...prices)),
        recommendCount: items.filter((item) => item.rating === 'A' || item.rating === 'B').length,
      };
    });
  }

  private toDecision(
    score: number,
    thresholds: { aMin: number; bMin: number; cMin: number },
  ): Pick<ScoredListing, 'rating' | 'decision'> {
    if (score >= thresholds.aMin) return { rating: 'A', decision: '优先跟进' };
    if (score >= thresholds.bMin) return { rating: 'B', decision: '可谈价' };
    if (score >= thresholds.cMin) return { rating: 'C', decision: '人工复核' };
    return { rating: 'D', decision: '不建议' };
  }

  private medianPrice(listings: CleanListing[]): number {
    return this.median(listings.map((item) => item.priceWan));
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  private avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private round(value: number): number {
    return Number(value.toFixed(2));
  }
}
