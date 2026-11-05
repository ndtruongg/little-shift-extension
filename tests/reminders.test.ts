import { describe, expect, it, vi } from 'vitest';
import {
  initialState,
  decodeState,
  parseImport,
  taskSchema,
  type State,
  type Task,
} from '../src/domain/model';
import { commandSchema, type Command } from '../src/domain/protocol';
import { applyCommand } from '../src/domain/timer';
import { Coordinator, type StorageAdapter } from '../src/domain/coordinator';
import {
  claimDueReminders,
  unreadReminderBatches,
  nextReminderAt,
  reminderTime,
  isDueSoon,
  isOverdue,
  formatDue,
  fromLocalInput,
  toLocalInput,
  nextTaskLabelAt,
} from '../src/domain/reminders';

const NOW = new Date(2026, 10, 4, 10).getTime();
function save(
  id: string,
  dueAt: number | null = NOW + 3600000,
  offset: Task['reminderOffsetMinutes'] = 15,
): Extract<Command, { type: 'task.save' }> {
  const command = commandSchema.parse({
    type: 'task.save',
    task: {
      id,
      title: `Việc ${id}`,
      day: '2026-11-03',
      priority: 'medium',
      estimated: 1,
      dueAt,
      reminderOffsetMinutes: dueAt === null ? null : offset,
    },
  });
  if (command.type !== 'task.save') throw new Error('Expected task.save');
  return command;
}
function taskState() {
  const state = initialState();
  applyCommand(state, save('a'), NOW);
  return state;
}
function harness(state: State = taskState()) {
  let persisted = structuredClone(state);
  let now = NOW;
  const storage: StorageAdapter = {
    read: async () => structuredClone(persisted),
    write: async (value) => {
      persisted = decodeState(structuredClone(value));
    },
  };
  const effects = {
    sync: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    preview: vi.fn().mockResolvedValue(undefined),
    remind: vi.fn().mockResolvedValue(undefined),
  };
  return {
    storage,
    effects,
    coordinator: new Coordinator(storage, effects, () => now),
    read: () => persisted,
    clock: (value: number) => {
      now = value;
    },
  };
}

