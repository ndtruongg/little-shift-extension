import { decodeState, initialState, type State } from '../domain/model';
import { previewDemo } from './demo';
import type { StorageAdapter } from '../domain/coordinator';

export const STORAGE_KEY = 'little-shift-state';
export async function restore(
  raw: unknown,
  backup: (value: unknown) => Promise<void>,
  persistRecovery?: (state: State) => Promise<void>,
): Promise<State> {
  if (raw === undefined || raw === null) return initialState();
  try {
    return decodeState(raw);
  } catch {
    await backup(raw);
    const state: State = {
      ...initialState(),
      revision: Date.now(),
      recoveryNotice:
        'Dữ liệu cũ bị lỗi. Bản gốc được giữ ở khóa little-shift-recovery trong bộ nhớ cục bộ; bạn có thể xuất dữ liệu mới hoặc nhập bản sao lưu.',
    };
    await persistRecovery?.(state);
    return state;
  }
}
export const chromeStorage: StorageAdapter = {
  async read() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    if (result[STORAGE_KEY] === undefined) {
      const state = initialState();
      await chrome.storage.local.set({ [STORAGE_KEY]: state });
      return state;
    }
    return restore(
      result[STORAGE_KEY],
      async (value) => {
        const existing = await chrome.storage.local.get('little-shift-recovery');
        if (!existing['little-shift-recovery'])
          await chrome.storage.local.set({ 'little-shift-recovery': value });
      },
      (state) => chromeStorage.write(state),
    );
  },
  async write(state) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  },
  async clearRecovery() {
    await chrome.storage.local.remove('little-shift-recovery');
  },
};
export const previewStorage: StorageAdapter = {
  async read() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const demo = previewDemo();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      return demo;
    }
    let parsed: unknown;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = raw;
    }
    return restore(
      parsed,
      async (value) => {
        if (!localStorage.getItem('little-shift-recovery'))
          localStorage.setItem('little-shift-recovery', JSON.stringify(value));
      },
      (state) => previewStorage.write(state),
    );
  },
  async write(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      throw new Error('Không thể lưu dữ liệu. Hãy xuất bản sao lưu và kiểm tra dung lượng bộ nhớ.');
    }
  },
  async clearRecovery() {
    localStorage.removeItem('little-shift-recovery');
  },
};
