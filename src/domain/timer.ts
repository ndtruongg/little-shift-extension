import {
  initialState,
  emptyAmbientFiles,
  localDay,
  newTimer,
  parseImport,
  type Completion,
  type Mode,
  type State,
  type Timer,
} from './model';
import type { Command } from './protocol';
import { reminderTime, scheduleReminder, snoozeNotification, dismissReminder } from './reminders';

export const remaining = (timer: Timer, now: number) =>
  timer.status === 'running' ? Math.max(0, (timer.endAt ?? now) - now) : timer.remainingMs;
export const formatTime = (ms: number) => {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
export function start(state: State, now: number) {
  if (state.timer.status === 'running') return;
  if (state.history.length >= 20000)
    throw new Error(
      'Đã đạt giới hạn 20.000 phiên. Hãy xuất bản sao lưu rồi đặt lại dữ liệu để tiếp tục.',
    );
  const t = state.timer;
  if (t.status === 'idle') {
    const task = state.tasks.find((item) => item.id === state.activeTaskId);
    t.startedAt = now;
    t.taskId = task?.id ?? null;
    t.taskTitle = task?.title ?? null;
  }
  t.endAt = now + t.remainingMs;
  t.status = 'running';
}
function abandon(state: State, now: number) {
  const t = state.timer;
  if (t.startedAt !== null && !state.history.some((h) => h.id === t.id)) {
    state.history.push({
      id: t.id,
      mode: t.mode,
      taskId: t.taskId,
      taskTitle: t.taskTitle,
      startedAt: t.startedAt,
      endedAt: now,
      durationMs: t.durationMs,
      result: 'abandoned',
    });
  }
}
export function reconcile(state: State, now: number): Completion | null {
  const t = state.timer;
  if (t.status !== 'running' || remaining(t, now) > 0) return null;
  if (state.history.some((h) => h.id === t.id)) {
    state.timer = newTimer(t.mode, state.settings);
    return null;
  }
  state.history.push({
    id: t.id,
    mode: t.mode,
    taskId: t.taskId,
    taskTitle: t.taskTitle,
    startedAt: t.startedAt!,
    endedAt: t.endAt!,
    durationMs: t.durationMs,
    result: 'completed',
  });
  if (t.mode === 'focus') {
    state.focusCount++;
    const task = state.tasks.find((item) => item.id === t.taskId);
    if (task) task.completed++;
  }
  const nextMode: Mode =
    t.mode === 'focus'
      ? state.focusCount % state.settings.cycle === 0
        ? 'long'
        : 'short'
      : 'focus';
  const completion: Completion = { id: t.id, mode: t.mode, nextMode, at: now };
  state.lastCompletion = completion;
  state.timer = newTimer(nextMode, state.settings);
  if (t.mode === 'focus' ? state.settings.autoBreak : state.settings.autoFocus) start(state, now);
  return completion;
}
export function applyCommand(state: State, command: Command, now: number): State {
  switch (command.type) {
    case 'get':
    case 'audio.preview':
    case 'audio.ambientPreview':
    case 'audio.previewStop':
      return state;
    case 'timer.start':
      start(state, now);
      break;
    case 'timer.pause':
      if (state.timer.status === 'running') {
        state.timer.remainingMs = remaining(state.timer, now);
        state.timer.endAt = null;
        state.timer.status = 'paused';
      }
      break;
    case 'timer.mode':
    case 'timer.reset':
      if (state.timer.status !== 'idle' && !command.confirmed)
        throw new Error('Cần xác nhận trước khi bỏ phiên đang chạy hoặc tạm dừng.');
      abandon(state, now);
      state.timer = newTimer(
        command.type === 'timer.mode' ? command.mode : state.timer.mode,
        state.settings,
      );
      break;
    case 'task.save': {
      if (command.task.dueAt === null && command.task.reminderOffsetMinutes !== null)
        throw new Error('Chỉ bật nhắc khi đã có hạn hoàn thành.');
      const index = state.tasks.findIndex((t) => t.id === command.task.id);
      if (index >= 0) {
        const old = state.tasks[index]!;
        const task = { ...old, ...command.task };
        if (old.dueAt !== task.dueAt || old.reminderOffsetMinutes !== task.reminderOffsetMinutes)
          scheduleReminder(task, now, command.pastReminder);
        state.tasks[index] = task;
      } else {
        if (state.tasks.length >= 5000) throw new Error('Đã đạt giới hạn 5.000 công việc.');
        const task = {
          ...command.task,
          createdAt: now,
          doneAt: null,
          completed: 0,
          reminder: null,
        };
        scheduleReminder(task, now, command.pastReminder);
        state.tasks.push(task);
        state.activeTaskId ??= command.task.id;
      }
      break;
    }
    case 'task.toggle': {
      const task = state.tasks.find((t) => t.id === command.id);
      if (task) {
        task.doneAt = task.doneAt === null ? now : null;
        // Reopening never replays a past reminder (including a previously snoozed one).
        scheduleReminder(task, now, (reminderTime(task) ?? 0) <= now ? 'skip' : undefined);
      }
      break;
    }
    case 'reminder.snooze':
      snoozeNotification(state, command.notificationId, now);
      break;
    case 'reminder.dismiss':
      dismissReminder(state, command.notificationId, now);
      break;
    case 'task.delete':
      state.tasks = state.tasks.filter((t) => t.id !== command.id);
      if (state.activeTaskId === command.id) state.activeTaskId = null;
      if (state.timer.taskId === command.id) state.timer.taskId = null;
      break;
    case 'task.select': {
      if (command.id !== null && !state.tasks.some((t) => t.id === command.id))
        throw new Error('Không tìm thấy công việc.');
      state.activeTaskId = command.id;
      if (state.timer.status !== 'idle') {
        const task = state.tasks.find((t) => t.id === command.id);
        state.timer.taskId = task?.id ?? null;
        state.timer.taskTitle = task?.title ?? null;
      }
      break;
    }
    case 'task.move': {
      const index = state.tasks.findIndex((t) => t.id === command.id);
      const target = index + (command.direction === 'up' ? -1 : 1);
      if (index >= 0 && target >= 0 && target < state.tasks.length)
        [state.tasks[index], state.tasks[target]] = [state.tasks[target]!, state.tasks[index]!];
      break;
    }
    case 'task.today': {
      const task = state.tasks.find((t) => t.id === command.id);
      if (task) task.day = localDay(now);
      break;
    }
    case 'settings.save':
      state.settings = command.settings;
      if (state.timer.status === 'idle') state.timer = newTimer(state.timer.mode, state.settings);
      break;
    case 'data.import': {
      const imported = parseImport(command.json);
      // Imported active sessions are made safe: no stale alarms or completion side effects.
      imported.timer = newTimer(imported.timer.mode, imported.settings);
      imported.settings.ambient = 'off';
      imported.settings.ambientFiles = emptyAmbientFiles();
      imported.lastCompletion = null;
      return imported;
    }
    case 'data.reset':
      return initialState();
    case 'notice.dismiss':
      delete state.recoveryNotice;
      break;
  }
  return state;
}
