import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { RawListing } from '../../../common/types/listing.types';
import { CrawlerAdapter } from './crawler-adapter';

@Injectable()
export class XianyuAdapter implements CrawlerAdapter {
  readonly platform = '闲鱼';
  private readonly logger = new Logger(XianyuAdapter.name);
  private readonly listUrl =
    'https://www.goofish.com/search?spm=a21ybx.search.searchSuggest.1.24387d89ksRRz7&q=%E5%B0%8F%E9%B5%ACm03';
  private readonly statePath = path.join(process.cwd(), 'state', 'xianyu.json');

  async crawl(): Promise<RawListing[]> {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const contextOptions: BrowserContextOptions = {
        viewport: { width: 1920, height: 1080 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      };

      if (fs.existsSync(this.statePath)) {
        contextOptions.storageState = this.statePath;
      } else {
        this.logger.warn(`Xianyu login state file not found at ${this.statePath}. Run login bootstrap if needed.`);
      }

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      await page.goto(this.listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2500);

      const items = await page.$$eval(
        '#content div[class*="feeds-list-container"] a[class*="feeds-item-wrap"]',
        (nodes) =>
          nodes.map((node) => {
            const title =
              node.querySelector('[class*="row1-wrap-title"] [class*="main-title"]')?.textContent?.trim() ?? '';
            const priceInt = node.querySelector('[class*="price-wrap"] [class*="number"]')?.textContent?.trim() ?? '';
            const priceDecimal =
              node.querySelector('[class*="price-wrap"] [class*="decimal"]')?.textContent?.trim() ?? '';
            const magnitude = node.querySelector('[class*="magnitude"]')?.textContent?.trim() ?? '';
            const seller = node.querySelector('[class*="seller-text-wrap"] [class*="seller-text"]')?.textContent?.trim() ?? '';
            const href = (node as HTMLAnchorElement).getAttribute('href') ?? '';

            return {
              title,
              price: `${priceInt}${priceDecimal}${magnitude}`,
              seller,
              href,
            };
          }),
      );

      const listings = items
        .map((item) => this.toRawListing(item))
        .filter((item): item is RawListing => Boolean(item));
      this.logger.log(`Xianyu parsed ${listings.length} listings from list page.`);
      return listings;
    } catch (error) {
      this.logger.warn(`Xianyu crawl failed and will be skipped: ${String(error)}`);
      return [];
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }

  private toRawListing(item: {
    title: string;
    price: string;
    seller: string;
    href: string;
  }): RawListing | null {
    const modelRaw = (item.title || '').trim() || '--';
    const model = modelRaw.replace(/\s+/g, '') || '--';
    if (model === '--') return null;

    const priceWan = this.extractPriceWan(item.price);
    const sourceLocation = (item.seller || '').trim() || '--';
    const mileageKm = this.extractMileageKm(item.title);
    const registerDate = this.extractRegisterDate(item.title);
    const hasMajorAccident = this.extractMajorAccident(item.title);

    return {
      platform: this.platform,
      model,
      modelRaw,
      priceWan,
      sourceLocation,
      mileageKm,
      registerDate,
      hasMajorAccident,
      url: item.href.startsWith('http') ? item.href : `https://www.goofish.com${item.href}`,
      rawText: JSON.stringify(item),
      needsReview: priceWan <= 0 || mileageKm <= 0 || registerDate === '--',
    };
  }

  private extractPriceWan(input: string): number {
    const compact = (input || '').replace(/\s+/g, '');
    const m = compact.match(/(\d+(?:\.\d+)?)万/);
    if (m) return Number(m[1]);
    const num = compact.match(/(\d+(?:\.\d+)?)/);
    return num ? Number(num[1]) : 0;
  }

  private extractMileageKm(input: string): number {
    const compact = (input || '').replace(/\s+/g, '');
    const wan = compact.match(/(\d+(?:\.\d+)?)万公里/);
    if (wan) return Math.round(Number(wan[1]) * 10000);
    const km = compact.match(/(\d+(?:\.\d+)?)公里/);
    return km ? Math.round(Number(km[1])) : 0;
  }

  private extractRegisterDate(input: string): string {
    const compact = (input || '').replace(/\s+/g, '');
    const ym4 = compact.match(/(20\d{2})年(\d{1,2})月/);
    if (ym4) return `${ym4[1]}-${String(Number(ym4[2])).padStart(2, '0')}`;

    const ym2 = compact.match(/([0-2]?\d)年(\d{1,2})月/);
    if (ym2) return `20${String(Number(ym2[1])).padStart(2, '0')}-${String(Number(ym2[2])).padStart(2, '0')}`;

    return '--';
  }

  private extractMajorAccident(input: string): boolean {
    const text = input || '';
    if (/没事故|无事故/.test(text)) return false;
    return /事故|火烧|泡水|重大事故/.test(text);
  }
}


