<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { modeLabel } from './domain/model';
import { useAppStore } from './stores/app';
import PixelIcon from './components/PixelIcon.vue';
import TaskPanel from './components/TaskPanel.vue';
import PixelRoom from './components/PixelRoom.vue';
import TimerControls from './components/TimerControls.vue';
import ModePanel from './components/ModePanel.vue';
import SoundPanel from './components/SoundPanel.vue';
import StatsPanel from './components/StatsPanel.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
const app = useAppStore();
const settingsOpen = ref(false);
const dismissed = ref('');
const date = computed(() =>
  new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(app.now),
);
const completion = computed(() =>
  app.state.lastCompletion &&
  app.state.lastCompletion.id !== dismissed.value &&
  app.now - app.state.lastCompletion.at < 120000
    ? app.state.lastCompletion
    : null,
);
const timerTask = computed(() =>
  app.state.timer.status === 'idle'
    ? app.activeTask?.title
    : app.state.timer.taskId
      ? app.state.timer.taskTitle
      : null,
);
onMounted(() => app.init());
</script>
<template>
  <div class="app-shell">
    <a class="skip-link" href="#focus-workspace">Đến đồng hồ tập trung</a>
    <header class="app-header">
      <div class="brand">
        <PixelIcon name="star" :size="36" />
        <h1>LITTLE SHIFT</h1>
      </div>
      <span class="header-divider" />
      <p class="greeting">Một góc nhỏ, một nhịp riêng.</p>
      <div class="header-tools">
        <span v-if="!app.isExtension" class="preview-badge">BẢN XEM THỬ</span>
        <div class="header-date">
          <PixelIcon name="calendar" :size="20" /><time>{{ date }}</time>
        </div>
        <span class="header-divider" /><button
          class="icon-button settings-button"
          aria-label="Mở cài đặt"
          @click="settingsOpen = true"
        >
          <PixelIcon name="gear" :size="24" />
        </button>
      </div>
    </header>
    <p v-if="app.state.recoveryNotice" class="recovery-banner" role="alert">
      {{ app.state.recoveryNotice
      }}<button class="text-button" @click="app.command({ type: 'notice.dismiss' })">
        Đã hiểu
      </button>
    </p>
    <main class="dashboard">
      <TaskPanel />
      <section
        id="focus-workspace"
        class="focus-workspace pixel-panel"
        aria-label="Không gian tập trung"
      >
        <PixelRoom />
        <div class="timer-area">
          <div class="timer-eyebrow">
            <span />{{
              app.state.timer.status === 'paused'
                ? 'MỘT KHOẢNG DỪNG NHỎ'
                : app.state.timer.mode === 'focus'
                  ? 'ĐẾN GIỜ TẬP TRUNG'
                  : 'ĐẾN GIỜ NGHỈ NGƠI'
            }}<span />
          </div>
          <div
            class="timer-display"
            role="timer"
            :aria-label="`${modeLabel[app.state.timer.mode]}, còn ${app.time}`"
          >
            {{ app.time }}
          </div>
          <div class="current-task">
            <PixelIcon
              :name="app.state.timer.mode === 'focus' ? 'laptop' : 'cafe'"
              :size="20"
            /><span>{{
              timerTask ??
              (app.state.timer.mode === 'focus'
                ? 'Chọn một việc, bắt đầu từ đây'
                : 'Hít thở sâu. Bạn đã làm rất tốt.')
            }}</span>
          </div>
          <TimerControls />
          <p class="timer-footnote">
            <span :class="['status-dot', { running: app.state.timer.status === 'running' }]" />{{
              app.state.timer.status === 'running'
                ? 'Đang đếm · cứ để mọi thứ chậm lại'
                : app.state.timer.status === 'paused'
                  ? 'Đã tạm dừng · tiếp tục khi bạn sẵn sàng'
                  : `${app.state.settings[app.state.timer.mode]} phút cho ${app.state.timer.mode === 'focus' ? 'điều quan trọng' : 'chính mình'}`
            }}
          </p>
        </div>
      </section>
      <aside class="right-column" aria-label="Phiên, âm thanh và thống kê">
        <ModePanel /><SoundPanel /><StatsPanel />
        <div class="cozy-note">
          <PixelIcon name="moon" :size="18" /><span
            >Không cần vội. Bạn đang tiến về phía trước.</span
          >
        </div>
      </aside>
    </main>
    <footer class="app-footer">
      <div class="daily-goal">
        <span class="goal-stars" aria-hidden="true"
          ><PixelIcon
            v-for="n in Math.min(app.state.settings.dailyGoal, 12)"
            :key="n"
            name="star"
            :size="18"
            :class="{
              earned:
                n <=
                (app.stats.count / app.state.settings.dailyGoal) *
                  Math.min(app.state.settings.dailyGoal, 12),
            }" /></span
        ><span class="footer-divider" /><span
          ><strong>{{ app.stats.count }}/{{ app.state.settings.dailyGoal }}</strong> phiên mục tiêu
          hôm nay</span
        >
      </div>
      <span class="footer-note"
        >{{
          app.isExtension
            ? 'Một bước nhỏ, mỗi ngày.'
            : 'Preview · Giữ trang mở để timer hoạt động.'
        }}<span class="footer-spark">✦</span></span
      >
    </footer>
    <div v-if="completion" class="completion-toast pixel-panel" role="status">
      <PixelIcon name="bell" class="gold" :size="30" />
      <div>
        <strong>{{ modeLabel[completion.mode] }} hoàn thành!</strong>
        <p>
          Đến lúc {{ modeLabel[completion.nextMode].toLowerCase() }} ·
          {{ app.state.settings[completion.nextMode] }} phút.
        </p>
      </div>
      <button
        v-if="app.state.timer.status === 'idle'"
        class="button primary"
        @click="
          app.command({ type: 'timer.start' });
          dismissed = completion.id;
        "
      >
        Bắt đầu {{ completion.nextMode === 'focus' ? 'Focus' : 'nghỉ' }}</button
      ><button
        class="small-icon"
        aria-label="Đóng thông báo hoàn thành"
        @click="dismissed = completion.id"
      >
        <PixelIcon name="close" :size="16" />
      </button>
    </div>
    <div v-if="app.error" class="error-toast pixel-panel" role="alert">
      <span>{{ app.error }}</span
      ><button class="small-icon" aria-label="Đóng thông báo lỗi" @click="app.error = ''">
        <PixelIcon name="close" :size="14" />
      </button>
    </div>
    <SettingsDialog :open="settingsOpen" @close="settingsOpen = false" /><ConfirmDialog />
  </div>
</template>
