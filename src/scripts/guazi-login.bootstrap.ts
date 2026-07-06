import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { chromium } from 'playwright';

async function bootstrap() {
  const stateDir = path.join(process.cwd(), 'state');
  const statePath = path.join(stateDir, 'guazi.json');
  const targetUrl = 'https://www.guazi.com/sh/xpqc/xiaopengmona_m03/';

  await fs.mkdir(stateDir, { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  try {
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('Please complete guazi login/captcha manually in opened browser.');
    console.log('After login succeeds, press Enter here to save state...');

    process.stdin.setEncoding('utf8');
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });

    await context.storageState({ path: statePath });
    console.log(`Saved guazi storage state to: ${statePath}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

void bootstrap();
