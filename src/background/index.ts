import { Coordinator } from '../domain/coordinator';
import { formatTime, remaining } from '../domain/timer';
import { modeLabel, type State } from '../domain/model';
import { chromeStorage } from '../platform/storage';
import {
  TASK_ALARM,
  TASK_NOTIFICATION_PREFIX,
  nextReminderAt,
  formatDue,
  notificationTask,
  isUnreadReminder,
} from '../domain/reminders';
import {
  ambientPlayback,
  previewRequest,
  type AudioRequest,
  type Request,
  type Reply,
} from '../domain/protocol';

const END_ALARM = 'little-shift-end';
const BADGE_ALARM = 'little-shift-badge';
let creatingAudio: Promise<void> | null = null;
let lastAmbient = '';
const reportAudioError = (error: unknown) => {
  void chrome.runtime
    .sendMessage({
      target: 'ui',
      type: 'audio.error',
      error: error instanceof Error ? error.message : 'Không thể phát âm thanh.',
    })
    .catch(() => undefined);
};

async function audio(message: AudioRequest) {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL('offscreen.html')],
  });
  if (!contexts.length) {
    creatingAudio ??= chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: 'Phát chuông Pomodoro và âm thanh nền cục bộ từ một nguồn duy nhất.',
      })
      .finally(() => {
        creatingAudio = null;
      });
    await creatingAudio;
    lastAmbient = '';
  }
  const response = (await chrome.runtime.sendMessage(message)) as { ok: boolean; error?: string };
  if (!response?.ok) throw new Error(response?.error ?? 'Không thể phát âm thanh.');
}
async function sync(state: State) {
  const next = nextReminderAt(state);
  const reminderAlarm = await chrome.alarms.get(TASK_ALARM);
  if (next === null) {
    if (reminderAlarm) await chrome.alarms.clear(TASK_ALARM);
  } else if (!reminderAlarm || reminderAlarm.scheduledTime !== next) {
    await chrome.alarms.create(TASK_ALARM, { when: next });
  }
  const validNotifications = new Set(
    state.tasks.flatMap((task) =>
      task.doneAt === null && task.reminder?.notificationId ? [task.reminder.notificationId] : [],
    ),
  );
  const notifications = await chrome.notifications.getAll();
  await Promise.all(
    Object.keys(notifications)
      .filter((id) => id.startsWith(TASK_NOTIFICATION_PREFIX) && !validNotifications.has(id))
      .map((id) => chrome.notifications.clear(id)),
  );
  const t = state.timer;
  const endAlarm = await chrome.alarms.get(END_ALARM);
  if (t.status === 'running') {
    if (!endAlarm || endAlarm.scheduledTime !== t.endAt)
      await chrome.alarms.create(END_ALARM, { when: t.endAt! });
    if (!(await chrome.alarms.get(BADGE_ALARM)))
      await chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 0.5 });
  } else {
    await chrome.alarms.clear(END_ALARM);
    await chrome.alarms.clear(BADGE_ALARM);
  }
  const unreadCount = state.tasks.reduce(
    (count, task) => count + Number(isUnreadReminder(task)),
    0,
  );
  await chrome.action.setBadgeBackgroundColor({ color: unreadCount ? '#FFAD87' : '#FFD580' });
  await chrome.action.setBadgeTextColor({ color: '#151B2D' });
  await chrome.action.setBadgeText({
    text: unreadCount
      ? unreadCount > 99
        ? '99+'
        : String(unreadCount)
      : t.status === 'running'
        ? `${Math.ceil(remaining(t, Date.now()) / 60000)}m`
        : t.status === 'paused'
          ? 'Ⅱ'
          : '',
  });
  await chrome.action.setTitle({
    title: `Little Shift · ${unreadCount ? `${unreadCount} công việc đến giờ nhắc chưa xem · ` : ''}${modeLabel[t.mode]} · ${formatTime(remaining(t, Date.now()))}${t.status === 'paused' ? ' · Tạm dừng' : t.status === 'idle' ? ' · Sẵn sàng' : ''}`,
  });
  const playback = ambientPlayback(state.settings);
  const ambient = JSON.stringify(playback);
  if (lastAmbient !== ambient) {
    if (state.settings.ambient !== 'off')
      void audio({
        target: 'audio',
        type: 'ambient',
        ...playback,
      }).catch(reportAudioError);
    else {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      });
      if (contexts.length)
        await audio({ target: 'audio', type: 'ambient', sound: 'off', volume: 0 });
    }
    lastAmbient = ambient;
  }
}
const coordinator = new Coordinator(chromeStorage, {
  sync,
  async remind(batch, state) {
    const first = batch.tasks[0]!;
    await Promise.allSettled([
      chrome.notifications.create(batch.id, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/128.png'),
        title:
          batch.tasks.length === 1
            ? `Nhắc hạn · ${first.title}`
            : `${batch.tasks.length} công việc đến giờ nhắc`,
        message:
          batch.tasks
            .slice(0, 3)
            .map((task) => `${task.title} · Hạn ${formatDue(task.dueAt)}`)
            .join('\n') +
          (batch.tasks.length > 3 ? `\nVà ${batch.tasks.length - 3} công việc khác.` : ''),
        buttons: [{ title: 'Nhắc sau 10 phút' }],
        silent: true,
      }),
      state.settings.taskBellEnabled
        ? audio({
            target: 'audio',
            type: 'bell',
            id: batch.id,
            bell: state.settings.bell,
            volume: state.settings.taskBellVolume,
          })
        : Promise.resolve(),
    ]).then((results) =>
      results.forEach((result) => {
        if (result.status === 'rejected') console.error(result.reason);
      }),
    );
  },
  async complete(completion, state) {
    // State already persisted: retries and simultaneous tabs cannot emit this completion again.
    await Promise.allSettled([
      state.settings.notifications
        ? chrome.notifications.create(`little-shift:${completion.id}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/128.png'),
            title: `${modeLabel[completion.mode]} đã hoàn thành`,
            message: `Đến lúc ${modeLabel[completion.nextMode].toLocaleLowerCase('vi')}. Một bước nhỏ cũng là tiến bộ!`,
            buttons: [
              { title: `Bắt đầu ${modeLabel[completion.nextMode].toLocaleLowerCase('vi')}` },
            ],
            silent: true,
          })
        : Promise.resolve(),
      state.settings.bellEnabled
        ? audio({
            target: 'audio',
            type: 'bell',
            id: completion.id,
            bell: state.settings.bell,
            volume: state.settings.bellVolume,
          })
        : Promise.resolve(),
    ]).then((results) =>
      results.forEach((result) => {
        if (result.status === 'rejected') console.error(result.reason);
      }),
    );
  },
  async preview(command, state) {
    await audio(previewRequest(command, state));
  },
});
chrome.runtime.onMessage.addListener(
  (message: Request, sender, respond: (reply: Reply) => void) => {
    if (sender.id !== chrome.runtime.id || message?.target !== 'background') return;
    coordinator
      .dispatch(message.command)
      .then((state) => respond({ ok: true, state }))
      .catch((error: unknown) =>
        respond({ ok: false, error: error instanceof Error ? error.message : 'Đã xảy ra lỗi.' }),
      );
    return true;
  },
);
const recover = () => {
  void coordinator.dispatch({ type: 'get' }).catch(console.error);
};
chrome.alarms.onAlarm.addListener((alarm) => {
  if ([END_ALARM, BADGE_ALARM, TASK_ALARM].includes(alarm.name)) recover();
});
chrome.runtime.onStartup.addListener(recover);
chrome.runtime.onInstalled.addListener(recover);
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex !== 0) return;
  if (notificationId.startsWith(TASK_NOTIFICATION_PREFIX)) {
    void coordinator.dispatch({ type: 'reminder.snooze', notificationId }).catch(console.error);
    return;
  }
  void coordinator
    .dispatch({ type: 'get' })
    .then((state) => {
      if (
        state.lastCompletion &&
        notificationId === `little-shift:${state.lastCompletion.id}` &&
        state.timer.status === 'idle'
      )
        return coordinator.dispatch({ type: 'timer.start' });
    })
    .catch(console.error);
});
chrome.notifications.onClicked.addListener((notificationId) => {
  void coordinator
    .dispatch({ type: 'get' })
    .then((state) => {
      const task = notificationTask(state, notificationId);
      return chrome.tabs.create({
        url: chrome.runtime.getURL(
          `index.html${task ? `#task=${encodeURIComponent(task.id)}` : ''}`,
        ),
      });
    })
    .catch(console.error);
});
recover();
