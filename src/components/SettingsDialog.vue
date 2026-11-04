<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { useAppStore } from '../stores/app';
import { defaultSettings, parseImport } from '../domain/model';
import { confirmAction } from '../stores/confirm';
import ModalShell from './ModalShell.vue';
import PixelIcon from './PixelIcon.vue';
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const app = useAppStore();
const draft = reactive(defaultSettings());
const importInput = ref<HTMLInputElement>();
const importError = ref('');
const dataMessage = ref('');
watch(
  () => props.open,
  (open) => {
    if (open) {
      Object.assign(draft, app.state.settings);
      importError.value = '';
      dataMessage.value = '';
    }
  },
);
async function save() {
  if (await app.command({ type: 'settings.save', settings: { ...draft } })) emit('close');
}
function exportData() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(app.state, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `little-shift-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  dataMessage.value = 'Đã tạo tệp sao lưu JSON.';
}
async function importData(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importError.value = '';
  try {
    if (file.size > 5_000_000) throw new Error('Tệp quá lớn. Giới hạn 5 MB.');
    const json = await file.text();
    const data = parseImport(json);
    if (
      await confirmAction(
        'Thay thế dữ liệu?',
        `Nhập ${data.tasks.length} công việc và ${data.history.length} phiên. Dữ liệu hiện tại sẽ bị thay thế; timer được đặt lại và âm thanh nền tắt.`,
        'Nhập dữ liệu',
      )
    ) {
      if (await app.command({ type: 'data.import', json, confirmed: true })) {
        Object.assign(draft, app.state.settings);
        dataMessage.value = 'Đã nhập dữ liệu thành công.';
      }
    }
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Không thể đọc tệp.';
  }
  input.value = '';
}
async function reset() {
  if (
    await confirmAction(
      'Xóa toàn bộ dữ liệu?',
      'Công việc, lịch sử và cài đặt sẽ bị xóa. Hãy xuất bản sao lưu trước khi tiếp tục.',
      'Xóa toàn bộ',
    )
  ) {
    if (await app.command({ type: 'data.reset', confirmed: true })) {
      Object.assign(draft, app.state.settings);
      dataMessage.value = 'Đã đặt lại dữ liệu.';
    }
  }
}
async function requestNotification() {
  if (typeof Notification === 'undefined') {
    dataMessage.value = 'Trình duyệt không hỗ trợ thông báo.';
    return;
  }
  const permission = await Notification.requestPermission();
  dataMessage.value =
    permission === 'granted'
      ? 'Đã cấp quyền thông báo cho preview.'
      : 'Chưa có quyền thông báo. Kiểm tra cài đặt trình duyệt.';
}
</script>
<template>
  <ModalShell :open="open" title="Chăm chút góc nhỏ" wide @close="emit('close')">
    <form class="settings-form" @submit.prevent="save">
      <div class="settings-scroll">
        <p v-if="app.error" class="inline-error" role="alert">
          {{ app.error }}
          <button type="button" class="text-button" @click="app.error = ''">Đóng lỗi</button>
        </p>
        <fieldset>
          <legend>Nhịp làm việc</legend>
          <div class="duration-fields">
            <label class="field"
              >Focus (phút)<input
                v-model.number="draft.focus"
                type="number"
                min="1"
                max="120"
                required /></label
            ><label class="field"
              >Nghỉ ngắn<input
                v-model.number="draft.short"
                type="number"
                min="1"
                max="60"
                required /></label
            ><label class="field"
              >Nghỉ dài<input v-model.number="draft.long" type="number" min="1" max="120" required
            /></label>
          </div>
          <div class="field-row">
            <label class="field"
              >Số phiên trước nghỉ dài<input
                v-model.number="draft.cycle"
                type="number"
                min="2"
                max="12"
                required /></label
            ><label class="field"
              >Mục tiêu phiên / ngày<input
                v-model.number="draft.dailyGoal"
                type="number"
                min="1"
                max="24"
                required
            /></label>
          </div>
          <p class="muted small">
            Focus và nghỉ dài: 1–120 phút; nghỉ ngắn: 1–60 phút. Thay đổi thời lượng áp dụng từ
            phiên mới.
          </p>
          <label class="toggle-row"
            ><span>Tự bắt đầu nghỉ sau Focus</span
            ><input v-model="draft.autoBreak" type="checkbox" /></label
          ><label class="toggle-row"
            ><span>Tự bắt đầu Focus sau nghỉ</span><input v-model="draft.autoFocus" type="checkbox"
          /></label>
        </fieldset>
        <fieldset>
          <legend>Chuông & thông báo</legend>
          <label class="toggle-row"
            ><span>Chuông khi hoàn thành phiên</span
            ><input v-model="draft.bellEnabled" type="checkbox"
          /></label>
          <div class="field-row">
            <label class="field"
              >Tiếng chuông<select v-model="draft.bell">
                <option value="soft">Chuông nhẹ</option>
                <option value="bit">8-bit</option>
                <option value="clear">Chuông rõ</option>
              </select></label
            ><button
              type="button"
              class="button secondary preview-bell"
              @click="
                app.command({ type: 'audio.preview', bell: draft.bell, volume: draft.bellVolume })
              "
            >
              <PixelIcon name="play" :size="14" />Nghe thử
            </button>
          </div>
          <label class="field"
            >Âm lượng chuông · {{ Math.round(draft.bellVolume * 100) }}%<input
              v-model.number="draft.bellVolume"
              type="range"
              min="0"
              max="1"
              step="0.01" /></label
          ><label class="toggle-row"
            ><span>Thông báo khi hết phiên</span
            ><input v-model="draft.notifications" type="checkbox"
          /></label>
          <p class="muted small">
            Hệ điều hành hoặc chế độ Không làm phiền có thể chặn thông báo. Chrome cần đang hoạt
            động để xử lý phiên; chuông có thể trễ khi máy ngủ.
          </p>
          <button
            v-if="!app.isExtension"
            type="button"
            class="text-button"
            @click="requestNotification"
          >
            Cấp quyền thông báo cho preview
          </button>
        </fieldset>
        <fieldset>
          <legend>Không gian của bạn</legend>
          <label class="field"
            >Âm thanh nền<select v-model="draft.ambient">
              <option value="off">Tắt</option>
              <option value="rain">Mưa đêm</option>
              <option value="cafe">Quán cà phê</option>
              <option value="forest">Rừng xanh</option>
            </select></label
          ><label class="field"
            >Âm lượng nền · {{ Math.round(draft.ambientVolume * 100) }}%<input
              v-model.number="draft.ambientVolume"
              type="range"
              min="0"
              max="1"
              step="0.01" /></label
          ><label class="toggle-row"
            ><span>Chuyển động trong phòng</span><input v-model="draft.animation" type="checkbox"
          /></label>
          <p class="muted small">
            Tự dừng khi ẩn trang; tôn trọng tùy chọn giảm chuyển động của hệ thống.
          </p>
        </fieldset>
        <fieldset>
          <legend>Dữ liệu cục bộ</legend>
          <p class="muted small">
            Dữ liệu nằm trên thiết bị này. Tạo bản sao lưu trước khi nhập hoặc đặt lại.
          </p>
          <div class="data-actions">
            <button type="button" class="button secondary" @click="exportData">
              <PixelIcon name="download" :size="15" />Xuất JSON</button
            ><button type="button" class="button secondary" @click="importInput?.click()">
              <PixelIcon name="upload" :size="15" />Nhập JSON</button
            ><input
              ref="importInput"
              type="file"
              accept="application/json,.json"
              hidden
              @change="importData"
            />
          </div>
          <button type="button" class="text-button danger-text reset-data" @click="reset">
            Đặt lại toàn bộ dữ liệu
          </button>
          <p v-if="importError" class="inline-error" role="alert">{{ importError }}</p>
          <p v-if="dataMessage" class="mint small" role="status">{{ dataMessage }}</p>
        </fieldset>
      </div>
      <div class="dialog-actions settings-actions">
        <button type="button" class="button secondary" @click="emit('close')">Đóng</button
        ><button type="submit" class="button primary" :disabled="app.busy">Lưu cài đặt</button>
      </div>
    </form>
  </ModalShell>
</template>
