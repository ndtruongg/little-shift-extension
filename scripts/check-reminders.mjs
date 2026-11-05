/* global chrome, console, localStorage, document, window */
import { chromium } from 'playwright';
import { preview } from 'vite';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

await mkdir('output/playwright', { recursive: true });
const checks = [];
const errors = [];
const evidence = {};
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const context = await browser.newContext({
  timezoneId: 'Asia/Ho_Chi_Minh',
  viewport: { width: 1440, height: 900 },
});
context.on('weberror', (event) => errors.push(event.error().message));
try {
  await context.addInitScript(() => {
    window.__notices = [];
    window.Notification = class {
      static permission = 'granted';
      constructor(title, options) {
        window.__notices.push({ title, options });
      }
    };
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Thêm công việc ↵' }).waitFor();
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('little-shift-state')));
  const localInput = (offset) =>
    page.evaluate((offset) => {
      const d = new Date(Date.now() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }, offset);
  await page.getByRole('button', { name: 'Thêm công việc ↵' }).click();
  let dialog = page.getByRole('dialog', { name: 'Một việc nhỏ mới' });
  assert.equal(await dialog.getByLabel('Nhắc trước').isDisabled(), true);
  await dialog.getByLabel('Tên công việc').fill('Gửi bản thiết kế');
  const dueInput = await localInput(3600000);
  await dialog.getByLabel('Hạn hoàn thành', { exact: true }).fill(dueInput);
  await dialog.getByLabel('Nhắc trước').selectOption('15');
  await dialog.screenshot({ path: 'output/playwright/reminder-form-desktop.png' });
  await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  let state = await read();
  const task = state.tasks.find((task) => task.title === 'Gửi bản thiết kế');
  assert.equal(task.dueAt, await page.evaluate((value) => new Date(value).getTime(), dueInput));
  assert.equal(task.reminderOffsetMinutes, 15);
  checks.push(
    'Preview UI saves local datetime as absolute timestamp and enables reminder only with due date',
  );
  await page.getByRole('button', { name: 'Sửa Gửi bản thiết kế', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Sửa công việc' });
  await dialog.getByLabel('Ngày thực hiện').fill('2026-01-01');
  await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page
    .getByRole('button', { name: 'Chuyển Gửi bản thiết kế sang hôm nay', exact: true })
    .click();
  await page.getByRole('button', { name: 'Tập trung vào Gửi bản thiết kế', exact: true }).waitFor();
  assert.equal((await read()).tasks.find((t) => t.id === task.id).dueAt, task.dueAt);
  checks.push('Editing planned day and moving to today preserve dueAt and reminder');
  for (const choice of ['skip', 'now']) {
    await page.getByRole('button', { name: 'Thêm công việc ↵' }).click();
    dialog = page.getByRole('dialog', { name: 'Một việc nhỏ mới' });
    await dialog.getByLabel('Tên công việc').fill(`Hạn cũ ${choice}`);
    await dialog.getByLabel('Hạn hoàn thành', { exact: true }).fill(await localInput(-7200000));
    await dialog.getByLabel('Nhắc trước').selectOption('0');
    await dialog.getByText('Thời điểm nhắc đã qua', { exact: true }).waitFor();
    assert.equal(
      (await read()).tasks.some((t) => t.title === `Hạn cũ ${choice}`),
      false,
    );
    assert.equal(await page.evaluate(() => window.__notices.length), 0);
    await dialog
      .getByRole('radio', { name: choice === 'skip' ? 'Bỏ lời nhắc này' : 'Nhắc ngay sau khi lưu' })
      .check();
    await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
  assert.equal(await page.evaluate(() => window.__notices.length), 1);
  let notice = page.getByRole('region', { name: 'Nhắc hạn công việc' });
  await notice.getByText('Hạn cũ now', { exact: true }).waitFor();
  assert.match(await notice.innerText(), /Hạn ·/);
  await page.screenshot({ path: 'output/playwright/reminder-notice-desktop.png' });
  await page.reload();
  await page.getByRole('button', { name: 'Thêm công việc ↵' }).waitFor();
  assert.equal(await page.evaluate(() => window.__notices.length), 0);
  checks.push(
    'Past reminders require explicit skip/now; processed reminders do not replay after reload',
  );
  notice = page.getByRole('region', { name: 'Nhắc hạn công việc' });
  await notice.getByText('Hạn cũ now', { exact: true }).waitFor();
  const warnedTask = (await read()).tasks.find((t) => t.title === 'Hạn cũ now');
  await page.getByRole('button', { name: 'Đã xong', exact: true }).click();
  await notice.getByRole('button', { name: 'Xem task Hạn cũ now', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), `task-${warnedTask.id}`);
  const twin = await context.newPage();
  await twin.goto(origin);
  const twinNotice = twin.getByRole('region', { name: 'Nhắc hạn công việc' });
  await twinNotice.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/reminder-notice-mobile.png' });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await notice.getByRole('button', { name: 'Đã xem', exact: true }).click();
  await notice.waitFor({ state: 'hidden' });
  await twinNotice.waitFor({ state: 'hidden' });
  await twin.close();
  await page.reload();
  await page.getByRole('button', { name: 'Thêm công việc ↵' }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Nhắc hạn công việc' }).count(), 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  checks.push(
    'New Tab shows reminder task/title/due, survives reload, reveals task through filters, and persists viewed state across two tabs; mobile has no overflow',
  );
  await page.evaluate(() => {
    window.Notification.permission = 'denied';
  });
  await page.getByRole('button', { name: 'Sửa Gửi bản thiết kế', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Sửa công việc' });
  await dialog.getByLabel('Hạn hoàn thành', { exact: true }).fill(await localInput(10 * 60000));
  await dialog.getByRole('radio', { name: 'Nhắc ngay sau khi lưu' }).check();
  await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  notice = page.getByRole('region', { name: 'Nhắc hạn công việc' });
  await notice.getByText('Gửi bản thiết kế', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__notices.length), 0);
  await page.screenshot({ path: 'output/playwright/reminder-notice-without-os-permission.png' });
  const beforeSnooze = (await read()).tasks.find((t) => t.id === task.id).dueAt;
  await notice.getByRole('button', { name: 'Nhắc sau 10 phút', exact: true }).click();
  await notice.waitFor({ state: 'hidden' });
  const snoozed = (await read()).tasks.find((t) => t.id === task.id);
  assert.equal(snoozed.dueAt, beforeSnooze);
  assert.ok(snoozed.reminder.scheduledAt > Date.now() + 590000);
  checks.push(
    'In-page reminder appears even with OS notification permission denied; its snooze button preserves dueAt',
  );
  await page.getByRole('button', { name: 'Quá hạn', exact: true }).click();
  assert.equal(await page.locator('.task-list .task-card').count(), 2);
  assert.equal(await page.locator('.task-due.danger-text').count(), 2);
  await page.getByRole('button', { name: 'Sắp đến hạn', exact: true }).click();
  assert.equal(await page.locator('.task-list .task-card').count(), 1);
  await page.getByRole('button', { name: 'Tất cả', exact: true }).click();
  await page.getByLabel(/Sắp xếp/).selectOption('due');
  const dates = await page
    .locator('.task-list .task-card')
    .evaluateAll((cards) => cards.map((card) => card.id));
  const taskDates = new Map((await read()).tasks.map((t) => [`task-${t.id}`, t.dueAt ?? Infinity]));
  assert.deepEqual(
    dates.map((id) => taskDates.get(id)),
    dates.map((id) => taskDates.get(id)).sort((a, b) => a - b),
  );
  checks.push('Due-soon/overdue filters and nearest-due sort work; undated tasks are last');
  await page.goto(`${origin}/#task=${task.id}`);
  await page.locator(`#task-${task.id}.reminder-target`).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), `task-${task.id}`);
  await page.screenshot({ path: 'output/playwright/reminder-dashboard-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Sửa Gửi bản thiết kế', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Sửa công việc' });
  await dialog.screenshot({ path: 'output/playwright/reminder-form-mobile.png' });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await dialog.getByRole('button', { name: 'Xóa hạn hoàn thành', exact: true }).click();
  assert.equal(await dialog.getByLabel('Nhắc trước').isDisabled(), true);
  await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  state = await read();
  assert.equal(state.tasks.find((t) => t.id === task.id).reminder, null);
  checks.push(
    'Notification deep link reveals/focuses the correct task; mobile form clears due and reminder',
  );
  const beforeMidnight = await page.evaluate(() => {
    const date = new Date();
    date.setHours(23, 59, 30, 0);
    return date.getTime();
  });
  await page.clock.install({ time: new Date(beforeMidnight) });
  await page.reload();
  await page.getByRole('button', { name: 'Thêm công việc ↵' }).click();
  dialog = page.getByRole('dialog', { name: 'Một việc nhỏ mới' });
  await dialog.getByLabel('Tên công việc').fill('Hạn qua nửa đêm');
  await dialog.getByLabel('Hạn hoàn thành', { exact: true }).fill(await localInput(60000));
  await dialog.getByLabel('Nhắc trước').selectOption('5');
  await dialog.getByRole('radio', { name: 'Nhắc ngay sau khi lưu' }).check();
  await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const midnightTask = (await read()).tasks.find((t) => t.title === 'Hạn qua nửa đêm');
  await page.getByRole('button', { name: 'Tất cả', exact: true }).click();
  const midnightCard = page.locator(`#task-${midnightTask.id} .task-due`);
  notice = page.getByRole('region', { name: 'Nhắc hạn công việc' });
  await midnightCard.filter({ hasText: 'Ngày mai, 00:00' }).waitFor();
  await notice.getByText('Hạn · Ngày mai, 00:00', { exact: true }).waitFor();
  await page.clock.fastForward(31000);
  await midnightCard.filter({ hasText: 'Quá hạn · Hôm nay, 00:00' }).waitFor();
  await notice.getByText('Hạn · Hôm nay, 00:00', { exact: true }).waitFor();
  assert.match((await page.locator('.daily-goal strong').textContent()).trim(), /^0\//);
  checks.push(
    'Shared UI clock updates overdue/today labels and daily progress across midnight without storage polling',
  );
} finally {
  await context.close();
  await browser.close();
  await server.close();
}

console.log('Preview due-date UI checks passed.');
const directory = resolve('dist');
const profile = await mkdtemp(join(tmpdir(), 'little-shift-reminders-'));
const extension = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
});
extension.on('weberror', (event) => errors.push(event.error().message));
try {
  let worker = extension.serviceWorkers()[0] ?? (await extension.waitForEvent('serviceworker'));
  const base = `chrome-extension://${worker.url().split('/')[2]}`;
  let page = await extension.newPage();
  await page.goto(`${base}/index.html`);
  const command = (command) =>
    page.evaluate(async (command) => {
      const reply = await chrome.runtime.sendMessage({ target: 'background', command });
      if (!reply.ok) throw new Error(reply.error);
      return reply.state;
    }, command);
  let state = await command({ type: 'get' });
  await command({
    type: 'settings.save',
    settings: { ...state.settings, taskBellEnabled: true, taskBellVolume: 0.2 },
  });
  const dueAt = Date.now() + 12000;
  const taskCommand = (id, at = dueAt) => ({
    type: 'task.save',
    task: {
      id,
      title: `Nhắc ${id}`,
      day: '2026-11-04',
      priority: 'medium',
      estimated: 1,
      dueAt: at,
      reminderOffsetMinutes: 0,
    },
  });
  for (const id of ['a', 'b', 'deleted', 'done', 'edited']) await command(taskCommand(id));
  await command({ type: 'task.delete', id: 'deleted' });
  await command({ type: 'task.toggle', id: 'done' });
  await command(taskCommand('edited', dueAt + 3600000));
  await page.evaluate(() =>
    chrome.alarms.create('little-shift-end', { when: Date.now() + 7200000 }),
  );
  // Recover clears only idle Pomodoro alarm; the independent task alarm remains correct.
  await command({ type: 'get' });
  let alarms = await page.evaluate(() => chrome.alarms.getAll());
  assert.equal(alarms.filter((a) => a.name === 'little-shift-task-reminder').length, 1);
  assert.equal(alarms.find((a) => a.name === 'little-shift-task-reminder').scheduledTime, dueAt);
  evidence.initialAlarms = alarms;
  checks.push('Real extension uses exactly one nearest task alarm after edit/delete/complete');
  state = await command({ type: 'timer.start' });
  const runningTimerId = state.timer.id;
  assert.equal(await page.evaluate(() => chrome.action.getBadgeText({})), '25m');
  const blank = await extension.newPage();
  await blank.goto('about:blank');
  const cdp = await extension.newCDPSession(blank);
  const versions = new Map();
  const transitions = [];
  cdp.on('ServiceWorker.workerVersionUpdated', ({ versions: updates }) => {
    for (const v of updates) {
      versions.set(v.versionId, v);
      transitions.push({ status: v.runningStatus, at: Date.now() });
    }
  });
  await cdp.send('ServiceWorker.enable');
  await page.close();
  const version = [...versions.values()].find(
    (v) => v.scriptURL === `${base}/background.js` && v.runningStatus === 'running',
  );
  assert.ok(version, 'CDP identifies our isolated extension worker');
  await cdp.send('ServiceWorker.stopWorker', { versionId: version.versionId });
  console.log(
    'Stopped the isolated worker; waiting for the real task alarm with all extension UI closed…',
  );
  await delay(Math.max(0, dueAt - Date.now()) + 2500);
  evidence.workerVersions = [...versions.values()];
  evidence.workerTransitions = transitions;
  assert.ok(transitions.some((entry) => entry.status === 'stopped'));
  assert.equal(transitions.at(-1).status, 'running');
  worker = extension.serviceWorkers().find((w) => w.url() === `${base}/background.js`) ?? worker;
  // Read storage without a get command: only the alarm/startup recovery can have claimed this batch.
  const result = await worker.evaluate(async () => ({
    state: (await chrome.storage.local.get('little-shift-state'))['little-shift-state'],
    notices: await chrome.notifications.getAll(),
    alarms: await chrome.alarms.getAll(),
    contexts: await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }),
    badge: await chrome.action.getBadgeText({}),
    badgeColor: await chrome.action.getBadgeBackgroundColor({}),
    title: await chrome.action.getTitle({}),
  }));
  const notified = result.state.tasks.filter(
    (t) => t.reminder?.handledAt !== null && t.reminder?.notificationId,
  );
  assert.deepEqual(notified.map((t) => t.id).sort(), ['a', 'b']);
  const noticeId = notified[0].reminder.notificationId;
  assert.equal(notified[1].reminder.notificationId, noticeId);
  assert.deepEqual(
    Object.keys(result.notices).filter((id) => id.startsWith('little-shift-task:')),
    [noticeId],
  );
  assert.equal(
    result.alarms.find((a) => a.name === 'little-shift-task-reminder').scheduledTime,
    dueAt + 3600000,
  );
  assert.equal(result.contexts.length, 1);
  assert.equal(result.badge, '2');
  assert.deepEqual(result.badgeColor, [255, 173, 135, 255]);
  assert.match(result.title, /2 công việc đến giờ nhắc chưa xem.*Tập trung/);
  assert.equal(result.state.timer.id, runningTimerId);
  assert.equal(result.state.timer.status, 'running');
  evidence.closedUiResult = result;
  checks.push(
    'Real Chrome alarm wakes a stopped worker with UI closed; batches two reminders, skips deleted/completed/old edited schedules, uses one offscreen',
  );
  page = await extension.newPage();
  await page.goto(`${base}/index.html`);
  for (let i = 0; i < 4; i++) await command({ type: 'get' });
  assert.equal(Object.keys(await page.evaluate(() => chrome.notifications.getAll())).length, 1);
  const notice = page.getByRole('region', { name: 'Nhắc hạn công việc' });
  await notice.getByText('Nhắc a', { exact: true }).waitFor();
  await notice.getByText('Nhắc b', { exact: true }).waitFor();
  const popup = await extension.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.goto(`${base}/popup.html`);
  const popupNotice = popup.getByRole('region', { name: 'Nhắc hạn công việc' });
  await popupNotice.getByText('Nhắc a', { exact: true }).waitFor();
  await popupNotice.getByText('Nhắc b', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => chrome.action.getBadgeText({})), '2');
  const bounds = await popup.locator('.popup-shell').boundingBox();
  assert.ok(bounds.height <= 600, `Popup fits 600px: ${bounds.height}`);
  assert.equal(
    await popup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await popup.screenshot({ path: 'output/playwright/reminder-popup.png' });
  const viewPromise = extension.waitForEvent('page');
  await popupNotice.getByRole('button', { name: 'Xem task Nhắc a', exact: true }).click();
  const target = await viewPromise;
  await target.waitForURL(`${base}/index.html#task=a`);
  await target.locator('#task-a.reminder-target').waitFor();
  await target.close();
  assert.equal(await page.evaluate(() => chrome.action.getBadgeText({})), '2');
  await popup.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  assert.equal(await page.evaluate(() => chrome.action.getBadgeText({})), '2');
  await popupNotice.getByRole('button', { name: 'Đã xem', exact: true }).click();
  await popupNotice.waitFor({ state: 'hidden' });
  await notice.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => chrome.action.getBadgeText({})), 'Ⅱ');
  assert.deepEqual(
    await page.evaluate(() => chrome.action.getBadgeBackgroundColor({})),
    [255, 213, 128, 255],
  );
  await popup.reload();
  await popup.getByRole('button', { name: 'Tiếp tục tập trung', exact: true }).waitFor();
  assert.equal(await popupNotice.count(), 0);
  await popup.getByRole('button', { name: 'Tiếp tục tập trung', exact: true }).click();
  assert.equal(await page.evaluate(() => chrome.action.getBadgeText({})), '25m');
  const dueAgainAt = Date.now() + 2500;
  await command(taskCommand('a', dueAgainAt));
  await command(taskCommand('b', dueAgainAt));
  await popupNotice.getByText('Nhắc a', { exact: true }).waitFor();
  await popupNotice.getByText('Nhắc b', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => chrome.action.getBadgeText({})), '2');
  await popupNotice.getByRole('button', { name: 'Nhắc sau 10 phút', exact: true }).click();
  await popupNotice.waitFor({ state: 'hidden' });
  await notice.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => chrome.action.getBadgeText({})), '25m');
  state = await command({ type: 'get' });
  assert.equal(state.timer.id, runningTimerId);
  assert.equal(state.timer.status, 'running');
  await popup.close();
  checks.push(
    'Popup compact reminder lists names/due, opens the correct task, shares viewed/snooze state with New Tab and fits 360x600; badge prioritizes unread task count then restores paused/running Pomodoro',
  );
  const scheduledAt = state.tasks.find((t) => t.id === 'a').reminder.scheduledAt;
  assert.ok(scheduledAt > Date.now() + 590000 && scheduledAt <= Date.now() + 600000);
  assert.equal(state.tasks.find((t) => t.id === 'a').dueAt, dueAgainAt);
  assert.deepEqual(await page.evaluate(() => chrome.notifications.getAll()), {});
  await command({ type: 'task.toggle', id: 'a' });
  await command({ type: 'task.delete', id: 'b' });
  alarms = await page.evaluate(() => chrome.alarms.getAll());
  assert.equal(
    alarms.find((a) => a.name === 'little-shift-task-reminder').scheduledTime,
    dueAt + 3600000,
  );
  checks.push(
    'Real snooze command schedules +10 minutes without changing dueAt; completion/deletion cancels snooze and clears notification',
  );
  // Remove the alarm then stop worker. The next extension message restarts it and restores scheduling.
  await page.evaluate(() => chrome.alarms.clear('little-shift-task-reminder'));
  const running = [...versions.values()].find(
    (v) => v.scriptURL === `${base}/background.js` && v.runningStatus === 'running',
  );
  await cdp.send('ServiceWorker.stopWorker', { versionId: running.versionId });
  await command({ type: 'get' });
  assert.equal(
    (await page.evaluate(() => chrome.alarms.get('little-shift-task-reminder'))).scheduledTime,
    dueAt + 3600000,
  );
  checks.push('Worker startup restores a missing future task alarm from persisted state');
  await command({ type: 'data.reset', confirmed: true });
  assert.equal(
    await page.evaluate(() => chrome.alarms.get('little-shift-task-reminder')),
    undefined,
  );
  const permissions = await page.evaluate(() => chrome.permissions.getAll());
  assert.deepEqual(permissions.origins, []);
  evidence.permissions = permissions;
  checks.push('Reset clears the task alarm; extension requests no website access');
} finally {
  await extension.close();
  await rm(profile, { recursive: true, force: true });
}
assert.deepEqual(errors, []);
await writeFile(
  'output/playwright/reminders-report.json',
  JSON.stringify({ checks, errors, evidence }, null, 2),
);
console.log(JSON.stringify({ checks, errors }, null, 2));
