import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { RawListing } from '../../../common/types/listing.types';
import { CrawlerAdapter } from './crawler-adapter';
import { OcrService } from '../ocr/ocr.service';
const sharpLib = require('sharp');

type FieldKey = 'price';

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type FieldCropConfig = Record<FieldKey, CropRect>;
interface BaseCropConfig extends CropRect {}

@Injectable()
export class DongchediAdapter implements CrawlerAdapter {
  readonly platform = '懂车帝';
  private readonly logger = new Logger(DongchediAdapter.name);
  private readonly searchUrls = this.getSearchUrls();
  private readonly modelSelector = this.getModelSelector();
  private readonly sourceLocationSelector = this.getSourceLocationSelector();
  private readonly registerDateSelector = this.getRegisterDateSelector();
  private readonly mileageDescSelector = this.getMileageDescSelector();
  private readonly statePath = path.join(process.cwd(), 'state', 'dongchedi.json');
  private readonly knownCities = ['苏州', '上海', '杭州', '南京', '北京', '广州', '深圳', '海口'];
  private readonly baseCrop = this.getBaseCropConfig();
  private readonly cropConfig = this.getCropConfig();

  constructor(private readonly ocrService: OcrService) {}

  async crawl(): Promise<RawListing[]> {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const contextOptions: BrowserContextOptions = {
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 3,
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
      const listings: RawListing[] = [];

      for (const url of this.searchUrls) {
        this.logger.log(`Dongchedi crawling url: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2500);

        if (await this.isListingUnavailable(page)) {
          this.logger.warn(`Dongchedi listing unavailable (已售出或下架), skip url: ${url}`);
          continue;
        }

        if (await this.requiresManualVerification(page)) {
          this.logger.warn('Dongchedi login/captcha detected, skip this platform in current run.');
          break;
        }

        const screenshotTag = this.getUrlTag(url);
        const modelDomText = await this.extractModelTextFromPage(page);
        const sourceLocationDomText = await this.extractSourceLocationTextFromPage(page);
        const registerDateDomText = await this.extractRegisterDateTextFromPage(page);
        const mileageDescDomText = await this.extractMileageDescTextFromPage(page);
        const fullPath = await this.captureBaseScreenshot(page, screenshotTag);
        const fieldPaths = await this.captureFieldScreenshotsFromBase(fullPath, screenshotTag);

        const priceOcr = await this.ocrService.recognizeImage(fieldPaths.price);

        const listing = this.buildListingFromFieldTexts(
          modelDomText,
          sourceLocationDomText,
          registerDateDomText,
          mileageDescDomText,
          {
            price: priceOcr.text,
          },
          [priceOcr.confidence],
          url,
        );
        if (listing) {
          listings.push(listing);
          this.logger.log(`Dongchedi parsed 1 row from ${url}`);
        } else {
          this.logger.warn(`Dongchedi parsed 0 row from ${url}`);
        }
      }
      
      return listings;
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

  private async isListingUnavailable(page: Page): Promise<boolean> {
    const html = await page.content();
    const text = html.replace(/\s+/g, '');
    return text.includes('您访问的二手车已售出或下架') || text.includes('已售出或下架');
  }

  private async captureBaseScreenshot(page: Page, tag: string): Promise<string> {
    const outputDir = path.join(process.cwd(), 'ocr');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `dongchedi_base_${tag}.png`);

    await page.screenshot({
      path: outputPath,
      clip: {
        x: this.baseCrop.x,
        y: this.baseCrop.y,
        width: this.baseCrop.width,
        height: this.baseCrop.height,
      },
      type: 'png',
      scale: 'device',
      caret: 'hide',
      animations: 'disabled',
    });

    this.logger.log(`Saved base screenshot: ${outputPath}`);
    return outputPath;
  }

  private async captureFieldScreenshotsFromBase(baseImagePath: string, tag: string): Promise<Record<FieldKey, string>> {
    const outputDir = path.join(process.cwd(), 'ocr');
    fs.mkdirSync(outputDir, { recursive: true });

    const result = {} as Record<FieldKey, string>;
    const fields: FieldKey[] = ['price'];

    for (const field of fields) {
      const rect = this.cropConfig[field];
      const outPath = path.join(outputDir, `dongchedi_${field}_${tag}.png`);
      await sharpLib(baseImagePath)
        .extract({
          left: Math.max(0, Math.floor(rect.x)),
          top: Math.max(0, Math.floor(rect.y)),
          width: Math.max(1, Math.floor(rect.width)),
          height: Math.max(1, Math.floor(rect.height)),
        })
        .png()
        .toFile(outPath);
      result[field] = outPath;
    }

    this.logger.log(`Saved 1 field screenshot from base image at ${outputDir}`);
    return result;
  }

  private buildListingFromFieldTexts(
    modelText: string,
    sourceLocationText: string,
    registerDateText: string,
    mileageDescText: string,
    fieldText: Record<FieldKey, string>,
    confidences: number[],
    sourceUrl: string,
  ): RawListing | null {
    const modelRaw = this.extractModelRaw(modelText);
    const model = this.extractModel(modelRaw);
    const priceWan = this.extractPriceWan(fieldText.price);
    const sourceLocation = this.extractSourceLocation(sourceLocationText, '');
    const mileageKm = this.extractMileageKm(mileageDescText);
    const registerDate = this.extractRegisterDate(registerDateText);
    const hasMajorAccident = false;

    if (!model) {
      this.logger.warn(
        `Drop row: model="${model}" priceWan=${priceWan} sourceLocation="${sourceLocation}" mileageKm=${mileageKm} registerDate="${registerDate}"`,
      );
      return null;
    }

    if (priceWan <= 0) {
      this.logger.warn(`Price OCR missing, fallback priceWan=0 for url=${sourceUrl}`);
    }

    const confidence = confidences.length > 0 ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : 0;
    const needsReview = confidence < 85 || priceWan <= 0 || mileageKm <= 0 || !registerDate;

    return {
      platform: this.platform,
      model,
      modelRaw,
      priceWan,
      sourceLocation,
      mileageKm,
      registerDate,
      hasMajorAccident,
      url: sourceUrl,
      rawText: JSON.stringify({
        ...fieldText,
        sourceLocation: sourceLocationText,
        registerDate: registerDateText,
      }),
      ocrConfidence: confidence,
      needsReview,
    };
  }

  private extractModel(input: string): string {
    return this.compactModelText(input);
  }

  private extractModelRaw(input: string): string {
    return this.normalizeModelText(input);
  }

  private extractPriceWan(input: string): number {
    const compact = this.normalizeText(input).replace(/[亡方]/g, '万');
    const m = compact.match(/(\d{1,2}(?:\.\d{1,2})?)万/);
    return m ? Number(m[1]) : 0;
  }

  private extractSourceLocation(input: string, fallbackText: string): string {
    const compact = this.normalizeText(input);
    const city = this.knownCities.find((item) => compact.includes(item));
    if (city) return city;

    const fallbackCompact = this.normalizeText(fallbackText);
    const fallbackCity = this.knownCities.find((item) => fallbackCompact.includes(item));
    return fallbackCity ?? '苏州';
  }

  private extractMileageKm(input: string): number {
    const compact = this.normalizeText(input).replace(/[公旦公但]/g, '公里');
    const wan = compact.match(/(\d+(?:\.\d+)?)万公里/);
    if (wan) return Math.round(Number(wan[1]) * 10000);

    const km = compact.match(/(\d+(?:\.\d+)?)公里/);
    return km ? Math.round(Number(km[1])) : 0;
  }

  private extractRegisterDate(input: string): string {
    const compact = this.normalizeText(input).replace(/[上湖上湃上脾]/g, '上牌');
    const m = compact.match(/(20\d{2})年(\d{1,2})月/);
    if (!m) return '2024-01';
    return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`;
  }

  private normalizeLine(input: string): string {
    return (input || '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';
  }

  private normalizeText(input: string): string {
    return (input || '')
      .replace(/\s+/g, '')
      .replace(/[|丨]/g, '')
      .replace(/士对比/g, '版对比')
      .replace(/怪车帝/g, '懂车帝');
  }

  private normalizeModelText(input: string): string {
    const text = (input || '')
      .replace(/[|丨]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const preferred =
      lines.find((line) => /(款|版|型|Max|Pro|Plus)/i.test(line)) ??
      lines.find((line) => /(小鹏|比亚迪|特斯拉|蔚来|理想|问界|极氪)/.test(line)) ??
      lines[0] ??
      '';

    return preferred
      .replace(/(对比|分享|认证|价格解读|查看分期方案).*$/i, '')
      .replace(/士\s*对比/g, '版')
      .replace(/MONA\s*M0?3/gi, 'MONA M03')
      .replace(/M0?3/gi, 'M03')
      .replace(/[\u3002。]$/, '')
      .trim();
  }

  private compactModelText(input: string): string {
    return (input || '').replace(/\s+/g, '').trim();
  }

  private getBaseCropConfig(): BaseCropConfig {
    return { x: 870, y: 140, width: 770, height: 360 };
  }

  private getCropConfig(): FieldCropConfig {
    return {
      price: { x: 10, y: 120, width: 330, height: 210 },
    };
  }

  private getSearchUrls(): string[] {
    return [
      'https://www.dongchedi.com/usedcar/24165595',
      'https://www.dongchedi.com/usedcar/24295170',
    ];
  }

  private getUrlTag(url: string): string {
    const id = url.match(/\/usedcar\/(\d+)/)?.[1];
    return id ?? 'unknown';
  }

  private getModelSelector(): string {
    return '#__next > div > div.new-main.tw-overflow-hidden.new > div > div.jsx-1166026127.tw-grid.tw-grid-cols-40.tw-bg-white.tw-px-16.tw-py-12 > div.jsx-1166026127.tw-col-span-23.md\\:tw-col-span-26.tw-pl-16.tw-flex.tw-flex-col > div:nth-child(1) > h1 > span';
  }

  private getSourceLocationSelector(): string {
    return '#\\31  > div.tw-mt-12.tw-bg-white.tw-px-16.tw-py-12.tw-rounded-2 > div.car-archives_params-wrap__1o2oB > div > div:nth-child(2) > p.car-archives_value__3YXEW';
  }

  private getRegisterDateSelector(): string {
    return '#\\31  > div.tw-mt-12.tw-bg-white.tw-px-16.tw-py-12.tw-rounded-2 > div.car-archives_params-wrap__1o2oB > div > div:nth-child(4) > p.car-archives_value__3YXEW';
  }

  private getMileageDescSelector(): string {
    return '#\\31  > div.tw-mt-12.tw-bg-white.tw-px-16.tw-py-12.tw-rounded-2 > div.car-archives_desc__2uEmn > p';
  }

  private async extractModelTextFromPage(page: Page): Promise<string> {
    const fromSelector = await page
      .locator(this.modelSelector)
      .first()
      .textContent()
      .catch(() => '');

    const normalized = this.normalizeLine(fromSelector || '');
    if (normalized) {
      return normalized;
    }

    this.logger.warn(`Model selector not found or empty: ${this.modelSelector}`);
    return '';
  }

  private async extractSourceLocationTextFromPage(page: Page): Promise<string> {
    const fromSelector = await page
      .locator(this.sourceLocationSelector)
      .first()
      .textContent()
      .catch(() => '');

    const normalized = this.normalizeLine(fromSelector || '');
    if (normalized) {
      return normalized;
    }

    this.logger.warn(`Source location selector not found or empty: ${this.sourceLocationSelector}`);
    return '';
  }

  private async extractRegisterDateTextFromPage(page: Page): Promise<string> {
    const fromSelector = await page
      .locator(this.registerDateSelector)
      .first()
      .textContent()
      .catch(() => '');

    const normalized = this.normalizeLine(fromSelector || '');
    if (normalized) {
      return normalized;
    }

    this.logger.warn(`Register date selector not found or empty: ${this.registerDateSelector}`);
    return '';
  }

  private async extractMileageDescTextFromPage(page: Page): Promise<string> {
    const fromSelector = await page
      .locator(this.mileageDescSelector)
      .first()
      .textContent()
      .catch(() => '');

    const normalized = (fromSelector || '').trim();
    if (normalized) {
      return normalized;
    }

    this.logger.warn(`Mileage desc selector not found or empty: ${this.mileageDescSelector}`);
    return '';
  }
}
