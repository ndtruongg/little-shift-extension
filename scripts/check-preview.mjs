/* global document, localStorage, innerHeight, console, getComputedStyle, requestAnimationFrame */
import { chromium } from 'playwright';
import { preview } from 'vite';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';

await mkdir('output/playwright', { recursive: true });
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
const address = server.httpServer.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const checks = [];
const errors = [];
context.on('weberror', (error) => errors.push(error.error().message));
try {
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Bắt đầu tập trung', exact: true }).waitFor();
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [1366, 650],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const geometry = await page.evaluate(() => {
      const controls = document.querySelector('.timer-controls').getBoundingClientRect();
      return {
        width: document.documentElement.scrollWidth,
        controls: controls.bottom,
        height: innerHeight,
      };
    });
    assert.ok(geometry.width <= width, `Horizontal overflow at ${width}x${height}`);
    if (width >= 1100) assert.ok(geometry.controls < height - 40, 'Timer controls disappear');
    await page.screenshot({
      path: `output/playwright/dashboard-${width}x${height}.png`,
      fullPage: width < 720,
      animations: 'disabled',
    });
    checks.push(`Responsive ${width}x${height}: no overflow; desktop timer controls visible`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Thêm công việc ↵' }).click();
  const editor = page.getByRole('dialog', { name: 'Một việc nhỏ mới' });
  await editor.getByLabel('Tên công việc').fill('Kiểm thử thao tác bàn phím');
  await editor.getByLabel('Tên công việc').press('Enter');
  await page
    .getByRole('button', { name: 'Tập trung vào Kiểm thử thao tác bàn phím', exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Sửa Kiểm thử thao tác bàn phím', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Sửa công việc' })
    .getByLabel('Tên công việc')
    .fill('Công việc đã sửa');
  await page.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  await page.getByRole('button', { name: 'Tập trung vào Công việc đã sửa', exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('.current-task').textContent.includes('Công việc đã sửa'),
  );
  await page.getByRole('button', { name: 'Hoàn thành Công việc đã sửa', exact: true }).click();
  await page.getByRole('button', { name: 'Mở lại Công việc đã sửa', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Xóa Công việc đã sửa', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Xóa công việc?' })
    .getByRole('button', { name: 'Xóa công việc', exact: true })
    .click();
  await page.waitForFunction(() => !document.body.textContent.includes('Công việc đã sửa'));
  checks.push('Create via Enter, edit, select, complete and confirm-delete tasks');
  await page.getByRole('button', { name: 'Mưa đêm', exact: true }).click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('little-shift-state')).settings.ambient === 'rain',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Thêm công việc ↵' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  const settings = page.getByRole('dialog', { name: 'Chăm chút góc nhỏ' });
  await settings.getByLabel('Focus (phút)', { exact: true }).fill('1');
  await settings.getByLabel('Chuông khi hoàn thành phiên').uncheck();
  await settings.getByLabel('Thông báo khi hết phiên').uncheck();
  await settings.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await page.getByRole('timer').filter({ hasText: '01:00' }).waitFor();
  checks.push('Reloading with persisted audio does not block commands; settings save');
  await page.getByRole('button', { name: 'Bắt đầu tập trung', exact: true }).click();
  const popup = await context.newPage();
  await popup.goto(`${origin}/popup.html`);
  await popup.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await page.getByRole('button', { name: 'Tiếp tục tập trung', exact: true }).waitFor();
  await popup.screenshot({ path: 'output/playwright/preview-popup.png' });
  await popup.close();
  await page.getByRole('button', { name: 'Bắt đầu lại phiên', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Bắt đầu lại phiên?' })
    .getByRole('button', { name: 'Hủy', exact: true })
    .click();
  await page.getByRole('button', { name: 'Tiếp tục tập trung', exact: true }).waitFor();
  checks.push('Popup and dashboard synchronize; cancelling reset preserves paused session');
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  const downloadPromise = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Xuất JSON', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs('output/playwright/preview-export.json');
  await settings.locator('input[accept="application/json,.json"]').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":999}'),
  });
  await settings.getByRole('alert').filter({ hasText: 'Dữ liệu không hợp lệ' }).waitFor();
  await settings
    .locator('input[accept="application/json,.json"]')
    .setInputFiles('output/playwright/preview-export.json');
  await page
    .getByRole('dialog', { name: 'Thay thế dữ liệu?' })
    .getByRole('button', { name: 'Nhập dữ liệu', exact: true })
    .click();
  await settings.getByRole('status').filter({ hasText: 'Đã nhập dữ liệu thành công' }).waitFor();
  checks.push('JSON export, invalid schema rejection and confirmed import');
  await settings.getByRole('button', { name: 'Đặt lại toàn bộ dữ liệu', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Xóa toàn bộ dữ liệu?' })
    .getByRole('button', { name: 'Hủy', exact: true })
    .click();
  await settings.getByRole('button', { name: 'Đặt lại toàn bộ dữ liệu', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Xóa toàn bộ dữ liệu?' })
    .getByRole('button', { name: 'Xóa toàn bộ', exact: true })
    .click();
  await settings.getByRole('status').filter({ hasText: 'Đã đặt lại dữ liệu' }).waitFor();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('heading', { name: 'Một khởi đầu nhẹ nhàng' }).waitFor();
  checks.push('Confirmed reset produces empty state and demo is not reinserted on reload');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const animation = await page
    .locator('.rain-drop')
    .first()
    .evaluate((element) => getComputedStyle(element).animationName);
  assert.equal(animation, 'none');
  checks.push('Reduced-motion preference disables scene animations');
  assert.deepEqual(errors, []);
  await writeFile(
    'output/playwright/preview-report.json',
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
  server.httpServer.close();
  if (server.httpServer.listening) await once(server.httpServer, 'close');
}
