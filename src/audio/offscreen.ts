import { AudioEngine } from './engine';
import type { AudioRequest } from '../domain/protocol';
const engine = new AudioEngine();
chrome.runtime.onMessage.addListener((message: AudioRequest, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.target !== 'audio') return;
  engine
    .handle(message)
    .then(() => respond({ ok: true }))
    .catch((error: unknown) => {
      respond({
        ok: false,
        error: error instanceof Error ? error.message : 'Không thể phát âm thanh.',
      });
    });
  return true;
});
// Ask the coordinator for the current sound when this document is recreated.
void chrome.runtime.sendMessage({ target: 'background', command: { type: 'get' } });
