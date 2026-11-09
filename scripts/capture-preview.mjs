import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { root } from './build.mjs';

const port = 5175;
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { cwd: root, stdio: 'ignore', windowsHide: true });
let browser;
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch { /* Waiting for local server. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1080, height: 760 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('#app.is-loading').waitFor({ state: 'detached' });
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/initial.png'), fullPage: true });
  console.log(JSON.stringify(await page.evaluate(() => ({ viewport: innerHeight, pageHeight: document.documentElement.scrollHeight, boardWidth: document.querySelector('#board').getBoundingClientRect().width }))));
  await page.evaluate(() => {
    const rows = [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 4, 4],
      [0, 3, 3, 0, 0, 0, 0, 4],
      [0, 3, 3, 0, 0, 0, 0, 4],
      [1, 1, 0, 0, 2, 2, 2, 0],
      [1, 1, 5, 5, 0, 0, 2, 0],
      [0, 0, 5, 5, 0, 1, 1, 1],
    ];
    localStorage.setItem('block-breeze.v1', JSON.stringify({ schemaVersion: 1, game: { board: rows.flat(), hand: [{ shape: 'corner', color: 1 }, { shape: 'triH', color: 2 }, { shape: 'square', color: 3 }], score: 865, lines: 7, moves: 28, combo: 0 }, best: 2480, startingBest: 2480, settings: { theme: 'light', sound: false } }));
  });
  await page.reload();
  await page.locator('#app.is-loading').waitFor({ state: 'detached' });
  // Dismiss the short welcome toast before capturing permanent documentation.
  await page.locator('#toast.visible').waitFor({ state: 'hidden' });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'docs/preview.png'), fullPage: true });
  await page.getByRole('button', { name: '切换深色' }).click();
  await page.screenshot({ path: path.join(root, 'test-results/dark.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: path.join(root, 'test-results/mobile.png'), fullPage: true });
} finally {
  await browser?.close();
  server.kill();
}
