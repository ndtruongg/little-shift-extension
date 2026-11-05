/* global document, localStorage, chrome, console, innerWidth, indexedDB */
import { chromium } from 'playwright';
import { preview } from 'vite';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

await mkdir('output/playwright', { recursive: true });
const rate = 22050;
const wav = Buffer.alloc(44 + rate * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(rate * 2, 40);
for (let i = 0; i < rate; i++)
  wav.writeInt16LE(Math.round(Math.sin((i / rate) * Math.PI * 2 * 440) * 500), 44 + i * 2);
const requests = [];
const mediaServer = createServer((request, response) => {
  requests.push(request.url);
  if (request.url === '/broken') {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'audio/wav',
    'Content-Length': wav.length,
    'Cache-Control': 'no-store',
  });
  response.end(wav);
});
await new Promise((resolve) => mediaServer.listen(0, '127.0.0.1', resolve));
const mediaOrigin = `http://127.0.0.1:${mediaServer.address().port}`;
const vite = await preview({ preview: { host: '127.0.0.1', port: 0 } });
const previewOrigin = `http://127.0.0.1:${vite.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const checks = [];
const errors = [];
function trackAudio() {
  globalThis.__testFileKeys = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open('little-shift-audio');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('files', 'readonly');
        const keys = transaction.objectStore('files').getAllKeys();
        keys.onsuccess = () => resolve(keys.result);
        keys.onerror = () => reject(keys.error);
        transaction.oncomplete = () => db.close();
      };
    });
  globalThis.__testAudioElements = [];
  globalThis.Audio = new Proxy(globalThis.Audio, {
    construct(target, args) {
      const audio = Reflect.construct(target, args);
      globalThis.__testAudioElements.push(audio);
      return audio;
    },
  });
}
async function selectLocal(page, dialog, name) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    dialog.getByRole('button', { name: 'Chọn file Mưa đêm', exact: true }).click(),
  ]);
  await chooser.setFiles({ name, mimeType: 'audio/wav', buffer: wav });
  await dialog.locator('.local-audio-name').filter({ hasText: name }).waitFor();
}
async function configure(page) {
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  const dialog = page.getByRole('dialog', { name: 'Chăm chút góc nhỏ' });
  for (const [label, name] of [
    ['Mưa đêm', 'rain'],
    ['Quán cà phê', 'cafe'],
    ['Rừng xanh', 'forest'],
  ])
    await dialog.getByLabel(`Link ${label}`, { exact: true }).fill(`${mediaOrigin}/${name}.wav`);
  return dialog;
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.on('weberror', (error) => errors.push(error.error().message));
  await context.addInitScript(trackAudio);
  const page = await context.newPage();
  await page.goto(previewOrigin);
  for (const [label, filename] of [
    ['Mưa đêm', 'rain'],
    ['Quán cà phê', 'coffee'],
    ['Rừng xanh', 'forest'],
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForFunction((filename) => {
      const playing = globalThis.__testAudioElements.filter((audio) => !audio.paused);
      const audio = playing[0];
      return (
        playing.length === 1 &&
        audio.readyState >= 2 &&
        audio.loop &&
        Number.isFinite(audio.duration) &&
        audio.duration > 1 &&
        audio.src.includes(`/assets/${filename}-`)
      );
    }, filename);
    const source = await page.evaluate(
      () => globalThis.__testAudioElements.find((audio) => !audio.paused).src,
    );
    assert.ok(source.includes(`/assets/${filename}-`) && source.endsWith('.mp3'), source);
    await page.evaluate(() => {
      const audio = globalThis.__testAudioElements.find((audio) => !audio.paused);
      audio.currentTime = audio.duration - 0.2;
    });
    await page.waitForFunction(() => {
      const playing = globalThis.__testAudioElements.filter((audio) => !audio.paused);
      return playing.length === 1 && !playing[0].seeking && playing[0].currentTime < 1.5;
    });
  }
  await page.getByRole('button', { name: 'Rừng xanh', exact: true }).click();
  await page.waitForFunction(() => globalThis.__testAudioElements.every((audio) => audio.paused));
  checks.push(
    'All three bundled MP3 tracks decode and loop past the end; switching modes leaves one active media player',
  );
  const dialog = await configure(page);
  await dialog.getByRole('button', { name: 'Nghe thử Mưa đêm', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Dừng thử Mưa đêm', exact: true })
    .waitFor({ state: 'visible' });
  await page.waitForFunction(() =>
    globalThis.__testAudioElements.some((a) => !a.paused && a.readyState >= 2),
  );
  assert.ok(requests.includes('/rain.wav'));
  assert.deepEqual(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('little-shift-state')).settings.ambientUrls,
    ),
    { rain: '', cafe: '', forest: '' },
  );
  checks.push('Unsaved direct URL previews actual cross-origin media without persisting the draft');
  await dialog.getByRole('button', { name: 'Dừng thử Mưa đêm', exact: true }).click();
  await page.waitForFunction(() => globalThis.__testAudioElements.every((a) => a.paused));
  await dialog.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await page.getByRole('button', { name: 'Mưa đêm', exact: true }).click();
  await page.waitForFunction(
    () => globalThis.__testAudioElements.filter((a) => !a.paused).length === 1,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  await dialog.getByLabel('Link Mưa đêm', { exact: true }).waitFor();
  assert.equal(
    await dialog.getByLabel('Link Mưa đêm', { exact: true }).inputValue(),
    `${mediaOrigin}/rain.wav`,
  );
  await dialog.getByLabel('Link Mưa đêm', { exact: true }).fill(`${mediaOrigin}/rain-v2.wav`);
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('little-shift-state')).settings.ambientUrls.rain,
    ),
    `${mediaOrigin}/rain.wav`,
  );
  checks.push('Links persist across reload; cancelling settings does not mutate the saved links');
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  await dialog.getByLabel('Link Mưa đêm', { exact: true }).fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: 'Nghe thử Mưa đêm', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'HTTP/HTTPS' }).waitFor();
  await dialog.getByLabel('Link Mưa đêm', { exact: true }).fill(`${mediaOrigin}/broken`);
  await dialog.getByRole('button', { name: 'Nghe thử Mưa đêm', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Không phát được link' }).last().waitFor();
  await dialog.getByLabel('Link Mưa đêm', { exact: true }).fill(`${mediaOrigin}/rain-v2.wav`);
  await dialog.getByRole('button', { name: 'Nghe thử Mưa đêm', exact: true }).click();
  await page.waitForFunction(() =>
    globalThis.__testAudioElements.some((a) => !a.paused && a.src.endsWith('/rain-v2.wav')),
  );
  await dialog.getByRole('button', { name: 'Dừng thử Mưa đêm', exact: true }).click();
  await dialog.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await page.waitForFunction(
    () =>
      globalThis.__testAudioElements.filter((a) => !a.paused).length === 1 &&
      globalThis.__testAudioElements.some((a) => !a.paused && a.src.endsWith('/rain-v2.wav')),
  );
  checks.push(
    'Invalid and broken links report errors; a valid replacement recovers and restarts the active sound',
  );
  const twin = await context.newPage();
  await twin.goto(previewOrigin);
  const twinSettings = await configure(twin);
  await twinSettings.getByRole('button', { name: 'Nghe thử Rừng xanh', exact: true }).click();
  await twin.waitForFunction(
    () => document.querySelector('button[aria-label="Dừng thử Rừng xanh"]')?.disabled === false,
  );
  await page.waitForFunction(
    () =>
      globalThis.__testAudioElements.filter((a) => !a.paused).length === 1 &&
      globalThis.__testAudioElements.some((a) => !a.paused && a.src.endsWith('/forest.wav')),
  );
  assert.equal(
    await twin.evaluate(() => globalThis.__testAudioElements.filter((a) => !a.paused).length),
    0,
  );
  await twinSettings.getByRole('button', { name: 'Dừng thử Rừng xanh', exact: true }).click();
  await twin.close();
  checks.push(
    'Preview from another tab uses the existing audio owner and restores the prior sound',
  );
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  await dialog.getByLabel('Link Mưa đêm', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playwright/audio-links-settings-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByLabel('Link Quán cà phê', { exact: true }).scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'output/playwright/audio-links-settings-mobile.png' });
  checks.push('Audio link settings render at desktop and mobile widths');
  await page.setViewportSize({ width: 1440, height: 900 });
  await selectLocal(page, dialog, 'draft-rain.wav');
  await dialog.getByRole('button', { name: 'Nghe thử Mưa đêm', exact: true }).click();
  await page.waitForFunction(() =>
    globalThis.__testAudioElements.some((a) => !a.paused && a.src.startsWith('blob:')),
  );
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('little-shift-state')).settings.ambientFiles.rain,
    ),
    null,
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__testFileKeys().then((keys) => keys.length === 0));
  checks.push(
    'A picked local file previews without saving; cancelling settings removes the staged Blob',
  );
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  await selectLocal(page, dialog, 'saved-rain.wav');
  await dialog.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.reload();
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  await dialog.locator('.local-audio-name').filter({ hasText: 'saved-rain.wav' }).waitFor();
  assert.equal(await dialog.getByLabel('Link Mưa đêm', { exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Mưa đêm', exact: true }).click();
  await page.waitForFunction(() => globalThis.__testAudioElements.every((a) => a.paused));
  await page.getByRole('button', { name: 'Mưa đêm', exact: true }).click();
  await page.waitForFunction(() =>
    globalThis.__testAudioElements.some(
      (a) => !a.paused && a.src.startsWith('blob:') && a.readyState >= 2,
    ),
  );
  await context.setOffline(false);
  checks.push('Saved local audio survives reload and plays from IndexedDB while offline');
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  await dialog.getByRole('button', { name: 'Xóa file Mưa đêm', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  await dialog.locator('.local-audio-name').filter({ hasText: 'saved-rain.wav' }).waitFor();
  await dialog.getByRole('button', { name: 'Xóa file Mưa đêm', exact: true }).click();
  await dialog.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await page.waitForFunction(() => globalThis.__testFileKeys().then((keys) => keys.length === 0));
  checks.push('Removing a saved file is reversible before Save and deletes its Blob after Save');
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  const [emptyChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    dialog.getByRole('button', { name: 'Chọn file Mưa đêm', exact: true }).click(),
  ]);
  await emptyChooser.setFiles({
    name: 'empty.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.alloc(0),
  });
  await dialog.getByRole('alert').filter({ hasText: 'File âm thanh trống' }).waitFor();
  await selectLocal(page, dialog, 'settings-rain.wav');
  await dialog.locator('.local-audio-row').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playwright/local-audio-settings-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.locator('.local-audio-row').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playwright/local-audio-settings-mobile.png' });
  await context.close();
} finally {
  await browser.close();
}

const profile = await mkdtemp(join(tmpdir(), 'little-shift-links-'));
let extension;
try {
  const directory = resolve('dist');
  extension = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
  });
  await extension.addInitScript(trackAudio);
  extension.on('weberror', (error) => errors.push(error.error().message));
  const worker = extension.serviceWorkers()[0] ?? (await extension.waitForEvent('serviceworker'));
  const base = `chrome-extension://${worker.url().split('/')[2]}`;
  const page = await extension.newPage();
  await page.goto(`${base}/index.html`);
  await extension.setOffline(true);
  for (const sound of ['rain', 'cafe', 'forest']) {
    const response = await page.evaluate(
      (sound) =>
        chrome.runtime.sendMessage({
          target: 'background',
          command: {
            type: 'audio.ambientPreview',
            sound,
            url: '',
            volume: 0.1,
          },
        }),
      sound,
    );
    assert.equal(response.ok, true, response.error);
  }
  const stopped = await page.evaluate(() =>
    chrome.runtime.sendMessage({ target: 'background', command: { type: 'audio.previewStop' } }),
  );
  assert.equal(stopped.ok, true);
  assert.equal(
    (
      await page.evaluate(() =>
        chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }),
      )
    ).length,
    1,
  );
  await extension.setOffline(false);
  checks.push(
    'Unpacked extension plays all three bundled defaults through one offscreen document with network offline',
  );
  const dialog = await configure(page);
  await dialog.getByRole('button', { name: 'Nghe thử Mưa đêm', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="Dừng thử Mưa đêm"]')?.disabled === false,
  );
  const contexts = await page.evaluate(() =>
    chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }),
  );
  assert.equal(contexts.length, 1);
  await dialog.getByRole('button', { name: 'Dừng thử Mưa đêm', exact: true }).click();
  await dialog.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  const state = await page.evaluate(() =>
    chrome.runtime.sendMessage({ target: 'background', command: { type: 'get' } }),
  );
  assert.equal(state.state.settings.ambientUrls.rain, `${mediaOrigin}/rain.wav`);
  assert.equal(state.state.history.length, 0);
  const permissions = await page.evaluate(() => chrome.permissions.getAll());
  assert.deepEqual(permissions.origins, []);
  assert.ok(
    permissions.permissions.every((permission) =>
      ['alarms', 'notifications', 'offscreen', 'storage', 'newTabPageOverride'].includes(
        permission,
      ),
    ),
  );
  checks.push(
    'Unpacked extension plays direct media through one offscreen document with no added host permissions',
  );
  await page.getByRole('button', { name: 'Mưa đêm', exact: true }).click();
  const twin = await extension.newPage();
  await twin.goto(`${base}/index.html`);
  await twin.getByRole('button', { name: 'Quán cà phê', exact: true }).click();
  const current = await page.evaluate(() =>
    chrome.runtime.sendMessage({ target: 'background', command: { type: 'get' } }),
  );
  assert.equal(current.state.settings.ambient, 'cafe');
  assert.equal(
    (
      await page.evaluate(() =>
        chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }),
      )
    ).length,
    1,
  );
  checks.push('Custom media modes synchronize between extension tabs');
  await twin.close();
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  await selectLocal(page, dialog, 'extension-rain.wav');
  await dialog.getByRole('button', { name: 'Nghe thử Mưa đêm', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="Dừng thử Mưa đêm"]')?.disabled === false,
  );
  await dialog.getByRole('button', { name: 'Dừng thử Mưa đêm', exact: true }).click();
  await dialog.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.reload();
  await page.getByRole('button', { name: 'Mở cài đặt' }).click();
  await dialog.locator('.local-audio-name').filter({ hasText: 'extension-rain.wav' }).waitFor();
  await dialog.getByRole('button', { name: 'Nghe thử Mưa đêm', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="Dừng thử Mưa đêm"]')?.disabled === false,
  );
  assert.equal(await dialog.locator('.inline-error').count(), 0);
  await dialog.getByRole('button', { name: 'Dừng thử Mưa đêm', exact: true }).click();
  assert.equal(
    (
      await page.evaluate(() =>
        chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }),
      )
    ).length,
    1,
  );
  checks.push(
    'Unpacked extension reloads the saved local file and plays it through one offscreen document',
  );
  await dialog.getByRole('button', { name: 'Đặt lại toàn bộ dữ liệu', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Xóa toàn bộ dữ liệu?' })
    .getByRole('button', { name: 'Xóa toàn bộ', exact: true })
    .click();
  await dialog.getByRole('status').filter({ hasText: 'Đã đặt lại dữ liệu' }).waitFor();
  assert.deepEqual(await page.evaluate(() => globalThis.__testFileKeys()), []);
  checks.push('Reset clears local audio bytes as well as settings in the unpacked extension');
  assert.deepEqual(errors, []);
  await writeFile(
    'output/playwright/audio-links-report.json',
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await extension?.close();
  await rm(profile, { recursive: true, force: true });
  await new Promise((resolve) => vite.httpServer.close(resolve));
  mediaServer.closeAllConnections();
  await new Promise((resolve) => mediaServer.close(resolve));
}
