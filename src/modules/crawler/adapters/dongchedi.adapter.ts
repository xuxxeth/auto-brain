import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { RawListing } from '../../../common/types/listing.types';
import { CrawlerAdapter } from './crawler-adapter';
import { OcrService } from '../ocr/ocr.service';
const sharpLib = require('sharp');

type FieldKey = 'model' | 'price' | 'city' | 'mileage' | 'registerDate';

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
  private readonly searchUrl = 'https://www.dongchedi.com/usedcar/24165595';
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

      await page.goto(this.searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2500);

      if (await this.requiresManualVerification(page)) {
        this.logger.warn('Dongchedi login/captcha detected, skip this platform in current run.');
        return [];
      }

      const fullPath = await this.captureBaseScreenshot(page);
      const fieldPaths = await this.captureFieldScreenshotsFromBase(fullPath);

      const fullOcr = await this.ocrService.recognizeImage(fullPath);
      const modelOcr = await this.ocrService.recognizeImage(fieldPaths.model);
      const priceOcr = await this.ocrService.recognizeImage(fieldPaths.price);
      const cityOcr = await this.ocrService.recognizeImage(fieldPaths.city);
      const mileageOcr = await this.ocrService.recognizeImage(fieldPaths.mileage);
      const registerOcr = await this.ocrService.recognizeImage(fieldPaths.registerDate);

      const listing = this.buildListingFromFieldTexts({
        model: modelOcr.text,
        price: priceOcr.text,
        city: cityOcr.text,
        mileage: mileageOcr.text,
        registerDate: registerOcr.text,
      }, fullOcr.text, [modelOcr.confidence, priceOcr.confidence, cityOcr.confidence, mileageOcr.confidence, registerOcr.confidence]);

      return listing ? [listing] : [];
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

  private async captureBaseScreenshot(page: Page): Promise<string> {
    const outputDir = path.join(process.cwd(), 'ocr');
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `dongchedi_base.png`);

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

  private async captureFieldScreenshotsFromBase(baseImagePath: string): Promise<Record<FieldKey, string>> {
    const outputDir = path.join(process.cwd(), 'ocr');
    fs.mkdirSync(outputDir, { recursive: true });

    const result = {} as Record<FieldKey, string>;
    const fields: FieldKey[] = ['model', 'price', 'city', 'mileage', 'registerDate'];

    for (const field of fields) {
      const rect = this.cropConfig[field];
      const outPath = path.join(outputDir, `dongchedi_${field}.png`);
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

    this.logger.log(`Saved 5 field screenshots from base image at ${outputDir}`);
    return result;
  }

  private buildListingFromFieldTexts(
    fieldText: Record<FieldKey, string>,
    fullText: string,
    confidences: number[],
  ): RawListing | null {
    const modelRaw = this.extractModelRaw(fieldText.model);
    const model = this.extractModel(modelRaw);
    const priceWan = this.extractPriceWan(fieldText.price || fullText);
    const city = this.extractCity(fieldText.city || fullText);
    const mileageKm = this.extractMileageKm(fieldText.mileage || fullText);
    const registerDate = this.extractRegisterDate(fieldText.registerDate || fullText);
    const hasMajorAccident = /重大事故|事故车|火烧|泡水/.test(fullText);

    if (priceWan <= 0 || !model) return null;

    const confidence = confidences.length > 0 ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : 0;
    const needsReview = confidence < 85 || mileageKm <= 0 || !registerDate;

    return {
      platform: this.platform,
      model,
      modelRaw,
      priceWan,
      city,
      mileageKm,
      registerDate,
      hasMajorAccident,
      url: this.searchUrl,
      rawText: JSON.stringify(fieldText),
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

  private extractCity(input: string): string {
    const compact = this.normalizeText(input);
    const city = this.knownCities.find((item) => compact.includes(item));
    return city ?? '苏州';
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
    const defaultConfig: BaseCropConfig = { x: 870, y: 140, width: 770, height: 360 };
    const raw = process.env.DONGCHEDI_BASE_CROP_CONFIG;
    if (!raw) return defaultConfig;

    try {
      const parsed = JSON.parse(raw) as Partial<BaseCropConfig>;
      return {
        x: parsed.x ?? defaultConfig.x,
        y: parsed.y ?? defaultConfig.y,
        width: parsed.width ?? defaultConfig.width,
        height: parsed.height ?? defaultConfig.height,
      };
    } catch {
      this.logger.warn('Invalid DONGCHEDI_BASE_CROP_CONFIG JSON, fallback to default base crop.');
      return defaultConfig;
    }
  }

  private getCropConfig(): FieldCropConfig {
    const defaultConfig: FieldCropConfig = {
      model: { x: 0, y: 0, width: 1400, height: 130 },
      price: { x: 10, y: 220, width: 330, height: 110 },
      city: { x: 1900, y: 660, width: 150, height: 70 },
      mileage: { x: 700, y: 660, width: 340, height: 80 },
      registerDate: { x: 150, y: 730, width: 360, height: 60 },
    };

    const raw = process.env.DONGCHEDI_FIELD_CROP_CONFIG;
    if (!raw) return defaultConfig;

    try {
      const parsed = JSON.parse(raw) as Partial<FieldCropConfig>;
      return {
        model: { ...defaultConfig.model, ...(parsed.model ?? {}) },
        price: { ...defaultConfig.price, ...(parsed.price ?? {}) },
        city: { ...defaultConfig.city, ...(parsed.city ?? {}) },
        mileage: { ...defaultConfig.mileage, ...(parsed.mileage ?? {}) },
        registerDate: { ...defaultConfig.registerDate, ...(parsed.registerDate ?? {}) },
      };
    } catch {
      this.logger.warn('Invalid DONGCHEDI_FIELD_CROP_CONFIG JSON, fallback to default crop config.');
      return defaultConfig;
    }
  }
}
