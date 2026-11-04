import { Coordinator } from '../domain/coordinator';
import {
  ambientPlayback,
  previewRequest,
  type AudioRequest,
  type Command,
  type Reply,
} from '../domain/protocol';
import { decodeState, type State } from '../domain/model';
import { AudioEngine } from '../audio/engine';
import { previewStorage, STORAGE_KEY } from './storage';

export const isExtension =
  typeof chrome !== 'undefined' && !!chrome.runtime?.id && !!chrome.storage?.local;
const listeners = new Set<(state: State) => void>();
const errorListeners = new Set<(message: string) => void>();
const reportAudioError = (error: unknown) =>
  errorListeners.forEach((listener) =>
    listener(
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Không thể phát âm thanh.',
    ),
  );
const emit = (state: State) => listeners.forEach((listener) => listener(state));
let coordinator: Coordinator | null = null;
let wakeup: ReturnType<typeof setTimeout> | null = null;
const audioChannel =
  !isExtension && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('little-shift-audio')
    : null;
type AudioChannelMessage =
  | AudioRequest
  | { target: 'audio.error'; error: string }
  | { target: 'audio.request'; id: string; message: AudioRequest }
  | { target: 'audio.reply'; id: string; error?: string };
const pendingAudio = new Map<
  string,
  { resolve: () => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }
>();
const broadcastAudioError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  reportAudioError(message);
  audioChannel?.postMessage({ target: 'audio.error', error: message });
};
const engine = !isExtension ? new AudioEngine(broadcastAudioError) : null;
let leader = false;
let ambientKey = '';
async function applyAudio(message: AudioRequest) {
  if (leader) await engine?.handle(message);
  else if (
    audioChannel &&
    (message.type === 'ambient.preview' || message.type === 'ambient.previewStop')
  ) {
    await new Promise<void>((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        pendingAudio.delete(id);
        reject(new Error('Không kết nối được tab đang phát âm thanh. Hãy thử lại ở tab đầu tiên.'));
      }, 12000);
      pendingAudio.set(id, { resolve, reject, timeout });
      audioChannel.postMessage({ target: 'audio.request', id, message });
    });
  } else audioChannel?.postMessage(message);
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
          ...ambientPlayback(state.settings),
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
          ...ambientPlayback(state.settings),
        })
        .catch(reportAudioError);
    await new Promise<void>(() => {
      /* the lock is released when the document closes */
    });
  };
  if (navigator.locks) void navigator.locks.request('little-shift-preview-audio', ownAudio);
  else leader = true;
  audioChannel?.addEventListener('message', (event: MessageEvent<AudioChannelMessage>) => {
    if (event.data.target === 'audio.error') reportAudioError(event.data.error);
    else if (event.data.target === 'audio.reply') {
      const pending = pendingAudio.get(event.data.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      pendingAudio.delete(event.data.id);
      if (event.data.error) pending.reject(new Error(event.data.error));
      else pending.resolve();
    } else if (event.data.target === 'audio.request') {
      if (!leader) return;
      const { id, message } = event.data;
      void engine
        ?.handle(message)
        .then(() => audioChannel?.postMessage({ target: 'audio.reply', id }))
        .catch((error: unknown) =>
          audioChannel?.postMessage({
            target: 'audio.reply',
            id,
            error: error instanceof Error ? error.message : 'Không thể phát âm thanh.',
          }),
        );
    } else if (leader) void engine?.handle(event.data).catch(broadcastAudioError);
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
      const playback = ambientPlayback(state.settings);
      const key = JSON.stringify(playback);
      if (key !== ambientKey) {
        void applyAudio({
          target: 'audio',
          type: 'ambient',
          ...playback,
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
    async preview(command, state) {
      await applyAudio(previewRequest(command, state));
    },
  });
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) void send({ type: 'get' }).catch(console.error);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void send({ type: 'get' }).catch(console.error);
  });
} else {
  chrome.runtime.onMessage.addListener(
    (message: { target?: string; type?: string; error?: string }, sender) => {
      if (
        sender.id === chrome.runtime.id &&
        message.target === 'ui' &&
        message.type === 'audio.error' &&
        typeof message.error === 'string'
      )
        reportAudioError(message.error);
    },
  );
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
