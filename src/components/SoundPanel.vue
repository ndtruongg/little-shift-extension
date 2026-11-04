<script setup lang="ts">
import { useAppStore } from '../stores/app';
import type { Settings } from '../domain/model';
import PixelIcon from './PixelIcon.vue';
const app = useAppStore();
const sounds: { id: Settings['ambient']; label: string; icon: string }[] = [
  { id: 'rain', label: 'Mưa đêm', icon: 'rain' },
  { id: 'cafe', label: 'Quán cà phê', icon: 'cafe' },
  { id: 'forest', label: 'Rừng xanh', icon: 'forest' },
];
</script>
<template>
  <section class="pixel-panel sound-panel" aria-labelledby="sound-heading">
    <div class="panel-heading">
      <PixelIcon name="music" :size="26" />
      <h2 id="sound-heading">Thanh âm góc nhỏ</h2>
      <span v-if="app.state.settings.ambient !== 'off'" class="equalizer" aria-label="Đang phát"
        ><i /><i /><i /><i
      /></span>
    </div>
    <div class="sound-options">
      <button
        v-for="sound in sounds"
        :key="sound.id"
        :class="['sound-option', { selected: app.state.settings.ambient === sound.id }]"
        :aria-pressed="app.state.settings.ambient === sound.id"
        @click="
          app.saveSettings({ ambient: app.state.settings.ambient === sound.id ? 'off' : sound.id })
        "
      >
        <PixelIcon :name="sound.icon" :size="30" /><span>{{ sound.label }}</span
        ><span class="sound-indicator" />
      </button>
    </div>
    <div class="volume-row">
      <button
        class="small-icon"
        :aria-label="app.state.settings.ambient === 'off' ? 'Bật tiếng mưa' : 'Tắt âm thanh nền'"
        @click="
          app.saveSettings({ ambient: app.state.settings.ambient === 'off' ? 'rain' : 'off' })
        "
      >
        <PixelIcon
          :name="app.state.settings.ambient === 'off' ? 'mute' : 'sound'"
          :size="21"
        /></button
      ><input
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="app.state.settings.ambientVolume"
        aria-label="Âm lượng âm thanh nền"
        :style="{ '--volume': `${app.state.settings.ambientVolume * 100}%` }"
        @input="
          app.saveSettings({ ambientVolume: Number(($event.target as HTMLInputElement).value) })
        "
      /><span>{{ Math.round(app.state.settings.ambientVolume * 100) }}%</span>
    </div>
    <p class="sound-caption">
      {{
        app.state.settings.ambient === 'off'
          ? 'Chọn một thanh âm, tìm một khoảng yên.'
          : 'Nhấn lại thanh âm đang chọn để tắt.'
      }}
    </p>
  </section>
</template>
