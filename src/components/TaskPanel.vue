<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import { localDay, type Task } from '../domain/model';
import { useAppStore } from '../stores/app';
import { confirmAction } from '../stores/confirm';
import PixelIcon from './PixelIcon.vue';
import ModalShell from './ModalShell.vue';
const app = useAppStore();
const filter = ref('today');
const editing = ref(false);
const titleInput = ref<HTMLInputElement>();
const draft = reactive({
  id: '',
  title: '',
  day: localDay(),
  priority: 'medium' as Task['priority'],
  estimated: 1,
});
const today = computed(() => localDay(app.now));
const todayTasks = computed(() => app.state.tasks.filter((t) => t.day === today.value));
const doneCount = computed(() => todayTasks.value.filter((t) => t.doneAt !== null).length);
const overdue = computed(() =>
  app.state.tasks.filter((t) => t.day < today.value && t.doneAt === null),
);
const visible = computed(() =>
  app.state.tasks.filter(
    (t) =>
      filter.value === 'all' ||
      (filter.value === 'done' ? t.doneAt !== null : t.day === today.value),
  ),
);
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
        }
      : { id: crypto.randomUUID(), title: '', day: today.value, priority: 'medium', estimated: 1 },
  );
  editing.value = true;
  await nextTick();
  titleInput.value?.focus();
}
async function save() {
  if (await app.command({ type: 'task.save', task: { ...draft, title: draft.title.trim() } }))
    editing.value = false;
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
        ]"
        :key="value"
        :class="{ selected: filter === value }"
        :aria-pressed="filter === value"
        @click="filter = value!"
      >
        {{ label }}
      </button>
    </div>
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
          :key="task.id"
          :class="[
            'task-card',
            { active: app.state.activeTaskId === task.id, done: task.doneAt !== null },
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
              :disabled="app.state.tasks[0]?.id === task.id"
              :aria-label="`Đưa ${task.title} lên`"
              @click="app.command({ type: 'task.move', id: task.id, direction: 'up' })"
            >
              <PixelIcon name="up" :size="13" /></button
            ><button
              class="small-icon"
              :disabled="app.state.tasks.at(-1)?.id === task.id"
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
    :title="app.state.tasks.some((t) => t.id === draft.id) ? 'Sửa công việc' : 'Một việc nhỏ mới'"
    @close="editing = false"
  >
    <form class="form-grid" @submit.prevent="save">
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
