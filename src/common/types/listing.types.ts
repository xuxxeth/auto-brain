export interface RawListing {
  platform: string;
  model: string;
  priceWan: number;
  city: string;
  mileageKm: number;
  registerDate: string; // yyyy-mm
  hasMajorAccident: boolean;
  url?: string;
  rawText?: string;
  ocrConfidence?: number;
  needsReview?: boolean;
}

export interface CleanListing {
  platform: string;
  brandStd: string;
  modelStd: string;
  yearStd: number;
  configStd: string;
  priceWan: number;
  cityStd: string;
  mileageKm: number;
  registerDate: string;
  ageMonth: number;
  annualMileageKm: number;
  hasMajorAccident: boolean;
  url?: string;
  rawText?: string;
  ocrConfidence?: number;
  needsReview?: boolean;
}

export interface ScoredListing extends CleanListing {
  scorePrice: number;
  scoreMileage: number;
  scoreAge: number;
  scoreQuality: number;
  scoreLiquidity: number;
  scoreTotal: number;
  rating: 'A' | 'B' | 'C' | 'D';
  decision: '优先跟进' | '可谈价' | '人工复核' | '不建议';
  scoreReason: string;
}

export interface DailySummaryRow {
  city: string;
  model: string;
  avgPriceWan: number;
  minPriceWan: number;
  medianPriceWan: number;
  maxPriceWan: number;
  recommendCount: number;
}
