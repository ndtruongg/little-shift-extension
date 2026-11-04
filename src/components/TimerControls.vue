<script setup lang="ts">
import { useAppStore } from '../stores/app';
import { confirmAction } from '../stores/confirm';
import PixelIcon from './PixelIcon.vue';
const app = useAppStore();
async function reset() {
  if (
    app.state.timer.status !== 'idle' &&
    !(await confirmAction(
      'Bắt đầu lại phiên?',
      'Tiến độ của phiên này sẽ không được tính vào thống kê.',
      'Bắt đầu lại',
    ))
  )
    return;
  await app.command({ type: 'timer.reset', confirmed: true });
}
</script>
<template>
  <div class="timer-controls">
    <button
      class="button primary timer-primary"
      :disabled="app.busy || !app.ready"
      @click="
        app.command({ type: app.state.timer.status === 'running' ? 'timer.pause' : 'timer.start' })
      "
    >
      <PixelIcon :name="app.state.timer.status === 'running' ? 'pause' : 'play'" :size="20" />{{
        app.state.timer.status === 'running'
          ? 'Tạm dừng'
          : app.state.timer.status === 'paused'
            ? 'Tiếp tục tập trung'
            : app.state.timer.mode === 'focus'
              ? 'Bắt đầu tập trung'
              : 'Bắt đầu nghỉ ngơi'
      }}</button
    ><button
      class="button secondary reset-button"
      aria-label="Bắt đầu lại phiên"
      :disabled="app.busy"
      @click="reset"
    >
      <PixelIcon name="reset" :size="24" />
    </button>
  </div>
</template>
