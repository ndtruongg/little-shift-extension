<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAppStore } from './stores/app';
import { modeLabel } from './domain/model';
import { openDashboard } from './platform/adapter';
import PixelIcon from './components/PixelIcon.vue';
import TimerControls from './components/TimerControls.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import TaskReminderNotice from './components/TaskReminderNotice.vue';
const app = useAppStore();
const task = computed(() =>
  app.state.timer.status === 'idle'
    ? app.activeTask?.title
    : app.state.timer.taskId
      ? app.state.timer.taskTitle
      : null,
);
onMounted(() => app.init());
</script>
<template>
  <main :class="['popup-shell', { 'has-reminders': app.reminderBatches.length > 0 }]">
    <header class="popup-header">
      <PixelIcon name="star" :size="25" />
      <h1>LITTLE SHIFT</h1>
    </header>
    <TaskReminderNotice compact @reveal="openDashboard($event)" />
    <p class="popup-mode">
      {{ modeLabel[app.state.timer.mode]
      }}<span>{{
        app.state.timer.status === 'running'
          ? 'Đang chạy'
          : app.state.timer.status === 'paused'
            ? 'Tạm dừng'
            : 'Sẵn sàng'
      }}</span>
    </p>
    <div class="popup-timer" role="timer">{{ app.time }}</div>
    <p class="popup-task">
      <PixelIcon name="laptop" :size="18" /><span>{{
        task ?? 'Một việc nhỏ, một phiên tập trung.'
      }}</span>
    </p>
    <TimerControls /><button class="button secondary popup-dashboard" @click="openDashboard()">
      Mở góc tập trung<PixelIcon name="arrow" :size="16" />
    </button>
    <p v-if="app.error" class="inline-error" role="alert">{{ app.error }}</p>
    <footer>{{ app.stats.count }} / {{ app.state.settings.dailyGoal }} phiên hôm nay</footer>
    <ConfirmDialog />
  </main>
</template>
<style scoped>
.has-reminders {
  padding: 16px;
}
.has-reminders .popup-mode {
  margin-top: 14px;
}
.has-reminders .popup-timer {
  font-size: 48px;
  line-height: 1.2;
}
.has-reminders .popup-task {
  margin-bottom: 12px;
}
.has-reminders footer {
  margin-top: 12px;
}
</style>
