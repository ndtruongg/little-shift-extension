import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/engine';

afterEach(() => {
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
