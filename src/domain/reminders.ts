import { localDay, type State, type Task } from './model';

export const TASK_ALARM = 'little-shift-task-reminder';
export const TASK_NOTIFICATION_PREFIX = 'little-shift-task:';
export const reminderTime = (task: Pick<Task, 'dueAt' | 'reminderOffsetMinutes'>) =>
  task.dueAt !== null && task.reminderOffsetMinutes !== null
    ? Math.max(0, task.dueAt - task.reminderOffsetMinutes * 60000)
    : null;
export const pendingReminder = (task: Task) =>
  task.doneAt === null &&
  task.dueAt !== null &&
  task.reminderOffsetMinutes !== null &&
  task.reminder?.handledAt === null
    ? task.reminder
    : null;

export function nextReminderAt(state: State): number | null {
  let next: number | null = null;
  for (const task of state.tasks) {
    const at = pendingReminder(task)?.scheduledAt;
    if (at !== undefined && at !== null && (next === null || at < next)) next = at;
  }
  return next;
}
export type ReminderBatch = { id: string; tasks: { id: string; title: string; dueAt: number }[] };
export function isUnreadReminder(task: Task): task is Task & {
  dueAt: number;
  reminder: NonNullable<Task['reminder']> & { notificationId: string; handledAt: number };
} {
  const reminder = task.reminder;
  return (
    task.doneAt === null &&
    task.dueAt !== null &&
    reminder !== null &&
    reminder.notificationId !== null &&
    reminder.handledAt !== null &&
    reminder.dismissedAt === null
  );
}
export function unreadReminderBatches(state: State) {
  const batches = new Map<string, ReminderBatch & { handledAt: number }>();
  for (const task of state.tasks) {
    if (!isUnreadReminder(task)) continue;
    const reminder = task.reminder;
    let batch = batches.get(reminder.notificationId);
    if (!batch) {
      batch = { id: reminder.notificationId, tasks: [], handledAt: reminder.handledAt };
      batches.set(batch.id, batch);
    }
    batch.tasks.push({ id: task.id, title: task.title, dueAt: task.dueAt });
  }
  return [...batches.values()].sort(
    (a, b) => b.handledAt - a.handledAt || a.id.localeCompare(b.id),
  );
}
export function dismissReminder(state: State, notificationId: string, now: number) {
  for (const task of state.tasks)
    if (
      task.reminder?.notificationId === notificationId &&
      task.reminder.handledAt !== null &&
      task.reminder.dismissedAt === null
    )
      task.reminder.dismissedAt = now;
}
export function notificationTask(state: State, notificationId: string) {
  const tasks = state.tasks.filter(
    (task) => task.doneAt === null && task.reminder?.notificationId === notificationId,
  );
  return (
    tasks.find((task) => `${TASK_NOTIFICATION_PREFIX}${task.reminder!.id}` === notificationId) ??
    tasks[0]
  );
}
// Claim before effects. A persisted claim is never automatically replayed after a crash.
export function claimDueReminders(state: State, now: number): ReminderBatch | null {
  const tasks = state.tasks
    .filter((task) => {
      const at = pendingReminder(task)?.scheduledAt;
      return at !== undefined && at !== null && at <= now;
    })
    .sort((a, b) => a.reminder!.id.localeCompare(b.reminder!.id));
  if (!tasks.length) return null;
  const id = `${TASK_NOTIFICATION_PREFIX}${tasks[0]!.reminder!.id}`;
  for (const task of tasks) {
    task.reminder!.scheduledAt = null;
    task.reminder!.handledAt = now;
    task.reminder!.notificationId = id;
    task.reminder!.dismissedAt = null;
  }
  return { id, tasks: tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt! })) };
}
export function scheduleReminder(task: Task, now: number, choice?: 'now' | 'skip') {
  const at = reminderTime(task);
  if (task.doneAt !== null || at === null) {
    task.reminder = null;
    return;
  }
  if (at <= now && !choice)
    throw new Error('Thời điểm nhắc đã qua. Hãy chọn nhắc ngay hoặc bỏ lời nhắc này.');
  task.reminder = {
    id: crypto.randomUUID(),
    scheduledAt: at <= now ? (choice === 'now' ? now : null) : at,
    handledAt: at <= now && choice === 'skip' ? now : null,
    notificationId: null,
    dismissedAt: null,
  };
}
export function snoozeNotification(state: State, notificationId: string, now: number) {
  for (const task of state.tasks) {
    if (
      task.doneAt !== null ||
      task.dueAt === null ||
      task.reminderOffsetMinutes === null ||
      task.reminder?.notificationId !== notificationId ||
      task.reminder.handledAt === null
    )
      continue;
    task.reminder = {
      id: crypto.randomUUID(),
      scheduledAt: now + 10 * 60000,
      handledAt: null,
      notificationId: null,
      dismissedAt: null,
    };
  }
}
export const isOverdue = (task: Task, now: number) =>
  task.doneAt === null && task.dueAt !== null && task.dueAt < now;
export const isDueSoon = (task: Task, now: number) =>
  task.doneAt === null && task.dueAt !== null && task.dueAt >= now && task.dueAt <= now + 86400000;
export function formatDue(at: number, now = Date.now()) {
  const date = new Date(at);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const label =
    localDay(at) === localDay(now)
      ? 'Hôm nay'
      : localDay(at) === localDay(tomorrow.getTime())
        ? 'Ngày mai'
        : date.toLocaleDateString('vi-VN');
  return `${label}, ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
export function toLocalInput(at: number | null) {
  if (at === null) return '';
  const date = new Date(at);
  return `${localDay(at)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function fromLocalInput(value: string): number | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Ngày giờ không hợp lệ.');
  const at = new Date(value).getTime();
  if (!Number.isFinite(at) || at < 0 || toLocalInput(at) !== value)
    throw new Error('Ngày giờ không hợp lệ hoặc không tồn tại theo múi giờ địa phương.');
  return at;
}
// One deadline for the whole list: midnight, the next due boundary, or entry into 24h.
export function nextTaskLabelAt(tasks: Task[], now: number) {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  let next = midnight.getTime();
  for (const task of tasks) {
    if (task.doneAt !== null || task.dueAt === null) continue;
    for (const boundary of [task.dueAt - 86400000, task.dueAt + 1])
      if (boundary > now) next = Math.min(next, boundary);
  }
  return next;
}
