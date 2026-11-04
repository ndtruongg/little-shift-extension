import { Coordinator } from '../domain/coordinator';
import { formatTime, remaining } from '../domain/timer';
import { modeLabel, type State } from '../domain/model';
import { chromeStorage } from '../platform/storage';
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
  await chrome.action.setBadgeBackgroundColor({ color: '#FFD580' });
  await chrome.action.setBadgeTextColor({ color: '#151B2D' });
  await chrome.action.setBadgeText({
    text:
      t.status === 'running'
        ? `${Math.ceil(remaining(t, Date.now()) / 60000)}m`
        : t.status === 'paused'
          ? 'Ⅱ'
          : '',
  });
  await chrome.action.setTitle({
    title: `Little Shift · ${modeLabel[t.mode]} · ${formatTime(remaining(t, Date.now()))}`,
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
  if ([END_ALARM, BADGE_ALARM].includes(alarm.name)) recover();
});
chrome.runtime.onStartup.addListener(recover);
chrome.runtime.onInstalled.addListener(recover);
chrome.notifications.onButtonClicked.addListener((notificationId) => {
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
chrome.notifications.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
recover();
