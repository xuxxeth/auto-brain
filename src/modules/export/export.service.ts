import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { CrawlerService } from '../crawler/crawler.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { ScoringService } from '../scoring/scoring.service';

@Injectable()
export class ExportService {
  constructor(
    private readonly crawlerService: CrawlerService,
    private readonly pipelineService: PipelineService,
    private readonly scoringService: ScoringService,
  ) {}

  async getDailyDataset() {
    const rawData = await this.crawlerService.crawlListings();
    const cleanData = this.pipelineService.clean(rawData);
    const scoreData = this.scoringService.score(cleanData);
    const summaryData = this.scoringService.summarize(scoreData);

    return {
      rawData,
      cleanData,
      scoreData,
      summaryData,
    };
  }

  async generateDailyExcel(): Promise<Buffer> {
    const { rawData, cleanData, scoreData, summaryData } = await this.getDailyDataset();

    const workbook = new ExcelJS.Workbook();

    const rawSheet = workbook.addWorksheet('raw_data');
    rawSheet.columns = [
      { header: '平台', key: 'platform', width: 12 },
      { header: '车型(去空格)', key: 'model', width: 24 },
      { header: '车型(原始)', key: 'modelRaw', width: 24 },
      { header: '价格(万)', key: 'priceWan', width: 12 },
      { header: '车源地', key: 'sourceLocation', width: 12 },
      { header: '行驶里程(km)', key: 'mileageKm', width: 14 },
      { header: '首次上牌时间', key: 'registerDate', width: 14 },
      { header: '重大事故', key: 'hasMajorAccident', width: 12 },
      { header: 'OCR置信度', key: 'ocrConfidence', width: 12 },
      { header: '需复核', key: 'needsReview', width: 10 },
      { header: '详情链接', key: 'url', width: 40 },
    ];
    rawSheet.addRows(rawData);

    const cleanSheet = workbook.addWorksheet('clean_data');
    cleanSheet.columns = [
      { header: '平台', key: 'platform', width: 12 },
      { header: '品牌', key: 'brandStd', width: 10 },
      { header: '标准车型', key: 'modelStd', width: 12 },
      { header: '年款', key: 'yearStd', width: 10 },
      { header: '配置', key: 'configStd', width: 10 },
      { header: '价格(万)', key: 'priceWan', width: 12 },
      { header: '车源地', key: 'sourceLocationStd', width: 12 },
      { header: '里程(km)', key: 'mileageKm', width: 12 },
      { header: '上牌时间', key: 'registerDate', width: 12 },
      { header: '车龄(月)', key: 'ageMonth', width: 10 },
      { header: '年均里程(km)', key: 'annualMileageKm', width: 14 },
      { header: '重大事故', key: 'hasMajorAccident', width: 12 },
      { header: 'OCR置信度', key: 'ocrConfidence', width: 12 },
      { header: '需复核', key: 'needsReview', width: 10 },
      { header: '详情链接', key: 'url', width: 40 },
    ];
    cleanSheet.addRows(cleanData);

    const scoreSheet = workbook.addWorksheet('score_result');
    scoreSheet.columns = [
      { header: '平台', key: 'platform', width: 12 },
      { header: '标准车型', key: 'modelStd', width: 12 },
      { header: '价格(万)', key: 'priceWan', width: 12 },
      { header: '总分', key: 'scoreTotal', width: 10 },
      { header: '评级', key: 'rating', width: 8 },
      { header: '建议', key: 'decision', width: 12 },
      { header: '价格分', key: 'scorePrice', width: 8 },
      { header: '里程分', key: 'scoreMileage', width: 8 },
      { header: '车龄分', key: 'scoreAge', width: 8 },
      { header: '车况分', key: 'scoreQuality', width: 8 },
      { header: '流动性分', key: 'scoreLiquidity', width: 9 },
      { header: '需复核', key: 'needsReview', width: 10 },
      { header: '评分解释', key: 'scoreReason', width: 52 },
    ];
    scoreSheet.addRows(scoreData);

    const needsReviewSheet = workbook.addWorksheet('needs_review');
    needsReviewSheet.columns = [
      { header: '平台', key: 'platform', width: 12 },
      { header: '标准车型', key: 'modelStd', width: 12 },
      { header: '价格(万)', key: 'priceWan', width: 12 },
      { header: '车源地', key: 'sourceLocationStd', width: 12 },
      { header: '里程(km)', key: 'mileageKm', width: 12 },
      { header: '上牌时间', key: 'registerDate', width: 12 },
      { header: 'OCR置信度', key: 'ocrConfidence', width: 12 },
      { header: '建议', key: 'decision', width: 12 },
      { header: '评分解释', key: 'scoreReason', width: 52 },
    ];
    needsReviewSheet.addRows(scoreData.filter((row) => row.needsReview));

    const summarySheet = workbook.addWorksheet('daily_summary');
    summarySheet.columns = [
      { header: '车源地', key: 'sourceLocation', width: 12 },
      { header: '车型', key: 'model', width: 12 },
      { header: '均价(万)', key: 'avgPriceWan', width: 12 },
      { header: '最低价(万)', key: 'minPriceWan', width: 12 },
      { header: '中位价(万)', key: 'medianPriceWan', width: 12 },
      { header: '最高价(万)', key: 'maxPriceWan', width: 12 },
      { header: '推荐数量(A/B)', key: 'recommendCount', width: 14 },
    ];
    summarySheet.addRows(summaryData);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
