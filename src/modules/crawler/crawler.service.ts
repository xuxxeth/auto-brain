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

    const results = await Promise.all(this.adapters.map((adapter) => adapter.crawl()));
    return results.flat();
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
