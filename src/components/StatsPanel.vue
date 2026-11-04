<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../stores/app';
import PixelIcon from './PixelIcon.vue';
const app = useAppStore();
const maximum = computed(() => Math.max(4, ...app.stats.days.map((d) => d.count)));
</script>
<template>
  <section class="pixel-panel stats-panel" aria-labelledby="stats-heading">
    <div class="panel-heading">
      <PixelIcon name="flag" class="gold" :size="26" />
      <h2 id="stats-heading">Từng chút tiến bộ</h2>
    </div>
    <div class="stat-summary">
      <div>
        <PixelIcon name="clock" class="gold" :size="24" /><strong
          >{{ app.stats.minutes }}<small>phút</small></strong
        >
      </div>
      <div>
        <PixelIcon name="layers" class="mint" :size="25" /><strong
          >{{ app.stats.count }}<small>phiên</small></strong
        >
      </div>
    </div>
    <div class="chart-heading">
      <span>7 ngày tập trung</span><span>{{ app.stats.tasks }} việc xong hôm nay</span>
    </div>
    <div
      class="week-chart"
      role="img"
      :aria-label="`Số phiên Focus hoàn thành trong 7 ngày: ${app.stats.days.map((d) => `${d.day}: ${d.count}`).join(', ')}`"
    >
      <div v-for="(day, index) in app.stats.days" :key="day.day" class="chart-column">
        <div class="chart-bar-track">
          <span
            class="chart-bar"
            :class="{ today: index === 6 }"
            :style="{ height: `${Math.max(3, (day.count / maximum) * 100)}%` }"
            :title="`${day.day}: ${day.count} phiên`"
            tabindex="0"
            ><span class="chart-tooltip">{{ day.count }} phiên</span></span
          >
        </div>
        <span :class="{ gold: index === 6 }">{{
          index === 6 ? 'Nay' : day.label.replace('Th ', 'T')
        }}</span>
      </div>
    </div>
    <p v-if="!app.stats.days.some((d) => d.count)" class="stats-empty">
      Một phiên đầu tiên, một bước tiến mới.
    </p>
  </section>
</template>
