import type { AmbientPlayback, AudioRequest } from '../domain/protocol';
import { audioUrlSchema } from '../domain/model';
import { loadLocalAudio } from '../platform/local-audio';

// Built-in synthesis and optional direct media URLs share one playback owner.
export class AudioEngine {
  private context: AudioContext | null = null;
  private ambient: AudioBufferSourceNode | null = null;
  private ambientGain: GainNode | null = null;
  private sound = 'off';
  private ambientVersion = 0;
  private seen = new Set<string>();
  private nextBellAt = 0;
  private remote: HTMLAudioElement | null = null;
  private remoteCancel: (() => void) | null = null;
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

  private clearRemote() {
    this.remoteCancel?.();
    this.remoteCancel = null;
    if (this.remote) {
      this.remote.onerror = null;
      this.remote.pause();
      this.remote.removeAttribute('src');
      this.remote.load();
      this.remote = null;
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
  private async playRemote(url: string, volume: number, version: number, local = false) {
    const element = new Audio(local ? url : audioUrlSchema.parse(url));
    element.loop = true;
    element.volume = volume;
    element.preload = 'none';
    this.remote = element;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(
        () => fail('Tải âm thanh quá lâu. Kiểm tra link hoặc kết nối mạng.'),
        8000,
      );
      const finish = () => {
        if (settled) return false;
        settled = true;
        clearTimeout(timeout);
        if (this.remote === element) this.remoteCancel = null;
        return true;
      };
      const fail = (message: string) => {
        if (version !== this.ambientVersion) {
          if (finish()) resolve();
          return;
        }
        const wasPending = finish();
        this.clearRemote();
        if (wasPending) reject(new Error(message));
        else this.onError(message);
      };
      this.remoteCancel = () => {
        if (finish()) resolve();
      };
      element.onerror = () =>
        fail(
          local
            ? 'Không phát được file âm thanh. Hãy chọn file khác được trình duyệt hỗ trợ.'
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
                ? 'Không phát được file âm thanh. Hãy chọn file khác được trình duyệt hỗ trợ.'
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
      this.remote
    ) {
      this.remote.volume = volume;
      return;
    }
    if (
      sound === this.sound &&
      url === this.sourceUrl &&
      (fileId ?? '') === this.sourceFileId &&
      this.ambientGain
    ) {
      this.ambientGain.gain.setTargetAtTime(volume * 0.45, this.ctx().currentTime, 0.15);
      return;
    }
    const version = ++this.ambientVersion;
    this.clearRemote();
    this.sourceUrl = url;
    this.sourceFileId = fileId ?? '';
    this.ambient?.stop();
    this.ambient?.disconnect();
    this.ambientGain?.disconnect();
    this.ambient = null;
    this.ambientGain = null;
    this.sound = sound;
    if (sound === 'off') return;
    if (fileId) {
      const blob = await this.readLocalAudio(fileId);
      if (version !== this.ambientVersion) return;
      this.localObjectUrl = URL.createObjectURL(blob);
      await this.playRemote(this.localObjectUrl, volume, version, true);
      return;
    }
    if (url) {
      await this.playRemote(url, volume, version);
      return;
    }
    const ctx = this.ctx();
    await this.unlock();
    if (version !== this.ambientVersion) return;
    const rate = ctx.sampleRate;
    const length = rate * 18;
    const buffer = ctx.createBuffer(2, length, rate);
    let seed = 2319;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let brown = 0;
      for (let i = 0; i < length; i++) {
        const t = i / rate;
        const white = random() * 2 - 1;
        brown = (brown + 0.02 * white) / 1.02;
        // Continuous periodic envelopes ensure a quiet, seamless 18-second loop.
        if (sound === 'rain') data[i] = white * 0.28 + brown * 2;
        if (sound === 'cafe') {
          const chatter =
            Math.sin(2 * Math.PI * 171 * t + 6 * Math.sin((2 * Math.PI * t) / 3)) *
            Math.pow(0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 2), 4);
          const clink =
            Math.sin(2 * Math.PI * 1850 * t) *
            Math.pow(Math.max(0, Math.cos((2 * Math.PI * t) / 6)), 90);
          data[i] = brown * 1.4 + chatter * 0.04 + clink * 0.035;
        }
        if (sound === 'forest') {
          const birds =
            Math.sin(2 * Math.PI * 2500 * t + 55 * Math.sin(2 * Math.PI * 4 * t)) *
            Math.pow(Math.max(0, Math.sin((2 * Math.PI * t) / 6)), 20);
          data[i] = brown * 1.7 + birds * 0.12;
        }
      }
    }
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = volume * 0.45;
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain).connect(ctx.destination);
    source.start();
    this.ambient = source;
    this.ambientGain = gain;
  }
}
