import { z } from 'zod';
import { modeSchema, settingsSchema, taskSchema, type State } from './model';

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
]);
export type Command = z.infer<typeof commandSchema>;
export type Reply = { ok: true; state: State } | { ok: false; error: string };
export type Request = { target: 'background'; command: Command };
export type AudioRequest =
  | { target: 'audio'; type: 'ambient'; sound: State['settings']['ambient']; volume: number }
  | { target: 'audio'; type: 'bell'; id: string; bell: State['settings']['bell']; volume: number };
