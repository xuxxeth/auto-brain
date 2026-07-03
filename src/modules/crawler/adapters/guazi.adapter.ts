import { Injectable } from '@nestjs/common';
import { RawListing } from '../../../common/types/listing.types';
import { CrawlerAdapter } from './crawler-adapter';

@Injectable()
export class GuaziAdapter implements CrawlerAdapter {
  readonly platform = '瓜子';

  async crawl(): Promise<RawListing[]> {
    return [
      {
        platform: this.platform,
        model: '小鹏 M03 620 Max',
        priceWan: 10.2,
        sourceLocation: '海口',
        mileageKm: 12000,
        registerDate: '2024-08',
        hasMajorAccident: false,
      },
    ];
  }
}
