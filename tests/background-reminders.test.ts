import { afterEach, expect, it, vi } from 'vitest';
import { initialState, type State } from '../src/domain/model';
import { commandSchema, type Reply, type Request } from '../src/domain/protocol';
import { applyCommand } from '../src/domain/timer';
import { TASK_ALARM } from '../src/domain/reminders';

function event<Args extends unknown[]>() {
  const callbacks: ((...args: Args) => void)[] = [];
  return {
    addListener: (callback: (...args: Args) => void) => {
      callbacks.push(callback);
    },
    emit: (...args: Args) => callbacks.forEach((callback) => callback(...args)),
    get size() {
      return callbacks.length;
    },
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('registers lifecycle/notification handlers at startup, restores a missing alarm, routes clicks and snooze through the coordinator', async () => {
  let now = 1800000000000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  let persisted = initialState();
  const taskCommand = (id: string) =>
    commandSchema.parse({
      type: 'task.save',
      task: {
        id,
        title: `Nhắc ${id}`,
        day: '2026-11-04',
        priority: 'low',
        estimated: 1,
        dueAt: now + 60000,
        reminderOffsetMinutes: 0,
      },
    });
  applyCommand(persisted, taskCommand('one'), now);
  applyCommand(persisted, taskCommand('two'), now);
  const alarmMap = new Map<
    string,
    { name: string; scheduledTime?: number; periodInMinutes?: number }
  >();
  const notices = new Map<string, object>();
  const startup = event<[]>();
  const installed = event<[]>();
  const alarm = event<[chrome.alarms.Alarm]>();
  const clicked = event<[string]>();
  const button = event<[string, number]>();
  const messages = event<[Request, chrome.runtime.MessageSender, (reply: Reply) => void]>();
  const sendAudio = vi.fn().mockResolvedValue({ ok: true });
  const createNotice = vi.fn(async (id: string, options: object) => {
    notices.set(id, options);
    return id;
  });
  const createTab = vi.fn().mockResolvedValue({});
  const success = () => vi.fn().mockResolvedValue(undefined);
  const setBadgeText = success();
  const setBadgeBackgroundColor = success();
  const setTitle = success();
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'test',
      getURL: (path: string) => `chrome-extension://test/${path}`,
      getContexts: vi.fn().mockResolvedValue([{}]),
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
      sendMessage: sendAudio,
      onMessage: messages,
      onStartup: startup,
      onInstalled: installed,
    },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({
          [key]: key === 'little-shift-state' ? structuredClone(persisted) : undefined,
        })),
        set: vi.fn(async (value: Record<string, State>) => {
          persisted = structuredClone(value['little-shift-state']!);
        }),
      },
    },
    alarms: {
      onAlarm: alarm,
      get: vi.fn(async (name: string) => alarmMap.get(name)),
      clear: vi.fn(async (name: string) => alarmMap.delete(name)),
      create: vi.fn(async (name: string, options: { when?: number; periodInMinutes?: number }) => {
        alarmMap.set(name, {
          name,
          scheduledTime: options.when,
          periodInMinutes: options.periodInMinutes,
        });
      }),
    },
    notifications: {
      onClicked: clicked,
      onButtonClicked: button,
      create: createNotice,
      getAll: vi.fn(async () => Object.fromEntries([...notices.keys()].map((id) => [id, true]))),
      clear: vi.fn(async (id: string) => notices.delete(id)),
    },
    action: {
      setBadgeBackgroundColor,
      setBadgeTextColor: success(),
      setBadgeText,
      setTitle,
    },
    tabs: { create: createTab },
  });
  vi.resetModules();
  await import('../src/background/index');
  const send = (command: unknown) =>
    new Promise<State>((resolve, reject) => {
      messages.emit(
        { target: 'background', command: commandSchema.parse(command) },
        { id: 'test' },
        (reply) => (reply.ok ? resolve(reply.state) : reject(new Error(reply.error))),
      );
    });
  expect(startup.size).toBe(1);
  expect(installed.size).toBe(1);
  expect(alarm.size).toBe(1);
  expect(clicked.size).toBe(1);
  expect(button.size).toBe(1);
  await send({ type: 'get' });
  expect(alarmMap.get(TASK_ALARM)?.scheduledTime).toBe(now + 60000);
  expect(setBadgeText).toHaveBeenLastCalledWith({ text: '' });
  alarmMap.delete(TASK_ALARM);
  startup.emit();
  await send({ type: 'get' });
  expect(alarmMap.get(TASK_ALARM)?.scheduledTime).toBe(now + 60000);
  await send({ type: 'timer.start' });
  expect(setBadgeText).toHaveBeenLastCalledWith({ text: '25m' });
  expect(alarmMap.has('little-shift-end')).toBe(true);
  expect(alarmMap.has(TASK_ALARM)).toBe(true);
  now += 60000;
  alarm.emit({ name: TASK_ALARM, scheduledTime: now, persistAcrossSessions: true });
  await send({ type: 'get' });
  expect(createNotice).toHaveBeenCalledOnce();
  const [notificationId, options] = createNotice.mock.calls[0]!;
  expect(setBadgeText).toHaveBeenLastCalledWith({ text: '2' });
  expect(setBadgeBackgroundColor).toHaveBeenLastCalledWith({ color: '#FFAD87' });
  expect(setTitle).toHaveBeenLastCalledWith({
    title: 'Little Shift · 2 công việc đến giờ nhắc chưa xem · Tập trung · 24:00',
  });
  expect(options).toMatchObject({
    title: '2 công việc đến giờ nhắc',
    buttons: [{ title: 'Nhắc sau 10 phút' }],
    silent: true,
  });
  expect(sendAudio.mock.calls.filter(([message]) => message.type === 'bell')).toHaveLength(1);
  expect(alarmMap.has('little-shift-end')).toBe(true);
  expect(alarmMap.has(TASK_ALARM)).toBe(false);
  clicked.emit(notificationId);
  await send({ type: 'get' });
  const targetId = persisted.tasks.find(
    (t) => `little-shift-task:${t.reminder?.id}` === notificationId,
  )!.id;
  expect(createTab).toHaveBeenCalledWith({
    url: `chrome-extension://test/index.html#task=${targetId}`,
  });
  await send({ type: 'timer.pause' });
  expect(setBadgeText).toHaveBeenLastCalledWith({ text: '2' });
  await send({ type: 'reminder.dismiss', notificationId });
  expect(setBadgeText).toHaveBeenLastCalledWith({ text: 'Ⅱ' });
  expect(setBadgeBackgroundColor).toHaveBeenLastCalledWith({ color: '#FFD580' });
  await send({ type: 'timer.start' });
  expect(setBadgeText).toHaveBeenLastCalledWith({ text: '24m' });
  button.emit(notificationId, 0);
  await send({ type: 'get' });
  expect(alarmMap.get(TASK_ALARM)?.scheduledTime).toBe(now + 600000);
  expect(persisted.tasks.every((t) => t.dueAt === now)).toBe(true);
  expect(notices.size).toBe(0);
  await send({ type: 'task.toggle', id: 'one' });
  await send({ type: 'task.delete', id: 'two' });
  button.emit(notificationId, 0); // stale action cannot restore a canceled snooze
  await send({ type: 'get' });
  expect(alarmMap.has(TASK_ALARM)).toBe(false);
  expect(alarmMap.has('little-shift-end')).toBe(true);
  startup.emit();
  installed.emit();
  await send({ type: 'get' });
  expect(createNotice).toHaveBeenCalledOnce();
});
