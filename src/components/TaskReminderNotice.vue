<script setup lang="ts">
import { computed } from 'vue';
import { formatDue } from '../domain/reminders';
import { useAppStore } from '../stores/app';
import PixelIcon from './PixelIcon.vue';
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
const emit = defineEmits<{ reveal: [id: string] }>();
const app = useAppStore();
const current = computed(() => app.reminderBatches[0]);
const announcement = computed(() =>
  current.value
    ? `Nhắc hạn ${current.value.tasks.length} công việc: ${current.value.tasks.map((task) => task.title).join(', ')}.`
    : '',
);
</script>
<template>
  <div class="reminder-announcement" role="status" aria-atomic="true">{{ announcement }}</div>
  <section
    v-if="current"
    class="task-reminder-notice pixel-panel"
    :class="{ compact }"
    aria-labelledby="task-reminder-heading"
  >
    <header class="reminder-heading">
      <PixelIcon name="bell" class="gold" :size="compact ? 20 : 26" />
      <div>
        <h2 id="task-reminder-heading">Nhắc hạn công việc</h2>
        <p>
          {{ current.tasks.length }} công việc đến giờ nhắc<span
            v-if="app.reminderBatches.length > 1"
          >
            · {{ app.reminderBatches.length }} đợt chưa xem</span
          >
        </p>
      </div>
    </header>
    <ul class="reminder-tasks">
      <li v-for="task in current.tasks" :key="task.id">
        <div class="reminder-task-copy">
          <strong>{{ task.title }}</strong>
          <p>
            <PixelIcon name="calendar" :size="13" /> Hạn · {{ formatDue(task.dueAt, app.taskNow) }}
          </p>
        </div>
        <button
          class="text-button"
          :aria-label="`Xem task ${task.title}`"
          @click="emit('reveal', task.id)"
        >
          Xem task <PixelIcon name="arrow" :size="12" />
        </button>
      </li>
    </ul>
    <div class="reminder-actions">
      <button
        class="button secondary"
        :disabled="app.busy"
        @click="app.command({ type: 'reminder.snooze', notificationId: current.id })"
      >
        Nhắc sau 10 phút
      </button>
      <button
        class="button primary"
        :disabled="app.busy"
        @click="app.command({ type: 'reminder.dismiss', notificationId: current.id })"
      >
        Đã xem
      </button>
    </div>
  </section>
</template>
<style scoped>
.reminder-announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.task-reminder-notice {
  width: min(460px, calc(100vw - 40px));
  flex-shrink: 0;
  padding: 18px;
  border-color: var(--primary);
}
.reminder-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}
.reminder-heading h2 {
  font-family: 'VT323', monospace;
  font-size: 26px;
  font-weight: 400;
  letter-spacing: 0;
}
.reminder-heading p {
  margin-top: 2px;
  font-size: 11px;
  color: var(--muted);
}
.reminder-tasks {
  list-style: none;
  padding: 0;
  margin: 14px 0;
  max-height: min(30dvh, 260px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.reminder-tasks li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--border-soft);
}
.reminder-task-copy {
  min-width: 0;
}
.reminder-task-copy strong {
  display: block;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.reminder-task-copy p {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  font-size: 11px;
  color: var(--muted);
}
.reminder-task-copy p svg {
  flex-shrink: 0;
}
.reminder-tasks .text-button {
  flex-shrink: 0;
  min-height: 40px;
  font-size: 11px;
}
.reminder-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}
.reminder-actions .button {
  font-size: 12px;
  min-height: 40px;
}
.compact {
  width: 100%;
  padding: 12px;
  margin-top: 16px;
}
.compact .reminder-heading {
  gap: 8px;
}
.compact .reminder-heading h2 {
  font-size: 22px;
}
.compact .reminder-tasks {
  max-height: 112px;
  margin: 8px 0;
}
.compact .reminder-tasks li {
  padding: 8px 0;
  gap: 8px;
}
.compact .reminder-task-copy strong {
  font-size: 12px;
}
.compact .reminder-task-copy p {
  font-size: 10px;
}
.compact .reminder-actions {
  gap: 8px;
}
.compact .reminder-actions .button {
  font-size: 10px;
  min-height: 36px;
  padding: 8px;
}
@media (max-width: 520px) {
  .task-reminder-notice {
    padding: 14px;
  }
  .reminder-tasks li {
    align-items: flex-start;
  }
  .reminder-actions .button {
    flex: 1;
    padding-inline: 10px;
  }
}
</style>
