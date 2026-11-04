import { z } from 'zod';

// MV3 disallows dynamic code generation, including a library's CSP capability probe.
z.config({ jitless: true });

export const SCHEMA_VERSION = 2;
export const localDay = (time = Date.now()) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const id = z.string().min(1).max(100);
const timestamp = z.number().finite().nonnegative().max(8_640_000_000_000_000);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number);
    const date = new Date(y!, m! - 1, d);
    return date.getFullYear() === y && date.getMonth() === m! - 1 && date.getDate() === d;
  }, 'Ngày không hợp lệ');
export const modeSchema = z.enum(['focus', 'short', 'long']);
export const settingsSchema = z.object({
  focus: z.number().int().min(1).max(120).default(25),
  short: z.number().int().min(1).max(60).default(5),
  long: z.number().int().min(1).max(120).default(15),
  cycle: z.number().int().min(2).max(12).default(4),
  autoBreak: z.boolean().default(false),
  autoFocus: z.boolean().default(false),
  bell: z.enum(['soft', 'bit', 'clear']).default('soft'),
  bellEnabled: z.boolean().default(true),
  bellVolume: z.number().min(0).max(1).default(0.6),
  notifications: z.boolean().default(true),
  ambient: z.enum(['off', 'rain', 'cafe', 'forest']).default('off'),
  ambientVolume: z.number().min(0).max(1).default(0.35),
  animation: z.boolean().default(true),
  dailyGoal: z.number().int().min(1).max(24).default(8),
});
export const taskSchema = z.object({
  id,
  title: z.string().trim().min(1).max(160),
  day,
  priority: z.enum(['low', 'medium', 'high']),
  estimated: z.number().int().min(1).max(24),
  completed: z.number().int().min(0).max(100000),
  doneAt: timestamp.nullable(),
  createdAt: timestamp,
});
const timerSchema = z.object({
  id,
  mode: modeSchema,
  status: z.enum(['idle', 'running', 'paused']),
  durationMs: z.number().int().min(60000).max(7200000),
  remainingMs: z.number().int().min(0).max(7200000),
  endAt: timestamp.nullable(),
  startedAt: timestamp.nullable(),
  taskId: id.nullable(),
  taskTitle: z.string().max(160).nullable(),
});
const historySchema = z.object({
  id,
  mode: modeSchema,
  taskId: id.nullable(),
  taskTitle: z.string().max(160).nullable(),
  startedAt: timestamp,
  endedAt: timestamp,
  durationMs: z.number().int().min(60000).max(7200000),
  result: z.enum(['completed', 'abandoned']),
});
export const completionSchema = z.object({
  id,
  mode: modeSchema,
  nextMode: modeSchema,
  at: timestamp,
});
export const stateSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    revision: z.number().int().nonnegative(),
    settings: settingsSchema,
    tasks: z.array(taskSchema).max(5000),
    activeTaskId: id.nullable(),
    timer: timerSchema,
    history: z.array(historySchema).max(20000),
    focusCount: z.number().int().nonnegative(),
    lastCompletion: completionSchema.nullable(),
    recoveryNotice: z.string().max(400).optional(),
  })
  .superRefine((s, ctx) => {
    if (
      new Set(s.tasks.map((t) => t.id)).size !== s.tasks.length ||
      new Set(s.history.map((t) => t.id)).size !== s.history.length
    )
      ctx.addIssue({ code: 'custom', message: 'ID công việc hoặc phiên bị trùng' });
    if (s.activeTaskId && !s.tasks.some((t) => t.id === s.activeTaskId))
      ctx.addIssue({ code: 'custom', message: 'Công việc đang chọn không tồn tại' });
    if (
      (s.timer.status === 'running' && (s.timer.endAt === null || s.timer.startedAt === null)) ||
      (s.timer.status !== 'running' && s.timer.endAt !== null) ||
      (s.timer.status === 'paused' && s.timer.startedAt === null) ||
      (s.timer.endAt !== null && s.timer.startedAt !== null && s.timer.endAt < s.timer.startedAt) ||
      s.timer.remainingMs > s.timer.durationMs
    )
      ctx.addIssue({ code: 'custom', message: 'Trạng thái đồng hồ không hợp lệ' });
    if (s.history.some((h) => h.endedAt < h.startedAt))
      ctx.addIssue({ code: 'custom', message: 'Thời điểm kết thúc phiên không hợp lệ' });
  });
export type Mode = z.infer<typeof modeSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Timer = z.infer<typeof timerSchema>;
export type State = z.infer<typeof stateSchema>;
export type Completion = z.infer<typeof completionSchema>;
export const modeLabel: Record<Mode, string> = {
  focus: 'Tập trung',
  short: 'Nghỉ ngắn',
  long: 'Nghỉ dài',
};
export const defaultSettings = () => settingsSchema.parse({});
export const newTimer = (mode: Mode, settings: Settings): Timer => ({
  id: crypto.randomUUID(),
  mode,
  status: 'idle',
  durationMs: settings[mode] * 60000,
  remainingMs: settings[mode] * 60000,
  endAt: null,
  startedAt: null,
  taskId: null,
  taskTitle: null,
});
export const initialState = (): State => {
  const settings = defaultSettings();
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    settings,
    tasks: [],
    activeTaskId: null,
    timer: newTimer('focus', settings),
    history: [],
    focusCount: 0,
    lastCompletion: null,
  };
};

export function decodeState(raw: unknown): State {
  if (!raw || typeof raw !== 'object') throw new Error('Dữ liệu phải là một đối tượng JSON.');
  let value = raw;
  if ('schemaVersion' in raw && raw.schemaVersion === 1) {
    const history = 'history' in raw && Array.isArray(raw.history) ? raw.history : [];
    const completedFocus = history.filter(
      (entry: unknown) =>
        !!entry &&
        typeof entry === 'object' &&
        'mode' in entry &&
        entry.mode === 'focus' &&
        'result' in entry &&
        entry.result === 'completed',
    ).length;
    value = {
      revision: 0,
      focusCount: completedFocus,
      lastCompletion: null,
      settings: defaultSettings(),
      ...raw,
      schemaVersion: 2,
    };
  }
  const parsed = stateSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(`Dữ liệu không hợp lệ: ${parsed.error.issues[0]?.message ?? 'Sai schema'}.`);
  return parsed.data;
}

export function parseImport(text: string): State {
  if (text.length > 5_000_000) throw new Error('Tệp quá lớn. Giới hạn 5 MB.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Tệp không phải JSON hợp lệ.');
  }
  return decodeState(raw);
}
