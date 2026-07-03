import { Injectable } from '@nestjs/common';
import { CleanListing, RawListing } from '../../common/types/listing.types';

@Injectable()
export class PipelineService {
  clean(listings: RawListing[]): CleanListing[] {
    return listings
      .filter((item) => item.priceWan > 0 && item.mileageKm >= 0)
      .map((item) => {
        const parsed = this.parseModel(item.model);
        const ageMonth = this.calcAgeMonth(item.registerDate);
        const annualMileageKm = ageMonth <= 0 ? item.mileageKm : Math.round((item.mileageKm * 12) / ageMonth);

        return {
          platform: item.platform,
          brandStd: parsed.brandStd,
          modelStd: parsed.modelStd,
          yearStd: parsed.yearStd,
          configStd: parsed.configStd,
          priceWan: item.priceWan,
          cityStd: item.city.trim(),
          mileageKm: item.mileageKm,
          registerDate: item.registerDate,
          ageMonth,
          annualMileageKm,
          hasMajorAccident: item.hasMajorAccident,
          url: item.url,
          rawText: item.rawText,
          ocrConfidence: item.ocrConfidence,
          needsReview: Boolean(item.needsReview),
        };
      });
  }

  private parseModel(model: string): {
    brandStd: string;
    modelStd: string;
    yearStd: number;
    configStd: string;
  } {
    const normalized = model.replace(/\s+/g, '').trim();
    return {
      brandStd: normalized,
      modelStd: normalized,
      yearStd: new Date().getFullYear(),
      configStd: normalized,
    };
  }

  private calcAgeMonth(registerDate: string): number {
    const [year, month] = registerDate.split('-').map((v) => Number(v));
    if (!year || !month) return 0;

    const now = new Date();
    const months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
    return Math.max(months, 0);
  }
}
