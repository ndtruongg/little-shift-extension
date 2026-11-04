import { initialState, localDay, type State } from '../domain/model';
export function previewDemo(): State {
  const state = initialState();
  const now = Date.now();
  const titles = [
    'Hoàn thiện giao diện extension',
    'Review pull request',
    'Lên kế hoạch cho ngày mai',
    'Cập nhật README',
    'Sửa lỗi đồng hồ',
  ];
  state.tasks = titles.map((title, i) => ({
    id: crypto.randomUUID(),
    title,
    day: localDay(now),
    priority: i === 0 ? 'high' : i === 2 ? 'low' : 'medium',
    estimated: [3, 2, 1, 2, 3][i]!,
    completed: i > 2 ? 1 : 0,
    doneAt: i > 2 ? now - i * 3600000 : null,
    createdAt: now - 30000000 + i,
  }));
  state.activeTaskId = state.tasks[0]!.id;
  [2, 3, 1, 4, 2, 3, 3].forEach((count, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - 6 + index);
    date.setHours(0, 0, 0, 0);
    for (let i = 0; i < count; i++) {
      const startedAt = date.getTime() + i * 1800000;
      state.history.push({
        id: crypto.randomUUID(),
        mode: 'focus',
        taskId: null,
        taskTitle: 'Phiên xem thử',
        startedAt,
        endedAt: startedAt + 1500000,
        durationMs: 1500000,
        result: 'completed',
      });
    }
  });
  state.focusCount = state.history.length;
  return state;
}
