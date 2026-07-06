import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { RawListing } from '../../../common/types/listing.types';
import { CrawlerAdapter } from './crawler-adapter';

@Injectable()
export class GuaziAdapter implements CrawlerAdapter {
  readonly platform = '瓜子';
  private readonly logger = new Logger(GuaziAdapter.name);
  private readonly listUrl = 'https://www.guazi.com/sh/xpqc/xiaopengmona_m03/';
  private readonly statePath = path.join(process.cwd(), 'state', 'guazi.json');

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
        this.logger.warn(`Guazi login state file not found at ${this.statePath}. Run login bootstrap if needed.`);
      }

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      await page.goto(this.listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2500);

      if (await this.requiresManualVerification(page)) {
        this.logger.warn('Guazi login/captcha detected, skip this platform in current run.');
        return [];
      }

      const items = await page.$$eval('.car-list-box .car-box .car-item', (nodes) =>
        nodes.map((node) => {
          const anchor = node.querySelector<HTMLAnchorElement>('a.car-item-img');
          const title = node.querySelector('.car-item-info-title')?.textContent?.trim() ?? '';
          const desc = node.querySelector('.car-item-info-desc')?.textContent?.trim() ?? '';
          const price =
            node.querySelector('.car-item-info-price-value')?.textContent?.trim() ??
            node.querySelector('.car-item-info-price-now')?.textContent?.trim() ??
            '';
          const tags = Array.from(node.querySelectorAll('.car-item-info-tag span'))
            .map((el) => el.textContent?.trim() ?? '')
            .filter(Boolean);

          return {
            title,
            desc,
            price,
            tags,
            href: anchor?.getAttribute('href') ?? '',
          };
        }),
      );

      const listings = items
        .map((item) => this.toRawListing(item))
        .filter((item): item is RawListing => Boolean(item));

      this.logger.log(`Guazi parsed ${listings.length} listings from list page.`);
      return listings;
    } catch (error) {
      this.logger.warn(`Guazi crawl failed and will be skipped: ${String(error)}`);
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
    const keywordHit = ''
      // lower.includes('验证码') 
      // ||
      // lower.includes('captcha') ||
      // lower.includes('滑块') ||
      // lower.includes('请先登录');
    if (keywordHit) return true;

    const loginButtonVisible = await page
      .locator('text=/登录|立即登录|去登录/')
      .first()
      .isVisible()
      .catch(() => false);
    return loginButtonVisible;
  }

  private toRawListing(item: {
    title: string;
    desc: string;
    price: string;
    tags: string[];
    href: string;
  }): RawListing | null {
    const modelRaw = item.title.trim();
    const model = modelRaw.replace(/\s+/g, '');
    if (!model) return null;

    const priceWan = this.extractPriceWan(item.price);
    const sourceLocation = this.extractSourceLocation(item.desc);
    const mileageKm = this.extractMileageKm(item.desc);
    const registerDate = this.extractRegisterDate(item.desc);

    const tagText = item.tags.join('|');
    const hasMajorAccident = /事故|火烧|泡水|重大事故/.test(tagText);
    const needsReview = priceWan <= 0 || mileageKm <= 0 || !registerDate;

    return {
      platform: this.platform,
      model,
      modelRaw,
      priceWan,
      sourceLocation,
      mileageKm,
      registerDate,
      hasMajorAccident,
      url: item.href.startsWith('http') ? item.href : `https://www.guazi.com${item.href}`,
      rawText: JSON.stringify(item),
      needsReview,
    };
  }

  private extractPriceWan(input: string): number {
    const compact = (input || '').replace(/\s+/g, '');
    const m = compact.match(/(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : 0;
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
    const ym = compact.match(/(20\d{2})年(\d{1,2})月/);
    if (ym) return `${ym[1]}-${String(Number(ym[2])).padStart(2, '0')}`;
    const y = compact.match(/(20\d{2})年/);
    if (y) return `${y[1]}-01`;
    return '2024-01';
  }

  private extractSourceLocation(input: string): string {
    const text = (input || '').trim();
    const parts = text
      .split('|')
      .map((v) => v.trim())
      .filter(Boolean);
    if (parts.length >= 3) return parts[2];

    const cityMatch = text.match(/(北京|上海|广州|深圳|苏州|杭州|南京|海口|天津|重庆|武汉|成都|西安|长沙|郑州|青岛|宁波|无锡|佛山|东莞)/);
    return cityMatch?.[1] ?? '上海';
  }
}
