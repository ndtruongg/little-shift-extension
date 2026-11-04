import { z } from 'zod';
import {
  ambientSoundSchema,
  audioUrlSchema,
  modeSchema,
  settingsSchema,
  taskSchema,
  type State,
} from './model';

const key = z.string().min(1).max(100);
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('get') }),
  z.object({ type: z.literal('timer.start') }),
  z.object({ type: z.literal('timer.pause') }),
  z.object({ type: z.literal('timer.reset'), confirmed: z.boolean().optional() }),
  z.object({ type: z.literal('timer.mode'), mode: modeSchema, confirmed: z.boolean().optional() }),
  z.object({
    type: z.literal('task.save'),
    task: taskSchema.omit({ createdAt: true, doneAt: true, completed: true }),
  }),
  z.object({ type: z.literal('task.toggle'), id: key }),
  z.object({ type: z.literal('task.delete'), id: key }),
  z.object({ type: z.literal('task.select'), id: key.nullable() }),
  z.object({ type: z.literal('task.move'), id: key, direction: z.enum(['up', 'down']) }),
  z.object({ type: z.literal('task.today'), id: key }),
  z.object({ type: z.literal('settings.save'), settings: settingsSchema }),
  z.object({
    type: z.literal('data.import'),
    json: z.string().max(5_000_000),
    confirmed: z.literal(true),
  }),
  z.object({ type: z.literal('data.reset'), confirmed: z.literal(true) }),
  z.object({
    type: z.literal('audio.preview'),
    bell: z.enum(['soft', 'bit', 'clear']),
    volume: z.number().min(0).max(1),
  }),
  z.object({ type: z.literal('notice.dismiss') }),
  z.object({
    type: z.literal('audio.ambientPreview'),
    sound: ambientSoundSchema,
    url: audioUrlSchema,
    fileId: z.string().uuid().optional(),
    volume: z.number().min(0).max(1),
  }),
  z.object({ type: z.literal('audio.previewStop') }),
]);
export type Command = z.infer<typeof commandSchema>;
export type Reply = { ok: true; state: State } | { ok: false; error: string };
export type Request = { target: 'background'; command: Command };
export type AmbientPlayback = {
  sound: State['settings']['ambient'];
  volume: number;
  url?: string;
  fileId?: string;
};
export type AudioRequest =
  | ({ target: 'audio'; type: 'ambient' } & AmbientPlayback)
  | {
      target: 'audio';
      type: 'ambient.preview';
      sound: z.infer<typeof ambientSoundSchema>;
      url: string;
      fileId?: string;
      volume: number;
      restore: AmbientPlayback;
    }
  | { target: 'audio'; type: 'ambient.previewStop' }
  | { target: 'audio'; type: 'bell'; id: string; bell: State['settings']['bell']; volume: number };
export type AudioPreviewCommand = Extract<
  Command,
  { type: 'audio.preview' | 'audio.ambientPreview' | 'audio.previewStop' }
>;
export function ambientPlayback(settings: State['settings']): AmbientPlayback {
  return {
    sound: settings.ambient,
    volume: settings.ambientVolume,
    url: settings.ambient === 'off' ? '' : settings.ambientUrls[settings.ambient],
    fileId: settings.ambient === 'off' ? undefined : settings.ambientFiles[settings.ambient]?.id,
  };
}
export function previewRequest(command: AudioPreviewCommand, state: State): AudioRequest {
  if (command.type === 'audio.ambientPreview')
    return {
      target: 'audio',
      type: 'ambient.preview',
      sound: command.sound,
      url: command.url,
      fileId: command.fileId,
      volume: command.volume,
      restore: ambientPlayback(state.settings),
    };
  if (command.type === 'audio.previewStop') return { target: 'audio', type: 'ambient.previewStop' };
  return {
    target: 'audio',
    type: 'bell',
    id: `preview:${crypto.randomUUID()}`,
    bell: command.bell,
    volume: command.volume,
  };
}
