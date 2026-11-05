import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/engine';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('central audio engine', () => {
  it('fails within a bounded time if autoplay leaves AudioContext.resume pending', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended';
        resume() {
          return new Promise<void>(() => {});
        }
      },
    );
    const result = new AudioEngine().unlock();
    const assertion = expect(result).rejects.toThrow('chặn âm thanh');
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('deduplicates a completion bell by ID while allowing distinct preview IDs', async () => {
    const engine = new AudioEngine();
    const bell = vi.spyOn(engine, 'bell').mockResolvedValue(undefined);
    await engine.handle({
      target: 'audio',
      type: 'bell',
      id: 'completed-1',
      bell: 'soft',
      volume: 0.4,
    });
    await engine.handle({
      target: 'audio',
      type: 'bell',
      id: 'completed-1',
      bell: 'soft',
      volume: 0.4,
    });
    await engine.handle({
      target: 'audio',
      type: 'bell',
      id: 'preview-1',
      bell: 'bit',
      volume: 0.2,
    });
    expect(bell).toHaveBeenCalledTimes(2);
  });
  it('keeps one ambient source when two initializations race and volume changes', async () => {
    let resume!: () => void;
    const pending = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const stop = vi.fn();
    const source = {
      connect: vi.fn().mockReturnThis(),
      start: vi.fn(),
      stop,
      disconnect: vi.fn(),
      buffer: null,
      loop: false,
    };
    const gain = {
      gain: { value: 0, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const createBufferSource = vi.fn(() => source);
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended';
        sampleRate = 128;
        currentTime = 0;
        destination = {};
        resume() {
          return pending;
        }
        createBuffer() {
          return { getChannelData: () => new Float32Array(2304) };
        }
        createBufferSource = createBufferSource;
        createGain() {
          return gain;
        }
      },
    );
    const engine = new AudioEngine();
    const first = engine.setAmbient('rain', 0.3);
    const second = engine.setAmbient('cafe', 0.4);
    resume();
    await Promise.all([first, second]);
    expect(createBufferSource).toHaveBeenCalledTimes(1);
    await engine.setAmbient('cafe', 0.8);
    expect(gain.gain.setTargetAtTime).toHaveBeenCalledOnce();
    expect(createBufferSource).toHaveBeenCalledTimes(1);
    await engine.setAmbient('off', 0);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

function mockMedia(play: () => Promise<void> = () => Promise.resolve()) {
  const elements: FakeAudio[] = [];
  class FakeAudio {
    loop = false;
    volume = 1;
    preload = '';
    onerror: (() => void) | null = null;
    play = vi.fn(play);
    pause = vi.fn();
    load = vi.fn();
    removeAttribute = vi.fn(() => {
      this.src = '';
    });
    constructor(public src: string) {
      elements.push(this);
    }
  }
  vi.stubGlobal('Audio', FakeAudio);
  return elements;
}

describe('custom ambient media', () => {
  it('loops a direct URL, updates volume in place and replaces the source when its URL changes', async () => {
    const elements = mockMedia();
    const engine = new AudioEngine();
    await engine.setAmbient('rain', 0.3, 'https://audio.example/rain.mp3');
    expect(elements[0]).toMatchObject({
      src: 'https://audio.example/rain.mp3',
      loop: true,
      volume: 0.3,
    });
    await engine.setAmbient('rain', 0.7, 'https://audio.example/rain.mp3');
    expect(elements).toHaveLength(1);
    expect(elements[0]?.volume).toBe(0.7);
    await engine.setAmbient('rain', 0.4, 'https://audio.example/new.mp3');
    expect(elements[0]?.pause).toHaveBeenCalledOnce();
    expect(elements[1]?.src).toBe('https://audio.example/new.mp3');
    await engine.setAmbient('off', 0);
    expect(elements[1]?.pause).toHaveBeenCalledOnce();
  });
  it('reports a failed URL and still permits a subsequent valid source', async () => {
    const elements = mockMedia();
    const engine = new AudioEngine();
    const pending = engine.setAmbient('rain', 0.3, 'https://audio.example/broken.mp3');
    const assertion = expect(pending).rejects.toThrow('Không phát được link');
    elements[0]?.onerror?.();
    await assertion;
    await engine.setAmbient('forest', 0.4, 'https://audio.example/forest.mp3');
    expect(elements[1]?.play).toHaveBeenCalledOnce();
  });
  it('bounds loading time and cancels an unfinished load when the user switches sounds', async () => {
    vi.useFakeTimers();
    const elements = mockMedia(() => new Promise<void>(() => {}));
    const engine = new AudioEngine();
    const loading = engine.setAmbient('rain', 0.3, 'https://audio.example/slow.mp3');
    await engine.setAmbient('off', 0);
    await loading;
    expect(elements[0]?.pause).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    const timedOut = engine.setAmbient('rain', 0.3, 'https://audio.example/slow.mp3');
    const assertion = expect(timedOut).rejects.toThrow('quá lâu');
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
  });
  it('restores live audio after 10-second preview and ignores unchanged background sync while previewing', async () => {
    vi.useFakeTimers();
    const elements = mockMedia();
    const engine = new AudioEngine();
    const live = { sound: 'rain' as const, volume: 0.4, url: 'https://audio.example/live.mp3' };
    await engine.handle({ target: 'audio', type: 'ambient', ...live });
    await engine.handle({
      target: 'audio',
      type: 'ambient.preview',
      sound: 'cafe',
      volume: 0.5,
      url: 'https://audio.example/preview.mp3',
      restore: live,
    });
    await engine.handle({ target: 'audio', type: 'ambient', ...live });
    expect(elements).toHaveLength(2);
    expect(elements[1]?.pause).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10000);
    expect(elements[1]?.pause).toHaveBeenCalledOnce();
    expect(elements[2]?.src).toBe(live.url);
  });
  it('a new live selection cancels preview restoration and stops the previous source', async () => {
    vi.useFakeTimers();
    const elements = mockMedia();
    const engine = new AudioEngine();
    await engine.handle({
      target: 'audio',
      type: 'ambient.preview',
      sound: 'rain',
      volume: 0.3,
      url: 'https://audio.example/rain.mp3',
      restore: { sound: 'off', volume: 0.3 },
    });
    await engine.handle({
      target: 'audio',
      type: 'ambient',
      sound: 'forest',
      volume: 0.4,
      url: 'https://audio.example/forest.mp3',
    });
    await vi.advanceTimersByTimeAsync(11000);
    expect(elements).toHaveLength(2);
    expect(elements[0]?.pause).toHaveBeenCalledOnce();
    expect(elements[1]?.pause).not.toHaveBeenCalled();
  });
});

describe('local file playback', () => {
  it('loads a stored Blob, loops it, updates volume without reloading and revokes its URL on stop', async () => {
    const elements = mockMedia();
    const blob = new Blob(['audio'], { type: 'audio/wav' });
    const load = vi.fn().mockResolvedValue(blob);
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-audio');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const engine = new AudioEngine(undefined, load);
    await engine.setAmbient('rain', 0.3, '', 'file-id');
    expect(load).toHaveBeenCalledExactlyOnceWith('file-id');
    expect(create).toHaveBeenCalledWith(blob);
    expect(elements[0]).toMatchObject({ src: 'blob:local-audio', loop: true, volume: 0.3 });
    await engine.setAmbient('rain', 0.6, '', 'file-id');
    expect(load).toHaveBeenCalledOnce();
    expect(elements[0]?.volume).toBe(0.6);
    await engine.setAmbient('off', 0);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:local-audio');
    expect(elements[0]?.pause).toHaveBeenCalledOnce();
  });
  it('does not create a Blob URL when a file load is superseded by another selection', async () => {
    let resolve!: (blob: Blob) => void;
    const load = () =>
      new Promise<Blob>((done) => {
        resolve = done;
      });
    const create = vi.spyOn(URL, 'createObjectURL');
    const engine = new AudioEngine(undefined, load);
    const pending = engine.setAmbient('rain', 0.3, '', 'file-id');
    await engine.setAmbient('off', 0);
    resolve(new Blob(['audio']));
    await pending;
    expect(create).not.toHaveBeenCalled();
  });
  it('reports a missing stored file without trying to play a stale path', async () => {
    const elements = mockMedia();
    const engine = new AudioEngine(
      undefined,
      vi.fn().mockRejectedValue(new Error('File không còn trên thiết bị.')),
    );
    await expect(engine.setAmbient('rain', 0.3, '', 'missing-id')).rejects.toThrow('không còn');
    expect(elements).toHaveLength(0);
  });
  it('restores a local file after a remote preview ends', async () => {
    vi.useFakeTimers();
    const elements = mockMedia();
    const load = vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' }));
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:restored');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const engine = new AudioEngine(undefined, load);
    const live = { sound: 'rain' as const, volume: 0.3, fileId: 'file-id' };
    await engine.handle({ target: 'audio', type: 'ambient', ...live });
    await engine.handle({
      target: 'audio',
      type: 'ambient.preview',
      sound: 'forest',
      url: 'https://audio.example/forest.mp3',
      volume: 0.4,
      restore: live,
    });
    await vi.advanceTimersByTimeAsync(10000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(elements[2]?.src).toBe('blob:restored');
  });
});

it('queues simultaneous task and Pomodoro bells on one audio timeline without overlap', async () => {
  const starts: number[] = [];
  const stops: number[] = [];
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running';
      currentTime = 10;
      destination = {};
      createOscillator() {
        return {
          type: '',
          frequency: { value: 0 },
          connect: () => ({ connect: () => {} }),
          start: (at: number) => starts.push(at),
          stop: (at: number) => stops.push(at),
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
        };
      }
    },
  );
  const engine = new AudioEngine();
  await Promise.all([
    engine.handle({ target: 'audio', type: 'bell', id: 'pomodoro', bell: 'soft', volume: 0.5 }),
    engine.handle({ target: 'audio', type: 'bell', id: 'task-batch', bell: 'soft', volume: 0.5 }),
  ]);
  expect(starts).toHaveLength(6);
  expect(starts[3]).toBeGreaterThan(stops[2]!);
});
