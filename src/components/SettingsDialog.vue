<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useAppStore } from '../stores/app';
import { audioUrlSchema, defaultSettings, parseImport, type Settings } from '../domain/model';
import { confirmAction } from '../stores/confirm';
import { removeLocalAudio, saveLocalAudio } from '../platform/local-audio';
import ModalShell from './ModalShell.vue';
import PixelIcon from './PixelIcon.vue';
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const app = useAppStore();
const draft = reactive(defaultSettings());
type AmbientSound = keyof Settings['ambientUrls'];
const ambientOptions: { id: AmbientSound; label: string }[] = [
  { id: 'rain', label: 'Mưa đêm' },
  { id: 'cafe', label: 'Quán cà phê' },
  { id: 'forest', label: 'Rừng xanh' },
];
const linkErrors = reactive({ rain: '', cafe: '', forest: '' });
const previewSound = ref<AmbientSound | null>(null);
const previewLoading = ref(false);
const audioFileInput = ref<HTMLInputElement>();
const pickingSound = ref<AmbientSound | null>(null);
const fileLoading = ref<AmbientSound | null>(null);
const stagedFiles = new Set<string>();
let draftVersion = 0;
let saving = false;
let previewVersion = 0;
let previewTimer: ReturnType<typeof setTimeout> | null = null;
const copySettings = () => ({
  ...app.state.settings,
  ambientUrls: { ...app.state.settings.ambientUrls },
  ambientFiles: { ...app.state.settings.ambientFiles },
});
const formatFileSize = (size: number) =>
  size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
const savedFileIds = () =>
  new Set(
    Object.values(app.state.settings.ambientFiles).flatMap((file) => (file ? [file.id] : [])),
  );
