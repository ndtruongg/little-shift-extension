import type { AudioRequest } from '../domain/protocol';

// Procedural audio: all synthesis and sample data are bundled locally.
export class AudioEngine {
  private context: AudioContext | null = null;
  private ambient: AudioBufferSourceNode | null = null;
  private ambientGain: GainNode | null = null;
  private sound = 'off';
  private ambientVersion = 0;
  private seen = new Set<string>();
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
    } else await this.setAmbient(message.sound, message.volume);
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
    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + index * 0.17;
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
  async setAmbient(sound: 'off' | 'rain' | 'cafe' | 'forest', volume: number) {
    if (sound === this.sound && this.ambientGain) {
      this.ambientGain.gain.setTargetAtTime(volume * 0.45, this.ctx().currentTime, 0.15);
      return;
    }
    const version = ++this.ambientVersion;
    this.ambient?.stop();
    this.ambient?.disconnect();
    this.ambientGain?.disconnect();
    this.ambient = null;
    this.ambientGain = null;
    this.sound = sound;
    if (sound === 'off') return;
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
