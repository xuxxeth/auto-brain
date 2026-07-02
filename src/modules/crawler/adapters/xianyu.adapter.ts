import { Injectable } from '@nestjs/common';
import { RawListing } from '../../../common/types/listing.types';
import { CrawlerAdapter } from './crawler-adapter';

@Injectable()
export class XianyuAdapter implements CrawlerAdapter {
  readonly platform = '闲鱼';

  async crawl(): Promise<RawListing[]> {
    return [
      {
        platform: this.platform,
        model: '小鹏 M03 620 Pro',
        priceWan: 10.5,
        city: '海口',
        mileageKm: 15000,
        registerDate: '2024-07',
        hasMajorAccident: false,
      },
    ];
  }
}
