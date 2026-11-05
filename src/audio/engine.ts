import type { AmbientPlayback, AudioRequest } from '../domain/protocol';
import { audioUrlSchema } from '../domain/model';
import { loadLocalAudio } from '../platform/local-audio';
import rainUrl from '../assets/rain.mp3?url';
import cafeUrl from '../assets/coffee.mp3?url';
import forestUrl from '../assets/forest.mp3?url';

const bundledAmbient = { rain: rainUrl, cafe: cafeUrl, forest: forestUrl };

// Bundled tracks, custom URLs and picked files share one looping media player.
export class AudioEngine {
  private context: AudioContext | null = null;
  private sound = 'off';
  private ambientVersion = 0;
  private seen = new Set<string>();
  private nextBellAt = 0;
  private media: HTMLAudioElement | null = null;
  private mediaCancel: (() => void) | null = null;
  private sourceUrl = '';
  private sourceFileId = '';
  private localObjectUrl: string | null = null;
  private live: AmbientPlayback = { sound: 'off', volume: 0.35, url: '' };
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private previewing = false;
  private previewVersion = 0;
  constructor(
    private onError: (message: string) => void = () => {},
    private readLocalAudio: (id: string) => Promise<Blob> = loadLocalAudio,
  ) {}

  private clearMedia() {
    this.mediaCancel?.();
    this.mediaCancel = null;
    if (this.media) {
      this.media.onerror = null;
      this.media.pause();
      this.media.removeAttribute('src');
      this.media.load();
      this.media = null;
    }
    if (this.localObjectUrl) {
      URL.revokeObjectURL(this.localObjectUrl);
      this.localObjectUrl = null;
    }
  }
  private cancelPreview() {
    this.previewVersion++;
    this.previewing = false;
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = null;
  }
  private async restorePreview() {
    if (!this.previewing) return;
    this.cancelPreview();
    await this.setAmbient(this.live.sound, this.live.volume, this.live.url, this.live.fileId);
  }
  private async preview(message: Extract<AudioRequest, { type: 'ambient.preview' }>) {
    this.cancelPreview();
    const version = this.previewVersion;
    this.live = { ...message.restore };
    this.previewing = true;
    try {
      await this.setAmbient(message.sound, message.volume, message.url, message.fileId);
      if (version !== this.previewVersion) return;
      this.previewTimer = setTimeout(() => {
        void this.restorePreview().catch((error: unknown) =>
          this.onError(
            error instanceof Error ? error.message : 'Không thể khôi phục âm thanh nền.',
          ),
        );
      }, 10000);
    } catch (error) {
      if (version !== this.previewVersion) return;
      await this.restorePreview().catch(() => undefined);
      throw error;
    }
  }
  private async playMedia(url: string, volume: number, version: number, local = false) {
    const element = new Audio(local ? url : audioUrlSchema.parse(url));
    element.loop = true;
    element.volume = volume;
    element.preload = 'none';
    this.media = element;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(
        () => fail('Tải âm thanh quá lâu. Hãy thử lại hoặc kiểm tra nguồn âm thanh.'),
        8000,
      );
      const finish = () => {
        if (settled) return false;
        settled = true;
        clearTimeout(timeout);
        if (this.media === element) this.mediaCancel = null;
        return true;
      };
      const fail = (message: string) => {
        if (version !== this.ambientVersion) {
          if (finish()) resolve();
          return;
        }
        const wasPending = finish();
        this.clearMedia();
        if (wasPending) reject(new Error(message));
        else this.onError(message);
      };
      this.mediaCancel = () => {
        if (finish()) resolve();
      };
      element.onerror = () =>
        fail(
          local
            ? 'Không phát được file âm thanh. Hãy thử lại hoặc chọn file khác trong Cài đặt.'
            : 'Không phát được link âm thanh. Dùng link trực tiếp MP3/WAV/OGG còn truy cập được.',
        );
      element
        .play()
        .then(() => {
          if (finish()) resolve();
        })
        .catch((error: unknown) => {
          fail(
            error instanceof DOMException && error.name === 'NotAllowedError'
              ? 'Trình duyệt đang chặn âm thanh. Hãy nhấn lại nút phát để cho phép.'
              : local
                ? 'Không phát được file âm thanh. Hãy thử lại hoặc chọn file khác trong Cài đặt.'
                : 'Không phát được link âm thanh. Kiểm tra định dạng hoặc quyền truy cập của file.',
          );
        });
    });
  }
  private ctx() {
    return (this.context ??= new AudioContext());
  }

  async unlock() {
    const ctx = this.ctx();
    if (ctx.state === 'running') return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ctx.resume(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  'Trình duyệt đang chặn âm thanh. Hãy nhấn lại nút âm thanh để cho phép phát.',
                ),
              ),
            1500,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  async handle(message: AudioRequest) {
    if (message.type === 'bell') {
      if (this.seen.has(message.id)) return;
      this.seen.add(message.id);
      if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!);
      await this.bell(message.bell, message.volume);
    } else if (message.type === 'ambient.preview') {
      await this.preview(message);
    } else if (message.type === 'ambient.previewStop') {
      await this.restorePreview();
    } else {
      const changed =
        this.live.sound !== message.sound ||
        this.live.volume !== message.volume ||
        (this.live.url ?? '') !== (message.url ?? '') ||
        this.live.fileId !== message.fileId;
      this.live = {
        sound: message.sound,
        volume: message.volume,
        url: message.url ?? '',
        fileId: message.fileId,
      };
      if (this.previewing && !changed) return;
      this.cancelPreview();
      await this.setAmbient(message.sound, message.volume, message.url, message.fileId);
    }
  }
  async bell(kind: 'soft' | 'bit' | 'clear', volume: number) {
    const ctx = this.ctx();
    await this.unlock();
    const notes =
      kind === 'soft'
        ? [523.25, 659.25, 783.99]
        : kind === 'bit'
          ? [440, 554.37, 659.25, 880]
          : [880, 659.25, 880];
    // A shared audio timeline queues task and Pomodoro bells, even concurrent requests.
    const startAt = Math.max(ctx.currentTime, this.nextBellAt);
    this.nextBellAt = startAt + (notes.length - 1) * 0.17 + 1.35;
    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = startAt + index * 0.17;
      oscillator.type = kind === 'bit' ? 'square' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume * (kind === 'bit' ? 0.12 : 0.3), at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.25);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 1.3);
    });
  }
  async setAmbient(
    sound: 'off' | 'rain' | 'cafe' | 'forest',
    volume: number,
    url = '',
    fileId?: string,
  ) {
    if (
      sound === this.sound &&
      url === this.sourceUrl &&
      (fileId ?? '') === this.sourceFileId &&
      this.media
    ) {
      this.media.volume = volume;
      return;
    }
    const version = ++this.ambientVersion;
    this.clearMedia();
    this.sourceUrl = url;
    this.sourceFileId = fileId ?? '';
    this.sound = sound;
    if (sound === 'off') return;
    if (fileId) {
      const blob = await this.readLocalAudio(fileId);
      if (version !== this.ambientVersion) return;
      this.localObjectUrl = URL.createObjectURL(blob);
      await this.playMedia(this.localObjectUrl, volume, version, true);
      return;
    }
    await this.playMedia(url || bundledAmbient[sound], volume, version, !url);
  }
}
