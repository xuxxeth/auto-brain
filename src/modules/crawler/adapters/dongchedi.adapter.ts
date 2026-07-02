import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { RawListing } from '../../../common/types/listing.types';
import { CrawlerAdapter } from './crawler-adapter';
import { OcrService } from '../ocr/ocr.service';

@Injectable()
export class DongchediAdapter implements CrawlerAdapter {
  readonly platform = '懂车帝';
  private readonly logger = new Logger(DongchediAdapter.name);
  private readonly searchUrl = 'https://www.dongchedi.com/usedcar/24165595';
  private readonly statePath = path.join(process.cwd(), 'state', 'dongchedi.json');
  private readonly knownCities = ['苏州', '上海', '杭州', '南京', '北京', '广州', '深圳', '海口'];

  constructor(private readonly ocrService: OcrService) {}

  async crawl(): Promise<RawListing[]> {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const contextOptions: BrowserContextOptions = {
        viewport: { width: 1440, height: 900 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      };

      if (fs.existsSync(this.statePath)) {
        contextOptions.storageState = this.statePath;
      } else {
        this.logger.warn(`Login state file not found at ${this.statePath}. Run manual login bootstrap first.`);
      }

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      await page.goto(this.searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2500);

      if (await this.requiresManualVerification(page)) {
        this.logger.warn('Dongchedi login/captcha detected, skip this platform in current run.');
        return [];
      }

      const screenshotPath = await this.captureFullPageScreenshot(page);
      const { text, confidence } = await this.ocrService.recognizeImage(screenshotPath);
      const results = this.toRawListingsFromOcr(text, confidence);
      this.logger.log(`Dongchedi parsed ${results.length} listings from full-page OCR.`);
      return results;
    } catch (error) {
      this.logger.warn(`Dongchedi crawl failed and will be skipped: ${String(error)}`);
      return [];
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }

  private async requiresManualVerification(page: Page): Promise<boolean> {
    const html = await page.content();
    const lower = html.toLowerCase();

    const keywordHit =
      lower.includes('验证码') ||
      lower.includes('captcha') ||
      lower.includes('滑块') ||
      lower.includes('请先登录') ||
      lower.includes('立即登录');
    if (keywordHit) return true;

    const loginButtonVisible = await page
      .locator('text=/登录|立即登录/')
      .first()
      .isVisible()
      .catch(() => false);
    return loginButtonVisible;
  }

  private toRawListingsFromOcr(rawText: string, confidence: number): RawListing[] {
    const compact = rawText.replace(/\s+/g, '');
    if (!compact || !compact.includes('小鹏')) return [];

    const modelPattern = /小鹏(?:MONA)?M0?3/gi;
    const matches = [...compact.matchAll(modelPattern)];
    if (matches.length === 0) return [];

    const chunks: string[] = [];
    for (let index = 0; index < matches.length; index += 1) {
      const start = matches[index].index ?? 0;
      const end = index < matches.length - 1 ? matches[index + 1].index ?? compact.length : compact.length;
      chunks.push(compact.slice(start, end));
    }

    const dedupe = new Set<string>();
    const results: RawListing[] = [];
    for (const chunk of chunks) {
      const row = this.toRawListingFromOcrChunk(chunk, confidence);
      if (!row) continue;
      const key = `${row.model}|${row.priceWan}|${row.registerDate}|${row.city}`;
      if (!dedupe.has(key)) {
        dedupe.add(key);
        results.push(row);
      }
    }
    return results;
  }

  private toRawListingFromOcrChunk(compact: string, confidence: number): RawListing | null {
    const modelMatch = compact.match(/小鹏(?:MONA)?M0?3[^\n,，。;；]*/i);
    const model = modelMatch?.[0]?.replace(/\s+/g, '') || '小鹏 M03';

    const priceMatch = compact.match(/(0|[1-9]\d?)(?:\.(\d{1,2}))?万/);
    const priceWan = priceMatch ? Number(priceMatch[0].replace('万', '')) : 0;

    const mileageMatch = compact.match(/(\d+(?:\.\d+)?)万公里/);
    const mileageKm = mileageMatch ? Math.round(Number(mileageMatch[1]) * 10000) : 0;

    const registerMatch = compact.match(/(20\d{2})年(\d{1,2})月上牌/);
    const registerDate = registerMatch
      ? `${registerMatch[1]}-${String(Number(registerMatch[2])).padStart(2, '0')}`
      : '2024-01';

    const cityCandidates = this.knownCities.filter((city) => compact.includes(city));
    const city = cityCandidates[0] ?? '苏州';

    const hasMajorAccident = /重大事故|事故车|火烧|泡水/.test(compact);
    if (priceWan <= 0) return null;

    const needsReview = confidence < 88 || !registerMatch || cityCandidates.length !== 1 || mileageKm <= 0;

    return {
      platform: this.platform,
      model,
      priceWan,
      city,
      mileageKm,
      registerDate,
      hasMajorAccident,
      url: this.searchUrl,
      rawText: compact,
      ocrConfidence: confidence,
      needsReview,
    };
  }

  private async captureFullPageScreenshot(page: Page): Promise<string> {
    const outputDir = path.join(process.cwd(), 'ocr');
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `dongchedi_fullpage_${stamp}.png`);
    await page.screenshot({ path: outputPath, fullPage: true });
    this.logger.log(`Saved full-page screenshot: ${outputPath}`);
    return outputPath;
  }
}
