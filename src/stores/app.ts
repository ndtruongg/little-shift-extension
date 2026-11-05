import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { initialState, type Settings } from '../domain/model';
import { statistics } from '../domain/statistics';
import { formatTime, remaining } from '../domain/timer';
import { send, subscribe, subscribeErrors, isExtension } from '../platform/adapter';
import type { Command } from '../domain/protocol';
import { nextTaskLabelAt, unreadReminderBatches } from '../domain/reminders';

export const useAppStore = defineStore('app', () => {
  const state = ref(initialState());
  const now = ref(Date.now());
  const taskNow = ref(now.value);
  let taskWakeup: ReturnType<typeof setTimeout> | undefined;
  function refreshTaskTime() {
    clearTimeout(taskWakeup);
    if (document.hidden) return;
    taskNow.value = Date.now();
    taskWakeup = setTimeout(
      refreshTaskTime,
      Math.max(1, nextTaskLabelAt(state.value.tasks, taskNow.value) - taskNow.value),
    );
  }
  watch(() => state.value.tasks, refreshTaskTime);
  const reminderBatches = computed(() => unreadReminderBatches(state.value));
  const ready = ref(false);
  const error = ref('');
  subscribeErrors((message) => {
    error.value = message;
  });
  const pendingCommands = ref(0);
  const busy = computed(() => pendingCommands.value > 0);
  const time = computed(() => formatTime(remaining(state.value.timer, now.value)));
  const stats = computed(() => statistics(state.value, taskNow.value));
  const activeTask = computed(() =>
    state.value.tasks.find((task) => task.id === state.value.activeTaskId),
  );
  const update = (value: typeof state.value) => {
    if (ready.value && value.revision < state.value.revision) return;
    state.value = value;
    now.value = Date.now();
  };
  subscribe(update);
  async function command(value: Command) {
    pendingCommands.value++;
    try {
      const result = await send(value);
      update(result);
      return true;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Không thể thực hiện thao tác.';
      return false;
    } finally {
      pendingCommands.value--;
    }
  }
  async function init() {
    await command({ type: 'get' });
    ready.value = true;
    refreshTaskTime();
    // A repaint heartbeat only. The timer authority is endAt in the coordinator.
    const repaint = () => {
      document.documentElement.dataset.hidden = String(document.hidden);
      now.value = Date.now();
      document.title = `${time.value} · Little Shift`;
    };
    setInterval(() => {
      if (!document.hidden) repaint();
      else
        document.title = `${formatTime(remaining(state.value.timer, Date.now()))} · Little Shift`;
    }, 1000);
    document.addEventListener('visibilitychange', () => {
      repaint();
      refreshTaskTime();
    });
  }
  async function saveSettings(patch: Partial<Settings>) {
    return command({ type: 'settings.save', settings: { ...state.value.settings, ...patch } });
  }
  return {
    state,
    now,
    taskNow,
    reminderBatches,
    ready,
    error,
    busy,
    time,
    stats,
    activeTask,
    isExtension,
    command,
    init,
    saveSettings,
  };
});
