import { applyCommand, reconcile } from './timer';
import { commandSchema, type AudioPreviewCommand } from './protocol';
import type { Completion, State } from './model';
import { claimDueReminders, type ReminderBatch } from './reminders';

export interface StorageAdapter {
  read(): Promise<State>;
  write(state: State): Promise<void>;
  clearRecovery?(): Promise<void>;
  clearLocalAudio?(): Promise<void>;
}
export interface CoordinatorEffects {
  sync(state: State): Promise<void>;
  complete(completion: Completion, state: State): Promise<void>;
  preview(command: AudioPreviewCommand, state: State): Promise<void>;
  remind?(batch: ReminderBatch, state: State): Promise<void>;
}
export class Coordinator {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private storage: StorageAdapter,
    private effects: CoordinatorEffects,
    private clock: () => number = Date.now,
  ) {}

  dispatch(input: unknown): Promise<State> {
    const operation = this.tail.then(async () => {
      const command = commandSchema.parse(input);
      const state = await this.storage.read();
      const now = this.clock();
      const completion = reconcile(state, now);
      // Commit completion before accepting another command or dispatching external effects.
      if (completion) {
        state.revision++;
        await this.storage.write(state);
        await this.effects.complete(completion, state).catch(console.error);
      }
      const next = applyCommand(state, command, now);
      const isPreview =
        command.type === 'audio.preview' ||
        command.type === 'audio.ambientPreview' ||
        command.type === 'audio.previewStop';
      // Apply mutations before checking old alarms, then persist command + claims together.
      const batch = claimDueReminders(next, now);
      if ((command.type !== 'get' && !isPreview) || batch) {
        next.revision = state.revision + 1;
        await this.storage.write(next);
        if (command.type === 'data.reset') await this.storage.clearRecovery?.();
        if (command.type === 'data.reset' || command.type === 'data.import')
          await this.storage.clearLocalAudio?.();
      }
      if (batch) await this.effects.remind?.(batch, next).catch(console.error);
      await this.effects.sync(next);
      if (isPreview) await this.effects.preview(command, next);
      return next;
    });
    this.tail = operation.catch(() => undefined);
    return operation;
  }
}
