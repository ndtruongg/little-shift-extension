import { describe, expect, it, vi } from 'vitest';
import { decodeState, initialState, parseImport } from '../src/domain/model';
import { commandSchema } from '../src/domain/protocol';
import { restore } from '../src/platform/storage';
import { applyCommand } from '../src/domain/timer';

describe('schema validation and migration', () => {
  it('round-trips exported state and applies defaults to missing settings', () => {
    const state = initialState();
    expect(parseImport(JSON.stringify(state))).toEqual(state);
    const raw = { ...state, settings: { focus: 30 } };
    expect(decodeState(raw).settings).toMatchObject({ focus: 30, short: 5, animation: true });
  });
  it('migrates v1 with defaults while preserving tasks and history', () => {
    const {
      revision: _revision,
      focusCount: _count,
      lastCompletion: _last,
      ...v1
    } = initialState();
    expect(decodeState({ ...v1, schemaVersion: 1 })).toMatchObject({
      schemaVersion: 2,
      revision: 0,
      focusCount: 0,
      lastCompletion: null,
    });
  });
  it.each([
    null,
    [],
    {},
    { schemaVersion: 999 },
    { ...initialState(), settings: { focus: 0 } },
    { ...initialState(), settings: { short: 61 } },
  ])('rejects malformed or unsupported data: %j', (data) => {
    expect(() => decodeState(data)).toThrow();
  });
  it('rejects invalid JSON, duplicate IDs, invalid dates and impossible timer invariants', () => {
    expect(() => parseImport('not json')).toThrow('JSON');
    expect(() => parseImport('x'.repeat(5000001))).toThrow('5 MB');
    const state = initialState();
    applyCommand(
      state,
      {
        type: 'task.save',
        task: { id: 'task', title: 'One', day: '2026-11-04', priority: 'low', estimated: 1 },
      },
      0,
    );
    state.tasks.push({ ...state.tasks[0]! });
    expect(() => decodeState(state)).toThrow('trùng');
    state.tasks.pop();
    state.tasks[0]!.day = '2026-02-31';
    expect(() => decodeState(state)).toThrow('Ngày');
    state.tasks[0]!.day = '2026-02-28';
    state.timer.status = 'running';
    expect(() => decodeState(state)).toThrow('đồng hồ');
  });
  it('import resets the active timer and sound instead of dispatching stale completion', () => {
    const imported = initialState();
    imported.settings.ambient = 'rain';
    applyCommand(imported, { type: 'timer.start' }, 1000);
    const result = applyCommand(
      initialState(),
      { type: 'data.import', json: JSON.stringify(imported), confirmed: true },
      99999999,
    );
    expect(result.timer.status).toBe('idle');
    expect(result.timer.id).not.toBe(imported.timer.id);
    expect(result.settings.ambient).toBe('off');
  });
  it('backs up corrupt local data before offering a fresh state', async () => {
    const backup = vi.fn().mockResolvedValue(undefined);
    const state = await restore({ corrupt: true }, backup);
    expect(backup).toHaveBeenCalledExactlyOnceWith({ corrupt: true });
    expect(state.recoveryNotice).toContain('bị lỗi');
    expect(state.tasks).toHaveLength(0);
    expect(state.settings.ambient).toBe('off');
  });
  it('validates commands coming from extension messages', () => {
    expect(() => commandSchema.parse({ type: 'settings.save', settings: { focus: -1 } })).toThrow();
    expect(() => commandSchema.parse({ type: 'data.reset', confirmed: false })).toThrow();
    expect(() => commandSchema.parse({ type: 'audio.preview', bell: 'bit', volume: 2 })).toThrow();
  });
});

it('persists a recovered state once after saving the corrupted original', async () => {
  const events: string[] = [];
  const state = await restore(
    { schemaVersion: 999 },
    async () => {
      events.push('backup');
    },
    async (safe) => {
      events.push('persist');
      expect(safe.recoveryNotice).toBeTruthy();
      expect(() => decodeState(safe)).not.toThrow();
    },
  );
  expect(events).toEqual(['backup', 'persist']);
  expect(state.revision).toBeGreaterThan(0);
});

it('rejects out-of-range Date timestamps before they reach statistics', () => {
  const state = initialState();
  state.timer.startedAt = 1e200;
  expect(() => decodeState(state)).toThrow();
});

it('loads existing v2 settings without links and round-trips custom links through JSON', () => {
  const state = initialState();
  const { ambientUrls: _links, ...oldSettings } = state.settings;
  expect(decodeState({ ...state, settings: oldSettings }).settings.ambientUrls).toEqual({
    rain: '',
    cafe: '',
    forest: '',
  });
  state.settings.ambientUrls = {
    rain: 'https://audio.example/rain.mp3',
    cafe: '',
    forest: 'https://audio.example/forest.ogg?token=example',
  };
  expect(parseImport(JSON.stringify(state)).settings.ambientUrls).toEqual(
    state.settings.ambientUrls,
  );
});

it.each([
  'javascript:alert(1)',
  'data:audio/wav;base64,AAAA',
  'file:///tmp/audio.wav',
  'https://user:password@example.com/audio.mp3',
  'not a link',
])('rejects invalid custom audio URL: %s', (url) => {
  const state = initialState();
  state.settings.ambientUrls.rain = url;
  expect(() => decodeState(state)).toThrow('HTTP/HTTPS');
});
