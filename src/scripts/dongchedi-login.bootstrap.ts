import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { chromium } from 'playwright';

async function bootstrap() {
  const stateDir = path.join(process.cwd(), 'state');
  const statePath = path.join(stateDir, 'dongchedi.json');
  const targetUrl =
    'https://www.dongchedi.com/search?keyword=%E5%B0%8F%E9%B9%8FM03&currTab=1&city_name=%E8%8B%8F%E5%B7%9E&search_mode=history';

  await fs.mkdir(stateDir, { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  try {
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('Please complete login and captcha manually in opened browser.');
    console.log('After login succeeds, press Enter here to save state...');

    process.stdin.setEncoding('utf8');
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });

    await context.storageState({ path: statePath });
    console.log(`Saved dongchedi storage state to: ${statePath}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

void bootstrap();
