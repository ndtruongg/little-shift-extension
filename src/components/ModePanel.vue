<script setup lang="ts">
import { useAppStore } from '../stores/app';
import { modeLabel, type Mode } from '../domain/model';
import { confirmAction } from '../stores/confirm';
import PixelIcon from './PixelIcon.vue';
const app = useAppStore();
const modes: Mode[] = ['focus', 'short', 'long'];
async function setMode(mode: Mode) {
  if (mode === app.state.timer.mode) return;
  if (
    app.state.timer.status !== 'idle' &&
    !(await confirmAction(
      'Chuyển chế độ?',
      'Phiên hiện tại sẽ dừng và không được tính là hoàn thành.',
      'Chuyển chế độ',
    ))
  )
    return;
  await app.command({ type: 'timer.mode', mode, confirmed: true });
}
</script>
<template>
  <section class="pixel-panel mode-panel" aria-labelledby="mode-heading">
    <div class="panel-heading">
      <PixelIcon name="tomato" class="peach" :size="26" />
      <h2 id="mode-heading">Nhịp tập trung</h2>
    </div>
    <div class="mode-tabs" aria-label="Chế độ Pomodoro">
      <button
        v-for="mode in modes"
        :key="mode"
        :class="{ selected: app.state.timer.mode === mode }"
        :aria-pressed="app.state.timer.mode === mode"
        @click="setMode(mode)"
      >
        {{ modeLabel[mode] }}
      </button>
    </div>
    <div class="cycle-row">
      <span
        >Phiên {{ (app.state.focusCount % app.state.settings.cycle) + 1 }} /
        {{ app.state.settings.cycle }}</span
      ><span
        class="cycle-dots"
        :aria-label="`${app.state.focusCount % app.state.settings.cycle} phiên đã hoàn thành trong chu kỳ`"
        ><i
          v-for="n in app.state.settings.cycle"
          :key="n"
          :class="{ complete: n <= app.state.focusCount % app.state.settings.cycle }"
      /></span>
    </div>
  </section>
</template>
