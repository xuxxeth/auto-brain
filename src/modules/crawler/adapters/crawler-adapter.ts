import { RawListing } from '../../../common/types/listing.types';

export interface CrawlerAdapter {
  readonly platform: string;
  crawl(): Promise<RawListing[]>;
}
