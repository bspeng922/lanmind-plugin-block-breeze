import { test, expect } from '@playwright/test';

const key = 'block-breeze.v1';
const game = () => ({ board: Array(64).fill(0), hand: [{ shape: 'dot', color: 1 }, { shape: 'square', color: 2 }, { shape: 'triH', color: 3 }], score: 0, lines: 0, moves: 0, combo: 0 });
async function seed(page, value = game(), settings = {}) {
  await page.addInitScript(({ key, game, settings }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, game, best: 0, settings }));
  }, { key, game: value, settings });
}
async function ready(page) { await page.goto('/'); await expect(page.locator('#app')).not.toHaveClass(/is-loading/); }

test('click placement, serialized saves, undo, reload and restart confirmation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await seed(page);
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.getByRole('button', { name: '选择第 1 个方块' }).click();
  await page.locator('[data-index="0"]').click();
  await expect(page.locator('#score')).toHaveText('5');
  await expect(page.locator('[data-index="0"]')).toHaveClass(/filled/);
  await page.reload();
  await expect(page.locator('#score')).toHaveText('5');
  await page.locator('#undo-button').click();
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#best')).toHaveText('5');
  await expect(page.locator('#undo-button')).toBeDisabled();
  await page.getByRole('button', { name: '选择第 2 个方块' }).click();
  await page.locator('[data-index="9"]').click();
  await expect(page.locator('#score')).toHaveText('20');
  await page.locator('#restart-button').click();
  await expect(page.locator('#restart-dialog')).toBeVisible();
  await page.getByRole('button', { name: '继续这局' }).click();
  await expect(page.locator('#score')).toHaveText('20');
  await page.locator('#restart-button').click();
  await page.locator('#confirm-restart').click();
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#best')).toHaveText('20');
  expect(errors).toEqual([]);
});

test('mouse drag places a piece and dropping outside leaves it available', async ({ page }) => {
  await seed(page); await ready(page);
  const piece = page.locator('[data-slot="1"]');
  let source = await piece.boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(30, 130, { steps: 8 });
  await expect(page.locator('#drag-ghost')).toBeVisible();
  await page.mouse.up();
  await expect(piece).toBeEnabled();
  await expect(page.locator('#score')).toHaveText('0');
  source = await piece.boundingBox();
  const target = await page.locator('[data-index="9"]').boundingBox();
  const next = await page.locator('[data-index="10"]').boundingBox();
  const step = next.x - target.x;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + step - (step - target.width) / 2, target.y + step - (step - target.width) / 2 + 18, { steps: 12 });
  await expect(page.locator('.cell.preview')).toHaveCount(4);
  await page.mouse.up();
  await expect(page.locator('#score')).toHaveText('20');
  await expect(page.locator('.cell.filled')).toHaveCount(4);
});

test('crossing clears, game over, and undo of a losing move', async ({ page }) => {
  const initial = game();
  for (let i = 1; i < 8; i++) { initial.board[i] = 2; initial.board[i * 8] = 3; }
  await seed(page, initial); await ready(page);
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await expect(page.locator('#score')).toHaveText('255');
  await expect(page.locator('#lines')).toHaveText('2');
  await expect(page.locator('.cell.filled')).toHaveCount(0);
  await page.evaluate(key => {
    const snapshot = JSON.parse(localStorage.getItem(key));
    snapshot.game.board = Array.from({ length: 64 }, (_, i) => (Math.floor(i / 8) + i % 8) % 2);
    snapshot.game.hand = [{ shape: 'dot', color: 1 }, { shape: 'square', color: 2 }, { shape: 'triH', color: 3 }];
    snapshot.game.score = 0;
    snapshot.game.combo = 0;
    localStorage.setItem(key, JSON.stringify(snapshot));
  }, key);
  await page.reload();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await expect(page.locator('#game-over')).toBeVisible();
  await page.locator('#over-undo').click();
  await expect(page.locator('#game-over')).toBeHidden();
  await expect(page.locator('#score')).toHaveText('0');
});

test('host SDK saves, live language changes, theme preference, and permission-free operation', async ({ page }) => {
  await page.addInitScript(({ initial }) => {
    window.__saves = [];
    window.LanMind = {
      context: { get: async () => ({ locale: 'en-US', theme: { id: 'dark' } }) },
      storage: { get: async () => ({ schemaVersion: 1, game: initial, best: 100 }), set: async (key, value) => { window.__saves.push({ key, value }); } },
    };
  }, { initial: game() });
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Select block 1' }).click();
  await page.locator('[data-index="0"]').click();
  await expect.poll(() => page.evaluate(() => window.__saves.at(-1)?.value.game.score)).toBe(5);
  await page.getByRole('button', { name: 'Use light theme' }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('lanmind:context', { detail: { locale: 'zh-CN', theme: { id: 'dark' } } })));
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: '选择第 2 个方块' })).toBeVisible();
});

test('failed host read is visible and never overwrites unread progress', async ({ page }) => {
  await page.addInitScript(() => {
    window.__writes = 0;
    window.LanMind = { context: { get: async () => ({ locale: 'zh-CN', theme: { id: 'light' } }) }, storage: { get: async () => { throw new Error('PLUGIN_SESSION'); }, set: async () => { window.__writes++; } } };
  });
  await ready(page);
  await expect(page.locator('#save-status')).toHaveClass(/failed/);
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__writes)).toBe(0);
});

test('narrow touch layout, help dialog, keyboard focus, and theme survive reload', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page); await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '怎么玩' }).click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.getByRole('button', { name: '知道啦，开始放松' }).click();
  await page.keyboard.press('2');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-index="9"]')).toHaveClass(/filled/);
  await page.getByRole('button', { name: '切换深色' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#score')).toHaveText('20');
});

test('touch dragging places a block without scrolling the board', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await seed(page); await ready(page);
    const source = await page.locator('[data-slot="0"]').boundingBox();
    const target = await page.locator('[data-index="0"]').boundingBox();
    const session = await context.newCDPSession(page);
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 + 52 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 0 }] });
    for (let step = 1; step <= 10; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * step / 10, y: start.y + (end.y - start.y) * step / 10, id: 0 }] });
    }
    await expect(page.locator('.cell.preview')).toHaveCount(1);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#score')).toHaveText('5');
    expect(await page.evaluate(() => scrollY)).toBe(0);
  } finally { await context.close(); }
});
