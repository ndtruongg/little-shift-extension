/* global chrome, console */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const directory = resolve('dist');
const profile = await mkdtemp(join(tmpdir(), 'little-shift-extension-'));
await mkdir('output/playwright', { recursive: true });
const checks = [];
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
});
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  const id = worker.url().split('/')[2];
  const base = `chrome-extension://${id}`;
  const page = await context.newPage();
  const errors = [];
  context.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  context.on('weberror', (error) => errors.push(error.error().message));
  await page.goto(`${base}/index.html`);
  await page.getByRole('button', { name: 'Bắt đầu tập trung', exact: true }).waitFor();
  const command = (command) =>
    page.evaluate(async (command) => {
      const response = await chrome.runtime.sendMessage({ target: 'background', command });
      if (!response.ok) throw new Error(response.error);
      return response.state;
    }, command);
  let state = await command({ type: 'get' });
  assert.equal(state.tasks.length, 0);
  checks.push('Fresh unpacked extension contains no demo tasks');
  await page.screenshot({ path: 'output/playwright/extension-empty-1440.png' });
  await page.getByRole('button', { name: 'Thêm công việc ↵' }).click();
  const taskDialog = page.getByRole('dialog', { name: 'Một việc nhỏ mới' });
  await taskDialog.getByLabel('Tên công việc').fill('Phiên kiểm thử extension');
  await taskDialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  await page
    .getByRole('button', { name: 'Tập trung vào Phiên kiểm thử extension', exact: true })
    .waitFor();
  checks.push('Task created through extension UI');
  state = await command({ type: 'get' });
  await command({
    type: 'settings.save',
    settings: { ...state.settings, focus: 1, short: 1, notifications: true, bellEnabled: true },
  });
  await page.getByRole('button', { name: 'Bắt đầu tập trung', exact: true }).click();
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).waitFor();
  const twin = await context.newPage();
  await twin.goto(`${base}/index.html`);
  await twin.getByRole('button', { name: 'Tạm dừng', exact: true }).waitFor();
  const popup = await context.newPage();
  await popup.goto(`${base}/popup.html`);
  await popup.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await page.getByRole('button', { name: 'Tiếp tục tập trung', exact: true }).waitFor();
  await twin.getByRole('button', { name: 'Tiếp tục tập trung', exact: true }).waitFor();
  await popup.screenshot({ path: 'output/playwright/extension-popup.png' });
  checks.push('Two New Tabs and popup synchronize pause/resume');
  await page.getByRole('button', { name: 'Mưa đêm', exact: true }).click();
  await delay(500);
  await twin.getByRole('button', { name: 'Quán cà phê', exact: true }).click();
  await delay(500);
  const contexts = await page.evaluate(() =>
    chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }),
  );
  assert.equal(contexts.length, 1);
  checks.push('Ambient audio across tabs uses a single real offscreen document');
  await page.getByRole('button', { name: 'Quán cà phê', exact: true }).click();
  await command({ type: 'audio.preview', bell: 'soft', volume: 0.15 });
  await command({ type: 'audio.preview', bell: 'bit', volume: 0.15 });
  await command({ type: 'audio.preview', bell: 'clear', volume: 0.15 });
  state = await command({ type: 'get' });
  assert.equal(state.history.length, 0);
  checks.push(
    'Three bell previews are accepted by offscreen without statistics changes (audibility requires a manual check)',
  );
  await popup.getByRole('button', { name: 'Tiếp tục tập trung', exact: true }).click();
  const started = await command({ type: 'get' });
  assert.equal(await page.evaluate(() => chrome.action.getBadgeText({})), '1m');
  const timerId = started.timer.id;
  await popup.close();
  await twin.close();
  await page.close();
  // Leave only an ordinary blank tab. No New Tab / popup remains to drive the timer.
  const blank = await context.newPage();
  await blank.goto('about:blank');
  console.log('Waiting for the actual one-minute alarm with all extension UI closed…');
  await delay(Math.max(0, started.timer.endAt - Date.now()) + 3500);
  const result = await context.newPage();
  await result.goto(`${base}/index.html`);
  await result.getByRole('button', { name: 'Bắt đầu nghỉ ngơi', exact: true }).waitFor();
  const after = await result.evaluate(() =>
    chrome.runtime.sendMessage({ target: 'background', command: { type: 'get' } }),
  );
  assert.equal(after.ok, true);
  assert.equal(after.state.history.filter((h) => h.id === timerId).length, 1);
  assert.equal(after.state.focusCount, 1);
  assert.equal(after.state.tasks[0].doneAt, null);
  const notifications = await result.evaluate(() => chrome.notifications.getAll());
  checks.push(
    `Alarm completes exactly one Focus session while New Tab and popup are closed (${Object.keys(notifications).length} visible notification records)`,
  );
  await Promise.all(
    Array.from({ length: 5 }, () =>
      result.evaluate(() =>
        chrome.runtime.sendMessage({ target: 'background', command: { type: 'get' } }),
      ),
    ),
  );
  const replay = await result.evaluate(() =>
    chrome.runtime.sendMessage({ target: 'background', command: { type: 'get' } }),
  );
  assert.equal(replay.state.history.length, 1);
  checks.push('Repeated reads do not duplicate session completion');
  assert.deepEqual(errors, []);
  await result.screenshot({ path: 'output/playwright/extension-completed.png' });
  await writeFile(
    'output/playwright/extension-report.json',
    JSON.stringify({ checks, errors, notificationIds: Object.keys(notifications) }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
