import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { initialState, type Settings } from '../domain/model';
import { statistics } from '../domain/statistics';
import { formatTime, remaining } from '../domain/timer';
import { send, subscribe, subscribeErrors, isExtension } from '../platform/adapter';
import type { Command } from '../domain/protocol';

export const useAppStore = defineStore('app', () => {
  const state = ref(initialState());
  const now = ref(Date.now());
  const ready = ref(false);
  const error = ref('');
  subscribeErrors((message) => {
    error.value = message;
  });
  const pendingCommands = ref(0);
  const busy = computed(() => pendingCommands.value > 0);
  const time = computed(() => formatTime(remaining(state.value.timer, now.value)));
  const stats = computed(() => statistics(state.value, now.value));
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
    document.addEventListener('visibilitychange', repaint);
  }
  async function saveSettings(patch: Partial<Settings>) {
    return command({ type: 'settings.save', settings: { ...state.value.settings, ...patch } });
  }
  return {
    state,
    now,
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
