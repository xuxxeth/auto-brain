import { Injectable } from '@nestjs/common';
import { RawListing } from '../../../common/types/listing.types';
import { CrawlerAdapter } from './crawler-adapter';

@Injectable()
export class ZhuanzhuanAdapter implements CrawlerAdapter {
  readonly platform = '转转';

  async crawl(): Promise<RawListing[]> {
    return [
      {
        platform: this.platform,
        model: '小鹏 M03 620 Max',
        priceWan: 11.2,
        city: '海口',
        mileageKm: 10000,
        registerDate: '2024-09',
        hasMajorAccident: true,
      },
    ];
  }
}
