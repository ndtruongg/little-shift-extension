import { describe, expect, it } from 'vitest';
import { initialState, localDay, newTimer, type State } from '../src/domain/model';
import { applyCommand, formatTime, reconcile, remaining } from '../src/domain/timer';
import { statistics } from '../src/domain/statistics';

const at = new Date(2026, 10, 4, 10, 0).getTime();
function started() {
  const state = initialState();
  applyCommand(state, { type: 'timer.start' }, at);
  return state;
}
function finish(state: State, now = at) {
  applyCommand(state, { type: 'timer.start' }, now);
  return reconcile(state, state.timer.endAt!);
}

describe('timestamp timer', () => {
  it('starts once, derives time from endAt and never adds time on duplicate start', () => {
    const state = started();
    const endAt = state.timer.endAt;
    expect(remaining(state.timer, at + 13610)).toBe(25 * 60000 - 13610);
    applyCommand(state, { type: 'timer.start' }, at + 30000);
    expect(state.timer.endAt).toBe(endAt);
    expect(formatTime(remaining(state.timer, at + 1001))).toBe('24:59');
  });
  it('pause captures remaining milliseconds; resume excludes paused wall time', () => {
    const state = started();
    applyCommand(state, { type: 'timer.pause' }, at + 7000);
    expect(state.timer.status).toBe('paused');
    expect(state.timer.endAt).toBeNull();
    expect(remaining(state.timer, at + 90000)).toBe(1493000);
    applyCommand(state, { type: 'timer.start' }, at + 90000);
    expect(state.timer.endAt).toBe(at + 90000 + 1493000);
    expect(state.timer.startedAt).toBe(at);
  });
  it('rejects reset/mode without confirmation and stores abandonment without Focus credit', () => {
    const state = started();
    expect(() => applyCommand(state, { type: 'timer.reset' }, at + 5000)).toThrow('xác nhận');
    expect(() => applyCommand(state, { type: 'timer.mode', mode: 'short' }, at + 5000)).toThrow(
      'xác nhận',
    );
    applyCommand(state, { type: 'timer.reset', confirmed: true }, at + 5000);
    expect(state.timer.status).toBe('idle');
    expect(state.history[0]?.result).toBe('abandoned');
    expect(statistics(state, at).count).toBe(0);
    expect(state.focusCount).toBe(0);
  });
  it('completes exactly once and leaves the next mode idle by default', () => {
    const state = started();
    const id = state.timer.id;
    expect(reconcile(state, at + 1500000)?.id).toBe(id);
    expect(reconcile(state, at + 1600000)).toBeNull();
    expect(state.history).toHaveLength(1);
    expect(state.focusCount).toBe(1);
    expect(state.timer.status).toBe('idle');
    expect(state.timer.mode).toBe('short');
  });
  it('recovers an overdue persisted session once after restart', () => {
    const serialized = JSON.stringify(started());
    const recovered = JSON.parse(serialized) as State;
    const wake = at + 8 * 3600000;
    const completion = reconcile(recovered, wake);
    expect(completion?.at).toBe(wake);
    expect(recovered.history[0]?.endedAt).toBe(at + 1500000);
    expect(reconcile(recovered, wake)).toBeNull();
    expect(recovered.history).toHaveLength(1);
  });
  it('auto-start begins at actual wake time and does not backfill sleeping hours', () => {
    const state = started();
    state.settings.autoBreak = true;
    state.settings.autoFocus = true;
    const wake = at + 12 * 3600000;
    reconcile(state, wake);
    expect(state.timer.startedAt).toBe(wake);
    expect(state.timer.endAt).toBe(wake + 5 * 60000);
    reconcile(state, wake);
    expect(state.history).toHaveLength(1);
  });
  it('recommends long breaks only after the configured number of completed Focus sessions', () => {
    const state = initialState();
    for (let i = 1; i <= 4; i++) {
      state.timer = newTimer('focus', state.settings);
      const completion = finish(state, at + i * 3600000);
      expect(completion?.nextMode).toBe(i === 4 ? 'long' : 'short');
    }
    expect(state.focusCount).toBe(4);
    finish(state, at + 6 * 3600000);
    expect(state.focusCount).toBe(4);
    expect(state.timer.mode).toBe('focus');
  });
  it('de-duplicates a completion ID recovered from inconsistent storage', () => {
    const state = started();
    const running = structuredClone(state.timer);
    reconcile(state, at + 1500000);
    state.timer = running;
    expect(reconcile(state, at + 1600000)).toBeNull();
    expect(state.history).toHaveLength(1);
    expect(state.focusCount).toBe(1);
    expect(state.timer.status).toBe('idle');
  });
});

describe('tasks and statistics', () => {
  function withTask() {
    const state = initialState();
    applyCommand(
      state,
      {
        type: 'task.save',
        task: {
          dueAt: null,
          reminderOffsetMinutes: null,
          id: 'task-1',
          title: 'Viết tài liệu',
          day: localDay(at),
          priority: 'high',
          estimated: 2,
        },
      },
      at,
    );
    return state;
  }
  it('increments Pomodoro progress without completing a task', () => {
    const state = withTask();
    finish(state);
    expect(state.tasks[0]?.completed).toBe(1);
    expect(state.tasks[0]?.doneAt).toBeNull();
    expect(statistics(state, at)).toMatchObject({ count: 1, minutes: 25, tasks: 0 });
  });
  it('deleting the current task keeps the timer and historical name', () => {
    const state = withTask();
    applyCommand(state, { type: 'timer.start' }, at);
    const endAt = state.timer.endAt;
    applyCommand(state, { type: 'task.delete', id: 'task-1' }, at + 1000);
    expect(state.timer.status).toBe('running');
    expect(state.timer.endAt).toBe(endAt);
    expect(state.timer.taskId).toBeNull();
    expect(state.activeTaskId).toBeNull();
    reconcile(state, endAt!);
    expect(state.history[0]?.taskTitle).toBe('Viết tài liệu');
  });
  it('retains the snapshot name when a task is edited or deleted after completion', () => {
    const state = withTask();
    finish(state);
    applyCommand(state, { type: 'task.delete', id: 'task-1' }, at + 1500001);
    expect(state.history[0]?.taskTitle).toBe('Viết tài liệu');
    expect(statistics(state, at).count).toBe(1);
  });
  it('groups by local completion day and excludes breaks/abandonment', () => {
    const state = initialState();
    const midnight = new Date(2026, 10, 5, 0, 0).getTime();
    finish(state, midnight - 600000);
    state.timer = newTimer('short', state.settings);
    finish(state, midnight + 1800000);
    expect(statistics(state, midnight - 1).count).toBe(0);
    expect(statistics(state, midnight + 3600000)).toMatchObject({ count: 1, minutes: 25 });
    expect(statistics(state, midnight + 3600000).days).toHaveLength(7);
  });
  it('moves work in order and carries overdue tasks to local today', () => {
    const state = withTask();
    applyCommand(
      state,
      {
        type: 'task.save',
        task: {
          dueAt: null,
          reminderOffsetMinutes: null,
          id: 'task-2',
          title: 'Task thứ hai',
          day: '2026-11-03',
          priority: 'low',
          estimated: 1,
        },
      },
      at,
    );
    applyCommand(state, { type: 'task.move', id: 'task-2', direction: 'up' }, at);
    expect(state.tasks[0]?.id).toBe('task-2');
    applyCommand(state, { type: 'task.today', id: 'task-2' }, at);
    expect(state.tasks[0]?.day).toBe(localDay(at));
  });
});
