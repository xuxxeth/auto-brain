import { Module } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { GuaziAdapter } from './adapters/guazi.adapter';
import { DongchediAdapter } from './adapters/dongchedi.adapter';
import { ZhuanzhuanAdapter } from './adapters/zhuanzhuan.adapter';
import { XianyuAdapter } from './adapters/xianyu.adapter';
import { OcrService } from './ocr/ocr.service';

@Module({
  providers: [CrawlerService, GuaziAdapter, DongchediAdapter, ZhuanzhuanAdapter, XianyuAdapter, OcrService],
  exports: [CrawlerService],
})
export class CrawlerModule {}
