import { describe, expect, it, vi } from 'vitest';
import { Coordinator, type StorageAdapter } from '../src/domain/coordinator';
import { initialState, type State } from '../src/domain/model';
import { applyCommand } from '../src/domain/timer';

function harness(value: State = initialState()) {
  let persisted = structuredClone(value);
  const storage: StorageAdapter = {
    async read() {
      await Promise.resolve();
      return structuredClone(persisted);
    },
    async write(state) {
      await Promise.resolve();
      persisted = structuredClone(state);
    },
  };
  const effects = {
    sync: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    preview: vi.fn().mockResolvedValue(undefined),
  };
  let now = 1000000;
  return {
    coordinator: new Coordinator(storage, effects, () => now),
    effects,
    storage,
    persisted: () => persisted,
    setNow: (time: number) => {
      now = time;
    },
  };
}
describe('single timer coordinator', () => {
  it('serializes concurrent commands from multiple UI surfaces without losing tasks', async () => {
    const h = harness();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        h.coordinator.dispatch({
          type: 'task.save',
          task: {
            id: `task-${i}`,
            title: `Công việc ${i}`,
            day: '2026-11-04',
            priority: 'medium',
            estimated: 1,
          },
        }),
      ),
    );
    expect(h.persisted().tasks).toHaveLength(20);
    expect(h.persisted().revision).toBe(20);
    const results = await Promise.all([
      h.coordinator.dispatch({ type: 'timer.start' }),
      h.coordinator.dispatch({ type: 'timer.pause' }),
      h.coordinator.dispatch({ type: 'timer.start' }),
    ]);
    expect(new Set(results.map((s) => s.timer.id)).size).toBe(1);
    expect(h.persisted().timer.status).toBe('running');
  });
  it('commits completion before external effects and dispatches it once across racing reads', async () => {
    const state = initialState();
    applyCommand(state, { type: 'timer.start' }, 0);
    const h = harness(state);
    h.setNow(2000000);
    h.effects.complete.mockImplementation(async () => {
      expect(h.persisted().history).toHaveLength(1);
    });
    await Promise.all([
      h.coordinator.dispatch({ type: 'get' }),
      h.coordinator.dispatch({ type: 'get' }),
      h.coordinator.dispatch({ type: 'timer.start' }),
    ]);
    expect(h.effects.complete).toHaveBeenCalledTimes(1);
    expect(h.persisted().history).toHaveLength(1);
    expect(h.persisted().timer.mode).toBe('short');
  });
  it('does not duplicate side effects after a new coordinator instance starts', async () => {
    const state = initialState();
    applyCommand(state, { type: 'timer.start' }, 0);
    const h = harness(state);
    h.setNow(2000000);
    await h.coordinator.dispatch({ type: 'get' });
    const restarted = new Coordinator(h.storage, h.effects, () => 2100000);
    await restarted.dispatch({ type: 'get' });
    expect(h.effects.complete).toHaveBeenCalledTimes(1);
    expect(h.persisted().focusCount).toBe(1);
  });
  it('a rejected command does not poison the queue', async () => {
    const h = harness();
    await expect(h.coordinator.dispatch({ type: 'invalid' })).rejects.toThrow();
    await h.coordinator.dispatch({ type: 'timer.start' });
    expect(h.persisted().timer.status).toBe('running');
  });
  it('previewing a bell has no effect on history, revision or timer', async () => {
    const h = harness();
    const before = structuredClone(h.persisted());
    await h.coordinator.dispatch({ type: 'audio.preview', bell: 'soft', volume: 0.2 });
    expect(h.effects.preview).toHaveBeenCalledOnce();
    expect(h.effects.complete).not.toHaveBeenCalled();
    expect(h.persisted()).toEqual(before);
  });
});

it('reset clears recovery copies as well as tasks and history', async () => {
  const h = harness();
  const clear = vi.fn().mockResolvedValue(undefined);
  h.storage.clearRecovery = clear;
  await h.coordinator.dispatch({ type: 'data.reset', confirmed: true });
  expect(clear).toHaveBeenCalledOnce();
  expect(h.persisted().tasks).toHaveLength(0);
  expect(h.persisted().history).toHaveLength(0);
});
