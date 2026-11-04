import { describe, expect, it } from 'vitest';
import { validateLocalAudio } from '../src/platform/local-audio';
import {
  decodeState,
  emptyAmbientFiles,
  initialState,
  MAX_AUDIO_FILE_BYTES,
} from '../src/domain/model';
import { applyCommand } from '../src/domain/timer';

it('accepts audio files and recognizable extensions without relying on a filename path', () => {
  expect(() =>
    validateLocalAudio({ name: 'Mưa đêm.mp3', type: 'audio/mpeg', size: 1024 }),
  ).not.toThrow();
  expect(() => validateLocalAudio({ name: 'rain.ogg', type: '', size: 1024 })).not.toThrow();
});
describe('local file validation', () => {
  it.each([
    { name: 'empty.wav', type: 'audio/wav', size: 0 },
    { name: 'huge.mp3', type: 'audio/mpeg', size: MAX_AUDIO_FILE_BYTES + 1 },
    { name: 'document.html', type: 'text/html', size: 50 },
  ])('rejects unsupported file %j', (file) => {
    expect(() => validateLocalAudio(file)).toThrow();
  });
});
it('defaults existing settings to no local files and validates file metadata', () => {
  const state = initialState();
  const { ambientFiles: _files, ...oldSettings } = state.settings;
  expect(decodeState({ ...state, settings: oldSettings }).settings.ambientFiles).toEqual(
    emptyAmbientFiles(),
  );
  const file = { id: crypto.randomUUID(), name: 'rain.wav', type: 'audio/wav', size: 500 };
  state.settings.ambientFiles.rain = file;
  expect(decodeState(state).settings.ambientFiles.rain).toEqual(file);
  state.settings.ambientFiles.rain.size = MAX_AUDIO_FILE_BYTES + 1;
  expect(() => decodeState(state)).toThrow();
});
it('import drops local file references because JSON does not contain binary audio', () => {
  const imported = initialState();
  imported.settings.ambientFiles.rain = {
    id: crypto.randomUUID(),
    name: 'rain.wav',
    type: 'audio/wav',
    size: 500,
  };
  const state = applyCommand(
    initialState(),
    { type: 'data.import', json: JSON.stringify(imported), confirmed: true },
    Date.now(),
  );
  expect(state.settings.ambientFiles).toEqual(emptyAmbientFiles());
});
