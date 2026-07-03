import { Injectable, Logger } from '@nestjs/common';
import type { Browser } from 'playwright';
import { chromium } from 'playwright';
import { RawListing } from '../../common/types/listing.types';
import { CrawlerAdapter } from './adapters/crawler-adapter';
import { DongchediAdapter } from './adapters/dongchedi.adapter';
import { GuaziAdapter } from './adapters/guazi.adapter';
import { XianyuAdapter } from './adapters/xianyu.adapter';
import { ZhuanzhuanAdapter } from './adapters/zhuanzhuan.adapter';

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  private readonly adapters: CrawlerAdapter[];
  private readonly ansi = {
    reset: '\x1b[0m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
  } as const;

  constructor(
    guaziAdapter: GuaziAdapter,
    dongchediAdapter: DongchediAdapter,
    zhuanzhuanAdapter: ZhuanzhuanAdapter,
    xianyuAdapter: XianyuAdapter,
  ) {
    this.adapters = [guaziAdapter, dongchediAdapter, zhuanzhuanAdapter, xianyuAdapter];
  }

  async crawlListings(): Promise<RawListing[]> {
    await this.checkPlaywrightAvailability();

    const allStartAt = Date.now();
    const results = await Promise.all(this.adapters.map((adapter) => this.runAdapterWithTiming(adapter)));
    const totalCostMs = Date.now() - allStartAt;
    this.logger.log(this.blue(`All adapters finished in ${totalCostMs}ms`));
    return results.flat();
  }

  private async runAdapterWithTiming(adapter: CrawlerAdapter): Promise<RawListing[]> {
    const startAt = Date.now();
    this.logger.log(this.blue(`[${adapter.platform}] crawl started`));

    try {
      const result = await adapter.crawl();
      const costMs = Date.now() - startAt;
      this.logger.log(this.blue(`[${adapter.platform}] crawl finished in ${costMs}ms, rows=${result.length}`));
      return result;
    } catch (error) {
      const costMs = Date.now() - startAt;
      this.logger.warn(this.red(`[${adapter.platform}] crawl failed in ${costMs}ms: ${String(error)}`));
      return [];
    }
  }

  private blue(text: string): string {
    return `${this.ansi.blue}${text}${this.ansi.reset}`;
  }

  private red(text: string): string {
    return `${this.ansi.red}${text}${this.ansi.reset}`;
  }

  private async checkPlaywrightAvailability(): Promise<void> {
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      this.logger.log('Playwright browser is available.');
    } catch (error) {
      this.logger.warn(`Playwright unavailable, adapters still running with mock data: ${String(error)}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}