async function discardDraftFiles() {
  const saved = savedFileIds();
  for (const id of stagedFiles) if (!saved.has(id)) await removeLocalAudio(id);
  stagedFiles.clear();
}
function chooseFile(sound: AmbientSound) {
  pickingSound.value = sound;
  audioFileInput.value?.click();
}
async function selectFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  const sound = pickingSound.value;
  input.value = '';
  if (!file || !sound) return;
  const version = draftVersion;
  fileLoading.value = sound;
  linkErrors[sound] = '';
  try {
    await stopPreview();
    const metadata = await saveLocalAudio(file);
    if (!props.open || version !== draftVersion) {
      await removeLocalAudio(metadata.id);
      return;
    }
    const previous = draft.ambientFiles[sound];
    draft.ambientFiles[sound] = metadata;
    draft.ambientUrls[sound] = '';
    stagedFiles.add(metadata.id);
    if (previous && stagedFiles.has(previous.id)) {
      await removeLocalAudio(previous.id);
      stagedFiles.delete(previous.id);
    }
  } catch (error) {
    linkErrors[sound] = error instanceof Error ? error.message : 'Không lưu được file âm thanh.';
  } finally {
    fileLoading.value = null;
  }
}
async function clearFile(sound: AmbientSound) {
  await stopPreview();
  const previous = draft.ambientFiles[sound];
  draft.ambientFiles[sound] = null;
  linkErrors[sound] = '';
  if (previous && stagedFiles.has(previous.id)) {
    try {
      await removeLocalAudio(previous.id);
      stagedFiles.delete(previous.id);
    } catch (error) {
      linkErrors[sound] = error instanceof Error ? error.message : 'Không xóa được file.';
    }
  }
}
function validateLink(sound: AmbientSound) {
  const result = audioUrlSchema.safeParse(draft.ambientUrls[sound]);
  linkErrors[sound] = result.success ? '' : result.error.issues[0]!.message;
  return result.success;
}
async function stopPreview() {
  previewVersion++;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = null;
  const active = previewSound.value !== null;
  previewSound.value = null;
  previewLoading.value = false;
  if (active) await app.command({ type: 'audio.previewStop' });
}
async function previewAmbient(sound: AmbientSound) {
  if (previewSound.value === sound) {
    await stopPreview();
    return;
  }
  if (!validateLink(sound)) return;
  app.error = '';
  await stopPreview();
  const version = ++previewVersion;
  previewSound.value = sound;
  previewLoading.value = true;
  const ok = await app.command({
    type: 'audio.ambientPreview',
    sound,
    url: draft.ambientUrls[sound].trim(),
    fileId: draft.ambientFiles[sound]?.id,
    volume: draft.ambientVolume,
  });
  if (version !== previewVersion) return;
  previewLoading.value = false;
  if (!ok) {
    linkErrors[sound] = app.error;
    previewSound.value = null;
    return;
  }
  previewTimer = setTimeout(() => {
    previewSound.value = null;
    previewTimer = null;
  }, 10000);
}
onBeforeUnmount(() => {
  void stopPreview();
  if (!saving) void discardDraftFiles().catch(() => undefined);
});
watch(
  () => app.error,
  (error) => {
    if (error && previewSound.value) linkErrors[previewSound.value] = error;
  },
);
const importInput = ref<HTMLInputElement>();
const importError = ref('');
const dataMessage = ref('');
watch(
  () => props.open,
  (open) => {
    draftVersion++;
    if (open) {
      Object.assign(draft, copySettings());
      Object.assign(linkErrors, { rain: '', cafe: '', forest: '' });
      importError.value = '';
      dataMessage.value = '';
    } else {
      void stopPreview();
      if (!saving) void discardDraftFiles().catch(() => undefined);
    }
  },
);
async function save() {
  if (fileLoading.value) return;
  if (!ambientOptions.map(({ id }) => validateLink(id)).every(Boolean)) return;
  const previous = Object.values(app.state.settings.ambientFiles);
  saving = true;
  const ok = await app.command({
    type: 'settings.save',
    settings: {
      ...draft,
      ambientUrls: { ...draft.ambientUrls },
      ambientFiles: { ...draft.ambientFiles },
    },
  });
  saving = false;
  if (ok) {
    await discardDraftFiles().catch(() => undefined);
    const used = savedFileIds();
    await Promise.all(
      previous
        .filter((file) => file && !used.has(file.id))
        .map((file) => removeLocalAudio(file!.id)),
    ).catch(() => undefined);
    emit('close');
  } else if (!props.open) {
    await discardDraftFiles().catch(() => undefined);
  }
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
        `Nhập ${data.tasks.length} công việc và ${data.history.length} phiên. Dữ liệu hiện tại sẽ bị thay thế; timer và âm thanh được đặt lại. File âm thanh cục bộ không có trong JSON, bạn cần chọn lại sau khi nhập. Lời nhắc chưa xử lý đã đến giờ sẽ được nhắc một lần sau khi nhập.`,
        'Nhập dữ liệu',
      )
    ) {
      await stopPreview();
      if (await app.command({ type: 'data.import', json, confirmed: true })) {
        draftVersion++;
        await discardDraftFiles().catch(() => undefined);
        Object.assign(draft, copySettings());
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
    await stopPreview();
    if (await app.command({ type: 'data.reset', confirmed: true })) {
      draftVersion++;
      await discardDraftFiles().catch(() => undefined);
      Object.assign(draft, copySettings());
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
          <label class="toggle-row"
            ><span>Chuông nhắc hạn công việc</span
            ><input v-model="draft.taskBellEnabled" type="checkbox"
          /></label>
          <label class="field"
            >Âm lượng chuông nhắc task · {{ Math.round(draft.taskBellVolume * 100) }}%<input
              v-model.number="draft.taskBellVolume"
              type="range"
              min="0"
              max="1"
              step="0.01"
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
          >
          <div class="audio-links">
            <p id="audio-links-help" class="muted small">
              Link trực tiếp MP3/WAV/OGG, không dùng link trang YouTube/Spotify. Để trống dùng âm
              mặc định hoặc chọn file từ máy để phát offline (tối đa 25 MB/file). Chọn file sẽ thay
              link của mode đó. Nghe thử 10 giây; bấm Lưu cài đặt để áp dụng.
            </p>
            <input
              ref="audioFileInput"
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm,.opus"
              hidden
              aria-label="Chọn file âm thanh từ máy"
              @change="selectFile"
            />
            <div v-for="sound in ambientOptions" :key="sound.id" class="audio-link">
              <div class="audio-link-row">
                <label class="field" :for="`audio-url-${sound.id}`"
                  >Link {{ sound.label }}
                  <input
                    :id="`audio-url-${sound.id}`"
                    v-model="draft.ambientUrls[sound.id]"
                    type="url"
                    :disabled="!!draft.ambientFiles[sound.id] || !!fileLoading"
                    maxlength="2048"
                    spellcheck="false"
                    autocomplete="off"
                    placeholder="https://…/audio.mp3"
                    :aria-invalid="!!linkErrors[sound.id]"
                    :aria-describedby="
                      linkErrors[sound.id] ? `audio-error-${sound.id}` : 'audio-links-help'
                    "
                    @input="linkErrors[sound.id] = ''"
                    @blur="validateLink(sound.id)"
                  />
                </label>
                <button
                  type="button"
                  class="button secondary audio-link-preview"
                  :disabled="previewLoading || !!fileLoading"
                  :aria-label="`${previewSound === sound.id ? 'Dừng thử' : 'Nghe thử'} ${sound.label}`"
                  @click="previewAmbient(sound.id)"
                >
                  <PixelIcon :name="previewSound === sound.id ? 'pause' : 'play'" :size="13" />{{
                    previewSound === sound.id
                      ? previewLoading
                        ? 'Đang tải…'
                        : 'Dừng thử'
                      : 'Nghe thử'
                  }}
                </button>
              </div>
              <div class="local-audio-row">
                <button
                  type="button"
                  class="button secondary local-audio-button"
                  :disabled="!!fileLoading"
                  :aria-label="`Chọn file ${sound.label}`"
                  @click="chooseFile(sound.id)"
                >
                  <PixelIcon name="upload" :size="13" />{{
                    fileLoading === sound.id
                      ? 'Đang lưu file…'
                      : draft.ambientFiles[sound.id]
                        ? 'Thay file'
                        : 'Chọn file từ máy'
                  }}
                </button>
                <span
                  v-if="draft.ambientFiles[sound.id]"
                  class="local-audio-name"
                  :title="draft.ambientFiles[sound.id]!.name"
                  >{{ draft.ambientFiles[sound.id]!.name }}
                  <small>· {{ formatFileSize(draft.ambientFiles[sound.id]!.size) }}</small></span
                >
                <button
                  v-if="draft.ambientFiles[sound.id]"
                  type="button"
                  class="small-icon"
                  :disabled="!!fileLoading"
                  :aria-label="`Xóa file ${sound.label}`"
                  @click="clearFile(sound.id)"
                >
                  <PixelIcon name="trash" :size="14" />
                </button>
              </div>
              <p
                v-if="linkErrors[sound.id]"
                :id="`audio-error-${sound.id}`"
                class="inline-error"
                role="alert"
              >
                {{ linkErrors[sound.id] }}
              </p>
            </div>
          </div>
          <label class="field"
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
            Dữ liệu nằm trên thiết bị này. Tạo bản sao lưu trước khi nhập hoặc đặt lại. JSON không
            kèm file âm thanh; sau khi nhập cần chọn lại file.
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
        ><button type="submit" class="button primary" :disabled="app.busy || !!fileLoading">
          Lưu cài đặt
        </button>
      </div>
    </form>
  </ModalShell>
</template>

<style scoped>
.audio-links {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.audio-link-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.audio-link-preview {
  flex-shrink: 0;
  min-width: 108px;
  padding-inline: 10px;
  font-size: 11px;
}
.audio-link .inline-error {
  margin-top: 7px;
}
.local-audio-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.local-audio-button {
  font-size: 10px;
  min-height: 33px;
  padding: 6px 9px;
}
.local-audio-name {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  overflow-wrap: anywhere;
  color: var(--success);
}
.local-audio-name small {
  color: var(--muted);
  white-space: nowrap;
}
.audio-link input[aria-invalid='true'] {
  border-color: var(--accent);
}
@media (max-width: 480px) {
  .audio-link-row {
    align-items: stretch;
    flex-direction: column;
  }
  .audio-link-preview {
    align-self: flex-end;
    min-height: 36px;
  }
}
</style>
