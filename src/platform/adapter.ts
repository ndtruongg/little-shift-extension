import { Coordinator } from '../domain/coordinator';
import type { AudioRequest, Command, Reply } from '../domain/protocol';
import { decodeState, type State } from '../domain/model';
import { AudioEngine } from '../audio/engine';
import { previewStorage, STORAGE_KEY } from './storage';

export const isExtension =
  typeof chrome !== 'undefined' && !!chrome.runtime?.id && !!chrome.storage?.local;
const listeners = new Set<(state: State) => void>();
const errorListeners = new Set<(message: string) => void>();
const reportAudioError = (error: unknown) =>
  errorListeners.forEach((listener) =>
    listener(error instanceof Error ? error.message : 'Không thể phát âm thanh.'),
  );
const emit = (state: State) => listeners.forEach((listener) => listener(state));
let coordinator: Coordinator | null = null;
let wakeup: ReturnType<typeof setTimeout> | null = null;
const audioChannel =
  !isExtension && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('little-shift-audio')
    : null;
const engine = !isExtension ? new AudioEngine() : null;
let leader = false;
let ambientKey = '';
async function applyAudio(message: AudioRequest) {
  if (leader) await engine?.handle(message);
  else audioChannel?.postMessage(message);
}
if (!isExtension) {
  let unlocked = false;
  const unlock = () => {
    if (!leader || unlocked) return;
    unlocked = true;
    void engine
      ?.unlock()
      .then(async () => {
        const state = await previewStorage.read();
        await engine.handle({
          target: 'audio',
          type: 'ambient',
          sound: state.settings.ambient,
          volume: state.settings.ambientVolume,
        });
      })
      .catch((error: unknown) => {
        unlocked = false;
        reportAudioError(error);
      });
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  // A Web Lock elects one preview audio owner. Browser preview still requires an open page.
  const ownAudio = async () => {
    leader = true;
    const state = await previewStorage.read();
    if (state.settings.ambient !== 'off')
      void engine
        ?.handle({
          target: 'audio',
          type: 'ambient',
          sound: state.settings.ambient,
          volume: state.settings.ambientVolume,
        })
        .catch(reportAudioError);
    await new Promise<void>(() => {
      /* the lock is released when the document closes */
    });
  };
  if (navigator.locks) void navigator.locks.request('little-shift-preview-audio', ownAudio);
  else leader = true;
  audioChannel?.addEventListener('message', (event: MessageEvent<AudioRequest>) => {
    if (leader) void engine?.handle(event.data).catch(console.error);
  });
  coordinator = new Coordinator(previewStorage, {
    async sync(state) {
      emit(state);
      if (wakeup) clearTimeout(wakeup);
      wakeup =
        state.timer.status === 'running'
          ? setTimeout(
              () => {
                void send({ type: 'get' }).catch(console.error);
              },
              Math.max(0, state.timer.endAt! - Date.now()),
            )
          : null;
      const key = `${state.settings.ambient}:${state.settings.ambientVolume}`;
      if (key !== ambientKey) {
        void applyAudio({
          target: 'audio',
          type: 'ambient',
          sound: state.settings.ambient,
          volume: state.settings.ambientVolume,
        }).catch(reportAudioError);
        ambientKey = key;
      }
    },
    async complete(completion, state) {
      if (state.settings.bellEnabled)
        await applyAudio({
          target: 'audio',
          type: 'bell',
          id: completion.id,
          bell: state.settings.bell,
          volume: state.settings.bellVolume,
        });
      if (
        state.settings.notifications &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      )
        new Notification('Little Shift · Phiên hoàn thành', {
          body: 'Đã đến lúc nghỉ ngơi một chút.',
          tag: completion.id,
          icon: '/icons/128.png',
          silent: true,
        });
    },
    async preview(command) {
      await applyAudio({
        target: 'audio',
        type: 'bell',
        id: `preview:${crypto.randomUUID()}`,
        bell: command.bell,
        volume: command.volume,
      });
    },
  });
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) void send({ type: 'get' }).catch(console.error);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void send({ type: 'get' }).catch(console.error);
  });
} else {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]?.newValue) {
      try {
        emit(decodeState(changes[STORAGE_KEY].newValue));
      } catch {
        void send({ type: 'get' }).catch(console.error);
      }
    }
  });
}
export async function send(command: Command): Promise<State> {
  if (isExtension) {
    const response = (await chrome.runtime.sendMessage({ target: 'background', command })) as Reply;
    if (!response?.ok)
      throw new Error(
        response?.error ?? 'Không kết nối được service worker. Hãy tải lại extension.',
      );
    emit(response.state);
    return response.state;
  }
  // This lock serializes preview commands across tabs as well as within each document.
  const run = () => coordinator!.dispatch(command);
  return navigator.locks ? navigator.locks.request('little-shift-preview-state', run) : run();
}
export function subscribe(listener: (state: State) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function subscribeErrors(listener: (message: string) => void) {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}
export function openDashboard() {
  if (isExtension) void chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  else window.open('/', '_blank', 'noopener');
}
