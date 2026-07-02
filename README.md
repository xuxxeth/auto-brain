# AutoBrain Service Skeleton

NestJS + Playwright backend skeleton for M1:

- Crawl (adapter structure ready)
- Clean
- Score (configurable weights)
- Export Excel

## Quick Start

```bash
npm install --cache .npm-cache
npm run build
npm run start:dev
```

Optional (for real Playwright crawling):

```bash
npx playwright install
```

## Endpoints

- `GET /api/health` health check
- `GET /api/exports/preview` preview current dataset as JSON
- `GET /api/exports/daily.xlsx` download daily excel

## Project Structure

```text
config/
  scoring.weights.json
src/
  app.module.ts
  main.ts
  config/
    scoring-config.service.ts
  common/
    types/
      listing.types.ts
  modules/
    health/
      health.controller.ts
      health.module.ts
    crawler/
      crawler.module.ts
      crawler.service.ts
      adapters/
        crawler-adapter.ts
        guazi.adapter.ts
        dongchedi.adapter.ts
        zhuanzhuan.adapter.ts
        xianyu.adapter.ts
    pipeline/
      pipeline.module.ts
      pipeline.service.ts
    scoring/
      scoring.module.ts
      scoring.service.ts
    export/
      export.module.ts
      export.service.ts
      export.controller.ts
```

## Notes

- Dongchedi adapter uses full-page screenshot + OCR extraction.
- If Playwright browser binaries are not installed yet, crawler logs warning and continues with mock data.
- Export endpoint provides `raw_data`, `clean_data`, `score_result`, `needs_review`, `daily_summary` sheets.

### Dongchedi OCR flow

- Open page
- Save full-page screenshot under `ocr/`
- OCR on screenshot and parse listing fields