describe('task reminders', () => {
  it('finds the nearest reminder, batches every due item, and leaves later items scheduled', () => {
    const state = taskState();
    applyCommand(state, save('b'), NOW);
    applyCommand(state, save('c', NOW + 7200000, 0), NOW);
    applyCommand(state, save('no-due', null), NOW);
    expect(nextReminderAt(state)).toBe(NOW + 45 * 60000);
    expect(claimDueReminders(state, NOW + 44 * 60000)).toBeNull();
    const batch = claimDueReminders(state, NOW + 45 * 60000)!;
    expect(batch.tasks.map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect(new Set(state.tasks.slice(0, 2).map((t) => t.reminder!.notificationId))).toEqual(
      new Set([batch.id]),
    );
    expect(nextReminderAt(state)).toBe(NOW + 7200000);
    expect(claimDueReminders(state, NOW + 45 * 60000)).toBeNull();
  });
  it.each(['task.delete', 'task.toggle'] as const)('ignores old alarms after %s', async (type) => {
    const h = harness();
    await h.coordinator.dispatch({ type, id: 'a' });
    h.clock(NOW + 7200000);
    await h.coordinator.dispatch({ type: 'get' });
    expect(h.effects.remind).not.toHaveBeenCalled();
    expect(nextReminderAt(h.read())).toBeNull();
  });
  it('applies an edit before claiming the old alarm and invalidates its token', async () => {
    const h = harness();
    const oldId = h.read().tasks[0]!.reminder!.id;
    h.clock(NOW + 3600000);
    await h.coordinator.dispatch(save('a', NOW + 10800000, 30));
    expect(h.effects.remind).not.toHaveBeenCalled();
    expect(h.read().tasks[0]!.reminder!.id).not.toBe(oldId);
    expect(nextReminderAt(h.read())).toBe(NOW + 9000000);
  });
  it('persistently claims once before effects across racing tabs and new worker instances', async () => {
    const h = harness();
    h.clock(NOW + 7200000);
    h.effects.remind.mockImplementation(async (batch) => {
      expect(h.read().tasks[0]!.reminder).toMatchObject({
        scheduledAt: null,
        handledAt: NOW + 7200000,
        notificationId: batch.id,
      });
    });
    await Promise.all(Array.from({ length: 8 }, () => h.coordinator.dispatch({ type: 'get' })));
    const restarted = new Coordinator(h.storage, h.effects, () => NOW + 86400000);
    await restarted.dispatch({ type: 'get' });
    expect(h.effects.remind).toHaveBeenCalledOnce();
  });
  it('recovers unclaimed missed reminders together, then does not replay on subsequent startup', async () => {
    const state = taskState();
    applyCommand(state, save('b', NOW + 7200000, 0), NOW);
    const h = harness(state);
    const restart = () => new Coordinator(h.storage, h.effects, () => NOW + 86400000);
    await restart().dispatch({ type: 'get' });
    expect(h.effects.remind.mock.calls[0]![0].tasks).toHaveLength(2);
    await restart().dispatch({ type: 'get' });
    expect(h.effects.remind).toHaveBeenCalledOnce();
    expect(nextReminderAt(h.read())).toBeNull();
  });
  it('recovers the next future deadline on a fresh coordinator without storage polling/writes', async () => {
    const h = harness();
    const write = vi.spyOn(h.storage, 'write');
    const next = await new Coordinator(h.storage, h.effects, () => NOW).dispatch({ type: 'get' });
    expect(nextReminderAt(next)).toBe(NOW + 2700000);
    expect(h.effects.sync).toHaveBeenCalledWith(next);
    expect(write).not.toHaveBeenCalled();
  });
  it('does not retry after an effect fails or after a claimed batch survives a worker interruption', async () => {
    const h = harness();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.effects.remind.mockRejectedValueOnce(new Error('interrupted'));
    h.clock(NOW + 7200000);
    await h.coordinator.dispatch({ type: 'get' });
    await new Coordinator(h.storage, h.effects, () => NOW + 86400000).dispatch({ type: 'get' });
    expect(h.effects.remind).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
  it('snoozes the entire batch once without changing dueAt and ignores duplicate/stale clicks', async () => {
    const state = taskState();
    applyCommand(state, save('b'), NOW);
    const h = harness(state);
    h.clock(NOW + 2700000);
    await h.coordinator.dispatch({ type: 'get' });
    const id = h.effects.remind.mock.calls[0]![0].id;
    await h.coordinator.dispatch({ type: 'reminder.snooze', notificationId: id });
    expect(nextReminderAt(h.read())).toBe(NOW + 3300000);
    expect(h.read().tasks.every((t) => t.dueAt === NOW + 3600000)).toBe(true);
    h.clock(NOW + 2800000);
    await h.coordinator.dispatch({ type: 'reminder.snooze', notificationId: id });
    expect(nextReminderAt(h.read())).toBe(NOW + 3300000);
    h.clock(NOW + 3300000);
    await h.coordinator.dispatch({ type: 'get' });
    expect(h.effects.remind).toHaveBeenCalledTimes(2);
    expect(h.effects.remind.mock.calls[1]![0].id).not.toBe(id);
  });
  it.each(['task.delete', 'task.toggle'] as const)('cancels snooze on %s', async (type) => {
    const h = harness();
    h.clock(NOW + 2700000);
    await h.coordinator.dispatch({ type: 'get' });
    await h.coordinator.dispatch({
      type: 'reminder.snooze',
      notificationId: h.effects.remind.mock.calls[0]![0].id,
    });
    await h.coordinator.dispatch({ type, id: 'a' });
    h.clock(NOW + 3300000);
    await h.coordinator.dispatch({ type: 'get' });
    expect(h.effects.remind).toHaveBeenCalledOnce();
    expect(nextReminderAt(h.read())).toBeNull();
  });
  it('retains processed reminders on title/day edits and makes new schedules on changed due/offset', async () => {
    const h = harness();
    h.clock(NOW + 2700000);
    await h.coordinator.dispatch({ type: 'get' });
    const old = structuredClone(h.read().tasks[0]!.reminder);
    const edit = save('a');
    edit.task.title = 'Tên mới';
    edit.task.day = '2026-11-05';
    await h.coordinator.dispatch(edit);
    expect(h.read().tasks[0]!.reminder).toEqual(old);
    await h.coordinator.dispatch(save('a', NOW + 7200000, 5));
    expect(h.read().tasks[0]!.reminder!.id).not.toBe(old!.id);
    await h.coordinator.dispatch({ type: 'reminder.snooze', notificationId: old!.notificationId });
    expect(nextReminderAt(h.read())).toBe(NOW + 6900000);
  });
  it('reopening only schedules when the original reminder time is still future', async () => {
    const h = harness();
    await h.coordinator.dispatch({ type: 'task.toggle', id: 'a' });
    await h.coordinator.dispatch({ type: 'task.toggle', id: 'a' });
    expect(nextReminderAt(h.read())).toBe(NOW + 2700000);
    await h.coordinator.dispatch({ type: 'task.toggle', id: 'a' });
    h.clock(NOW + 2700000);
    await h.coordinator.dispatch({ type: 'task.toggle', id: 'a' });
    expect(nextReminderAt(h.read())).toBeNull();
    expect(h.effects.remind).not.toHaveBeenCalled();
  });
  it('demands an explicit choice for past reminders; skip stays handled and now notifies once', async () => {
    const h = harness(initialState());
    const command = save('past', NOW - 60000, 0);
    await expect(h.coordinator.dispatch(command)).rejects.toThrow('Thời điểm nhắc đã qua');
    expect(h.read().tasks).toHaveLength(0);
    expect(h.effects.remind).not.toHaveBeenCalled();
    await h.coordinator.dispatch({ ...command, pastReminder: 'skip' });
    await h.coordinator.dispatch({ type: 'get' });
    expect(h.effects.remind).not.toHaveBeenCalled();
    await h.coordinator.dispatch({ ...save('now', NOW - 60000, 0), pastReminder: 'now' });
    await h.coordinator.dispatch({ type: 'get' });
    expect(h.effects.remind).toHaveBeenCalledOnce();
  });
  it('moving a planned day to today never changes dueAt, reminder offset or token', () => {
    const state = taskState();
    const before = structuredClone(state.tasks[0]!);
    applyCommand(state, { type: 'task.today', id: 'a' }, NOW);
    expect(state.tasks[0]).toEqual({ ...before, day: '2026-11-04' });
  });
  it('validates offset, date values and reminder state; disabling due clears reminders', async () => {
    for (const dueAt of [NaN, Infinity, -1, 8640000000000001, '2026-02-30'])
      expect(taskSchema.safeParse({ ...taskState().tasks[0], dueAt }).success).toBe(false);
    expect(
      commandSchema.safeParse({
        type: 'task.save',
        task: {
          ...save('bad').task,
          reminderOffsetMinutes: 7,
        },
      }).success,
    ).toBe(false);
    const h = harness();
    await expect(
      h.coordinator.dispatch({
        ...save('bad', null),
        task: {
          ...save('bad', null).task,
          reminderOffsetMinutes: 0,
        },
      }),
    ).rejects.toThrow('Chỉ bật nhắc');
    await h.coordinator.dispatch(save('a', null));
    expect(h.read().tasks[0]!.reminder).toBeNull();
    const invalid = taskState();
    invalid.tasks[0]!.dueAt = null;
    expect(() => decodeState(invalid)).toThrow('lời nhắc');
  });
});

describe('migration / import / export', () => {
  it.each([1, 2])('migrates v%s tasks to no due or reminders', (version) => {
    const state = taskState();
    const raw = JSON.parse(JSON.stringify(state));
    raw.schemaVersion = version;
    for (const task of raw.tasks) {
      delete task.dueAt;
      delete task.reminderOffsetMinutes;
      delete task.reminder;
    }
    delete raw.settings.taskBellEnabled;
    delete raw.settings.taskBellVolume;
    const migrated = decodeState(raw);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.tasks[0]).toMatchObject({
      dueAt: null,
      reminderOffsetMinutes: null,
      reminder: null,
    });
    expect(nextReminderAt(migrated)).toBeNull();
    expect(migrated.settings.taskBellEnabled).toBe(true);
  });
  it('round-trips due dates, snoozes and processed claims and recomputes on import/reset', async () => {
    const state = taskState();
    const batch = claimDueReminders(state, NOW + 2700000)!;
    applyCommand(state, save('b', NOW + 7200000, 0), NOW);
    const decoded = parseImport(JSON.stringify(state));
    expect(decoded.tasks).toEqual(state.tasks);
    expect(decoded.tasks[0]!.reminder!.notificationId).toBe(batch.id);
    const h = harness(initialState());
    await h.coordinator.dispatch({
      type: 'data.import',
      confirmed: true,
      json: JSON.stringify(state),
    });
    expect(nextReminderAt(h.read())).toBe(NOW + 7200000);
    await h.coordinator.dispatch({ type: 'reminder.snooze', notificationId: batch.id });
    expect(parseImport(JSON.stringify(h.read())).tasks).toEqual(h.read().tasks);
    await h.coordinator.dispatch({ type: 'data.reset', confirmed: true });
    expect(nextReminderAt(h.read())).toBeNull();
  });
});

describe('local date UI', () => {
  it('parses local datetime, clears optionally and rejects invalid / normalized dates', () => {
    expect(fromLocalInput('2026-11-04T10:00')).toBe(NOW);
    expect(toLocalInput(NOW)).toBe('2026-11-04T10:00');
    expect(fromLocalInput('')).toBeNull();
    expect(toLocalInput(null)).toBe('');
    for (const value of ['2026-02-30T10:00', 'not-date', '2026-11-04T25:00', '2026-11-04T10:00Z'])
      expect(() => fromLocalInput(value)).toThrow('Ngày giờ không hợp lệ');
  });
  it('labels today/tomorrow/calendar dates and defines overdue / upcoming boundaries', () => {
    expect(formatDue(NOW + 3600000, NOW)).toBe('Hôm nay, 11:00');
    const tomorrow = new Date(NOW);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(formatDue(tomorrow.getTime(), NOW)).toBe('Ngày mai, 10:00');
    expect(formatDue(NOW + 5 * 86400000, NOW)).toContain('9/11/2026');
    const task = taskState().tasks[0]!;
    expect(isDueSoon(task, NOW)).toBe(true);
    expect(isDueSoon(task, task.dueAt!)).toBe(true);
    expect(isOverdue(task, task.dueAt! + 1)).toBe(true);
    expect(isDueSoon(task, task.dueAt! + 1)).toBe(false);
    task.doneAt = NOW;
    expect(isOverdue(task, NOW + 7200000)).toBe(false);
  });
  it('uses one list wakeup at the next meaningful label boundary', () => {
    const state = taskState();
    expect(nextTaskLabelAt(state.tasks, NOW)).toBe(NOW + 3600000 + 1);
    state.tasks[0]!.dueAt = NOW + 86400000 + 30000;
    expect(nextTaskLabelAt(state.tasks, NOW)).toBe(NOW + 30000);
  });
});

it.each([0, 5, 15, 30, 60, 1440] as const)('supports the %s minute offset', (offset) => {
  expect(reminderTime({ dueAt: NOW + 86400000, reminderOffsetMinutes: offset })).toBe(
    NOW + 86400000 - offset * 60000,
  );
});

describe('visible reminders in New Tab', () => {
  it('groups all unread tasks by notification, includes titles/due dates and excludes skipped or future reminders', () => {
    const state = taskState();
    applyCommand(state, save('b'), NOW);
    applyCommand(state, save('later', NOW + 7200000, 0), NOW);
    applyCommand(state, { ...save('skipped', NOW - 60000, 0), pastReminder: 'skip' }, NOW);
    const batch = claimDueReminders(state, NOW + 2700000)!;
    const unread = unreadReminderBatches(state);
    expect(unread).toHaveLength(1);
    expect(unread[0]).toMatchObject({ id: batch.id, handledAt: NOW + 2700000 });
    expect(unread[0]!.tasks.map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect(unread[0]!.tasks[0]).toHaveProperty('dueAt', NOW + 3600000);
    expect(unread[0]!.tasks[0]!.title).toMatch(/^Việc /);
  });
  it('persists viewed state across reload/import without changing schedule or replaying notification/audio', async () => {
    const h = harness();
    h.clock(NOW + 2700000);
    await h.coordinator.dispatch({ type: 'get' });
    const id = unreadReminderBatches(h.read())[0]!.id;
    await h.coordinator.dispatch({ type: 'reminder.dismiss', notificationId: id });
    expect(unreadReminderBatches(parseImport(JSON.stringify(h.read())))).toEqual([]);
    expect(h.read().tasks[0]!.reminder).toMatchObject({
      notificationId: id,
      dismissedAt: NOW + 2700000,
    });
    await new Coordinator(h.storage, h.effects, () => NOW + 3000000).dispatch({ type: 'get' });
    expect(h.effects.remind).toHaveBeenCalledOnce();
    expect(nextReminderAt(h.read())).toBeNull();
  });
  it('keeps other batches visible when one is viewed, and removes completed/deleted/edited tasks immediately', () => {
    const state = taskState();
    const first = claimDueReminders(state, NOW + 2700000)!;
    applyCommand(state, save('b', NOW + 7200000, 0), NOW);
    claimDueReminders(state, NOW + 7200000);
    expect(unreadReminderBatches(state).map((b) => b.tasks[0]!.id)).toEqual(['b', 'a']);
    applyCommand(state, { type: 'reminder.dismiss', notificationId: first.id }, NOW + 7200000);
    expect(unreadReminderBatches(state).map((b) => b.tasks[0]!.id)).toEqual(['b']);
    applyCommand(state, { type: 'task.toggle', id: 'b' }, NOW + 7200000);
    expect(unreadReminderBatches(state)).toEqual([]);
    applyCommand(state, save('c', NOW + 10800000, 0), NOW);
    claimDueReminders(state, NOW + 10800000);
    applyCommand(state, save('c', NOW + 14400000, 0), NOW + 10800000);
    expect(unreadReminderBatches(state)).toEqual([]);
  });
  it('snoozing a visible or viewed batch clears its banner and creates a fresh unread batch only when due', async () => {
    const h = harness();
    h.clock(NOW + 2700000);
    await h.coordinator.dispatch({ type: 'get' });
    const id = unreadReminderBatches(h.read())[0]!.id;
    await h.coordinator.dispatch({ type: 'reminder.dismiss', notificationId: id });
    await h.coordinator.dispatch({ type: 'reminder.snooze', notificationId: id });
    expect(unreadReminderBatches(h.read())).toEqual([]);
    h.clock(NOW + 3300000);
    await h.coordinator.dispatch({ type: 'get' });
    const unread = unreadReminderBatches(h.read());
    expect(unread).toHaveLength(1);
    expect(unread[0]!.id).not.toBe(id);
  });
  it('defaults the viewed state for existing persisted claims', () => {
    const state = taskState();
    claimDueReminders(state, NOW + 2700000);
    const raw = JSON.parse(JSON.stringify(state));
    delete raw.tasks[0].reminder.dismissedAt;
    expect(unreadReminderBatches(decodeState(raw))).toHaveLength(1);
  });
});

it('persists task changes and immediate reminder claims in one write before external effects', async () => {
  const h = harness(initialState());
  const write = vi.spyOn(h.storage, 'write');
  h.effects.remind.mockImplementation(async () => {
    expect(write).toHaveBeenCalledOnce();
    expect(h.read().tasks[0]!.reminder).toMatchObject({ scheduledAt: null, handledAt: NOW });
  });
  await h.coordinator.dispatch({ ...save('immediate', NOW - 60000, 0), pastReminder: 'now' });
  expect(write).toHaveBeenCalledOnce();
  expect(h.read().revision).toBe(1);
  expect(h.effects.remind).toHaveBeenCalledOnce();
});

it('does not send a reminder if its combined state write fails and recovers on the next command', async () => {
  const h = harness(initialState());
  const write = vi
    .spyOn(h.storage, 'write')
    .mockRejectedValueOnce(new Error('storage unavailable'));
  const command = { ...save('immediate', NOW - 60000, 0), pastReminder: 'now' };
  await expect(h.coordinator.dispatch(command)).rejects.toThrow('storage unavailable');
  expect(h.read().tasks).toHaveLength(0);
  expect(h.effects.remind).not.toHaveBeenCalled();
  write.mockRestore();
  await h.coordinator.dispatch(command);
  expect(h.effects.remind).toHaveBeenCalledOnce();
});

it('accepts a valid generated notification ID over 100 characters for viewed/snooze commands', async () => {
  const state = taskState();
  state.tasks[0]!.reminder!.id = 'r'.repeat(100);
  const h = harness(state);
  h.clock(NOW + 2700000);
  await h.coordinator.dispatch({ type: 'get' });
  const id = h.read().tasks[0]!.reminder!.notificationId!;
  expect(id.length).toBeGreaterThan(100);
  await h.coordinator.dispatch({ type: 'reminder.dismiss', notificationId: id });
  expect(unreadReminderBatches(h.read())).toEqual([]);
  await h.coordinator.dispatch({ type: 'reminder.snooze', notificationId: id });
  expect(nextReminderAt(h.read())).toBe(NOW + 3300000);
  expect(
    commandSchema.safeParse({ type: 'reminder.snooze', notificationId: 'x'.repeat(201) }).success,
  ).toBe(false);
});
