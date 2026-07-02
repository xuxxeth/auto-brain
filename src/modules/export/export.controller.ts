import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { ExportService } from './export.service';

@Controller('exports')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('preview')
  async previewDailyData() {
    const dataset = await this.exportService.getDailyDataset();
    return {
      totalRaw: dataset.rawData.length,
      totalClean: dataset.cleanData.length,
      totalScored: dataset.scoreData.length,
      totalNeedsReview: dataset.scoreData.filter((item) => item.needsReview).length,
      summary: dataset.summaryData,
      topCandidates: dataset.scoreData
        .slice()
        .sort((a, b) => b.scoreTotal - a.scoreTotal)
        .slice(0, 5),
    };
  }

  @Get('daily.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async downloadDailyExcel(@Res() res: Response): Promise<void> {
    const buffer = await this.exportService.generateDailyExcel();
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `autobrain_daily_${date}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }
}
