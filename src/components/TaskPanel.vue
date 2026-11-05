<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { localDay, type Task } from '../domain/model';
import {
  formatDue,
  fromLocalInput,
  toLocalInput,
  isOverdue,
  isDueSoon,
  reminderTime,
} from '../domain/reminders';
import { useAppStore } from '../stores/app';
import { confirmAction } from '../stores/confirm';
import PixelIcon from './PixelIcon.vue';
import ModalShell from './ModalShell.vue';
const app = useAppStore();
const filter = ref('today');
const sort = ref('manual');
const focusedTask = ref('');
async function revealTask() {
  const params = new URLSearchParams(location.hash.slice(1));
  const id = params.get('task');
  if (!app.ready || !id || !app.state.tasks.some((task) => task.id === id)) return;
  await focusTask(id);
}
async function focusTask(id: string, block: ScrollLogicalPosition = 'nearest') {
  if (!app.state.tasks.some((task) => task.id === id)) return;
  filter.value = 'all';
  focusedTask.value = id;
  await nextTick();
  const card = document.getElementById(`task-${id}`);
  card?.scrollIntoView({ block });
  card?.focus({ preventScroll: true });
}
defineExpose({ focusTask });
watch(() => app.ready, revealTask);
onMounted(() => {
  void revealTask();
  window.addEventListener('hashchange', revealTask);
});
onUnmounted(() => {
  window.removeEventListener('hashchange', revealTask);
});
const editing = ref(false);
const titleInput = ref<HTMLInputElement>();
const draft = reactive({
  id: '',
  title: '',
  day: localDay(),
  priority: 'medium' as Task['priority'],
  estimated: 1,
  dueInput: '',
  reminderOffsetMinutes: null as Task['reminderOffsetMinutes'],
});
const formNow = ref(Date.now());
const pastChoice = ref<'' | 'now' | 'skip'>('');
const formError = ref('');
watch([() => draft.dueInput, () => draft.reminderOffsetMinutes], ([dueInput]) => {
  if (!dueInput) draft.reminderOffsetMinutes = null;
  pastChoice.value = '';
});
const originalTask = computed(() => app.state.tasks.find((task) => task.id === draft.id));
function draftDueAt() {
  const previous = originalTask.value;
  return previous && draft.dueInput === toLocalInput(previous.dueAt)
    ? previous.dueAt
    : fromLocalInput(draft.dueInput);
}
const needsPastChoice = computed(() => {
  try {
    const dueAt = draftDueAt();
    const old = originalTask.value;
    const at = reminderTime({ dueAt, reminderOffsetMinutes: draft.reminderOffsetMinutes });
    return (
      old?.doneAt == null &&
      at !== null &&
      at <= formNow.value &&
      (!old || old.dueAt !== dueAt || old.reminderOffsetMinutes !== draft.reminderOffsetMinutes)
    );
  } catch {
    return false;
  }
});
const today = computed(() => localDay(app.taskNow));
const todayTasks = computed(() => app.state.tasks.filter((t) => t.day === today.value));
const doneCount = computed(() => todayTasks.value.filter((t) => t.doneAt !== null).length);
const overdue = computed(() =>
  app.state.tasks.filter((t) => t.day < today.value && t.doneAt === null),
);
const visible = computed(() => {
  const tasks = app.state.tasks.filter((task) => {
    switch (filter.value) {
      case 'all':
        return true;
      case 'done':
        return task.doneAt !== null;
      case 'soon':
        return isDueSoon(task, app.taskNow);
      case 'overdue':
        return isOverdue(task, app.taskNow);
      default:
        return task.day === today.value;
    }
  });
  return sort.value === 'due'
    ? tasks.sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))
    : tasks;
});
const priorityLabel = { low: 'Nhẹ nhàng', medium: 'Vừa sức', high: 'Ưu tiên cao' };
async function edit(task?: Task) {
  Object.assign(
    draft,
    task
      ? {
          id: task.id,
          title: task.title,
          day: task.day,
          priority: task.priority,
          estimated: task.estimated,
          dueInput: toLocalInput(task.dueAt),
          reminderOffsetMinutes: task.reminderOffsetMinutes,
        }
      : {
          id: crypto.randomUUID(),
          title: '',
          day: today.value,
          priority: 'medium',
          estimated: 1,
          dueInput: '',
          reminderOffsetMinutes: null,
        },
  );
  formNow.value = Date.now();
  pastChoice.value = '';
  formError.value = '';
  editing.value = true;
  await nextTick();
  titleInput.value?.focus();
}
async function save() {
  formNow.value = Date.now();
  formError.value = '';
  try {
    const dueAt = draftDueAt();
    if (needsPastChoice.value && !pastChoice.value) {
      formError.value = 'Chọn nhắc ngay hoặc bỏ lời nhắc đã qua trước khi lưu.';
      return;
    }
    const { dueInput: _dueInput, ...task } = draft;
    if (
      await app.command({
        type: 'task.save',
        task: { ...task, dueAt, title: draft.title.trim() },
        pastReminder: pastChoice.value || undefined,
      })
    )
      editing.value = false;
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Ngày giờ không hợp lệ.';
  }
}
async function remove(task: Task) {
  if (
    await confirmAction(
      'Xóa công việc?',
      `“${task.title}” sẽ được xóa. Lịch sử tập trung vẫn được giữ.`,
      'Xóa công việc',
    )
  )
    await app.command({ type: 'task.delete', id: task.id });
}
</script>
<template>
  <section class="task-panel pixel-panel" aria-labelledby="task-heading">
    <div class="panel-heading">
      <PixelIcon name="tasks" class="peach" :size="28" />
      <h2 id="task-heading">Việc hôm nay</h2>
      <span class="panel-count">{{ todayTasks.length }}</span>
    </div>
    <p class="task-progress-copy">{{ doneCount }} / {{ todayTasks.length }} công việc hoàn thành</p>
    <div
      class="progress-track"
      role="progressbar"
      aria-label="Tiến độ công việc hôm nay"
      :aria-valuenow="doneCount"
      :aria-valuemax="Math.max(todayTasks.length, 1)"
      aria-valuemin="0"
    >
      <span
        :style="{ width: `${todayTasks.length ? (doneCount / todayTasks.length) * 100 : 0}%` }"
      />
    </div>
    <div class="filter-tabs" aria-label="Lọc công việc">
      <button
        v-for="[value, label] in [
          ['today', 'Hôm nay'],
          ['all', 'Tất cả'],
          ['done', 'Đã xong'],
          ['soon', 'Sắp đến hạn'],
          ['overdue', 'Quá hạn'],
        ]"
        :key="value"
        :class="{ selected: filter === value }"
        :aria-pressed="filter === value"
        @click="filter = value!"
      >
        {{ label }}
      </button>
    </div>
    <label class="task-sort"
      >Sắp xếp
      <select v-model="sort">
        <option value="manual">Thứ tự của bạn</option>
        <option value="due">Hạn gần nhất</option>
      </select>
    </label>
    <div class="task-scroll">
      <div v-if="filter === 'today' && overdue.length" class="overdue-section">
        <h3>
          Còn từ hôm trước <span>{{ overdue.length }}</span>
        </h3>
        <div v-for="task in overdue" :key="task.id" class="overdue-task">
          <span>{{ task.title }}</span
          ><button
            class="text-button"
            :aria-label="`Chuyển ${task.title} sang hôm nay`"
            @click="app.command({ type: 'task.today', id: task.id })"
          >
            Hôm nay <PixelIcon name="arrow" :size="12" />
          </button>
        </div>
      </div>
      <div v-if="!visible.length" class="task-empty">
        <PixelIcon name="star" :size="44" />
        <h3>{{ filter === 'done' ? 'Từng việc, từng chút một' : 'Một khởi đầu nhẹ nhàng' }}</h3>
        <p>
          {{
            filter === 'done'
              ? 'Công việc hoàn thành sẽ xuất hiện ở đây.'
              : 'Thêm một việc nhỏ để bắt đầu ngày của bạn.'
          }}
        </p>
      </div>
      <ol v-else class="task-list">
        <li
          v-for="task in visible"
          :id="`task-${task.id}`"
          :key="task.id"
          tabindex="-1"
          :class="[
            'task-card',
            {
              active: app.state.activeTaskId === task.id,
              done: task.doneAt !== null,
              'reminder-target': focusedTask === task.id,
            },
          ]"
        >
          <div class="task-main">
            <button
              :class="['task-check', { checked: task.doneAt !== null }]"
              :aria-label="`${task.doneAt !== null ? 'Mở lại' : 'Hoàn thành'} ${task.title}`"
              :aria-pressed="task.doneAt !== null"
              @click="app.command({ type: 'task.toggle', id: task.id })"
            >
              <PixelIcon v-if="task.doneAt !== null" name="check" :size="15" /></button
            ><button
              class="task-title"
              :title="task.title"
              :aria-label="`Tập trung vào ${task.title}`"
              :aria-pressed="app.state.activeTaskId === task.id"
              @click="app.command({ type: 'task.select', id: task.id })"
            >
              {{ task.title }}</button
            ><span class="task-tomatoes" :title="`${task.completed} / ${task.estimated} phiên`"
              ><PixelIcon
                v-for="n in Math.min(task.estimated, 3)"
                :key="n"
                name="tomato"
                :size="15"
                :class="{ filled: task.completed >= n }"
              /><small v-if="task.estimated > 3">+{{ task.estimated - 3 }}</small></span
            >
          </div>
          <p
            v-if="task.dueAt !== null"
            :class="['task-due', { 'danger-text': isOverdue(task, app.taskNow) }]"
          >
            <PixelIcon :name="isOverdue(task, app.taskNow) ? 'flag' : 'calendar'" :size="13" />
            <span
              >{{ isOverdue(task, app.taskNow) ? 'Quá hạn · ' : 'Hạn · '
              }}{{ formatDue(task.dueAt, app.taskNow) }}</span
            >
            <PixelIcon
              v-if="task.reminderOffsetMinutes !== null && task.doneAt === null"
              name="bell"
              :size="12"
            />
          </p>
          <div class="task-meta">
            <span :class="['priority-tag', task.priority]">{{
              task.doneAt !== null ? 'Đã xong' : priorityLabel[task.priority]
            }}</span
            ><span class="session-counter">{{ task.completed }}/{{ task.estimated }} phiên</span
            ><span v-if="filter === 'all'" class="task-date">{{
              task.day.slice(5).split('-').reverse().join('/')
            }}</span>
          </div>
          <div class="task-actions">
            <button class="small-icon" :aria-label="`Sửa ${task.title}`" @click="edit(task)">
              <PixelIcon name="edit" :size="13" /></button
            ><button
              class="small-icon"
              :disabled="sort === 'due' || app.state.tasks[0]?.id === task.id"
              :aria-label="`Đưa ${task.title} lên`"
              @click="app.command({ type: 'task.move', id: task.id, direction: 'up' })"
            >
              <PixelIcon name="up" :size="13" /></button
            ><button
              class="small-icon"
              :disabled="sort === 'due' || app.state.tasks.at(-1)?.id === task.id"
              :aria-label="`Đưa ${task.title} xuống`"
              @click="app.command({ type: 'task.move', id: task.id, direction: 'down' })"
            >
              <PixelIcon name="down" :size="13" /></button
            ><button
              class="small-icon danger-text"
              :aria-label="`Xóa ${task.title}`"
              @click="remove(task)"
            >
              <PixelIcon name="trash" :size="13" />
            </button>
          </div>
        </li>
      </ol>
    </div>
    <button class="add-task button secondary" @click="edit()">
      <PixelIcon name="plus" :size="18" />Thêm công việc<span class="key-hint">↵</span>
    </button>
    <p class="panel-footnote">Mỗi việc nhỏ đều có ý nghĩa.</p>
  </section>
  <ModalShell
    :open="editing"
    :title="originalTask ? 'Sửa công việc' : 'Một việc nhỏ mới'"
    @close="editing = false"
  >
    <form class="form-grid" @submit.prevent="save">
      <p v-if="formError" class="inline-error" role="alert">{{ formError }}</p>
      <p v-if="app.error" class="inline-error" role="alert">
        {{ app.error }}
        <button type="button" class="text-button" @click="app.error = ''">Đóng lỗi</button>
      </p>
      <label class="field"
        >Tên công việc<input
          ref="titleInput"
          v-model="draft.title"
          required
          maxlength="160"
          placeholder="Bạn muốn tập trung vào điều gì?"
      /></label>
      <div class="field-row">
        <label class="field"
          >Ưu tiên<select v-model="draft.priority">
            <option value="low">Thấp · Nhẹ nhàng</option>
            <option value="medium">Vừa · Vừa sức</option>
            <option value="high">Cao · Làm trước</option>
          </select></label
        ><label class="field"
          >Số phiên dự kiến<input
            v-model.number="draft.estimated"
            type="number"
            min="1"
            max="24"
            required
        /></label>
      </div>
      <label class="field">Ngày thực hiện<input v-model="draft.day" type="date" required /></label>
      <div class="field-row due-fields">
        <label class="field"
          >Hạn hoàn thành<input v-model="draft.dueInput" type="datetime-local"
        /></label>
        <label class="field"
          >Nhắc trước<select v-model="draft.reminderOffsetMinutes" :disabled="!draft.dueInput">
            <option :value="null">Không nhắc</option>
            <option :value="0">Đúng hạn</option>
            <option :value="5">5 phút</option>
            <option :value="15">15 phút</option>
            <option :value="30">30 phút</option>
            <option :value="60">1 giờ</option>
            <option :value="1440">1 ngày</option>
          </select></label
        >
      </div>
      <button v-if="draft.dueInput" type="button" class="text-button" @click="draft.dueInput = ''">
        Xóa hạn hoàn thành
      </button>
      <p class="muted small">
        Hạn là tùy chọn, theo giờ địa phương. Chuyển ngày thực hiện không đổi hạn.
      </p>
      <fieldset v-if="needsPastChoice" class="past-reminder">
        <legend>Thời điểm nhắc đã qua</legend>
        <p>Lưu công việc sẽ dùng lựa chọn bên dưới; hạn hoàn thành giữ nguyên.</p>
        <label
          ><input v-model="pastChoice" name="past-reminder" type="radio" value="now" required />
          Nhắc ngay sau khi lưu</label
        >
        <label
          ><input v-model="pastChoice" name="past-reminder" type="radio" value="skip" required /> Bỏ
          lời nhắc này</label
        >
      </fieldset>
      <p v-if="draft.reminderOffsetMinutes !== null" class="muted small">
        Máy ngủ hoặc Chrome thoát hoàn toàn có thể làm thông báo trễ.
        {{
          app.isExtension
            ? 'Lời nhắc bị lỡ được xử lý một lần khi Chrome hoạt động lại.'
            : 'Bản xem trước chỉ nhắc khi trang còn hoạt động; không tin cậy tương đương extension.'
        }}
      </p>
      <p class="muted small">Hết một phiên sẽ cộng tiến độ, bạn tự đánh dấu việc đã xong.</p>
      <div class="dialog-actions">
        <button type="button" class="button secondary" @click="editing = false">Hủy</button
        ><button type="submit" class="button primary" :disabled="app.busy || !draft.title.trim()">
          Lưu công việc
        </button>
      </div>
    </form>
  </ModalShell>
</template>
<style scoped>
.filter-tabs {
  flex-wrap: wrap;
}
.task-sort {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
  margin: 0 0 12px;
}
.task-sort select {
  flex: 1;
  min-width: 0;
  padding: 6px;
  font-size: 11px;
}
.task-due {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0 31px;
  font-size: 11px;
  color: var(--muted);
}
.task-due.danger-text {
  color: var(--accent);
}
.reminder-target {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
.past-reminder {
  border: 1px solid var(--primary);
  padding: 12px;
  font-size: 12px;
}
.past-reminder label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.past-reminder input {
  width: auto;
}
input[type='datetime-local'] {
  min-width: 0;
}
@media (max-width: 520px) {
  .due-fields {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
