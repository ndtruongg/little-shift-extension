import { localDay, type State } from './model';
export function statistics(state: State, now = Date.now()) {
  const today = localDay(now);
  const focus = state.history.filter((h) => h.mode === 'focus' && h.result === 'completed');
  const completed = focus.filter((h) => localDay(h.endedAt) === today);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - 6 + index);
    const key = localDay(date.getTime());
    return {
      day: key,
      label: new Intl.DateTimeFormat('vi', { weekday: 'short' }).format(date),
      count: focus.filter((h) => localDay(h.endedAt) === key).length,
    };
  });
  return {
    count: completed.length,
    minutes: Math.round(completed.reduce((sum, h) => sum + h.durationMs, 0) / 60000),
    tasks: state.tasks.filter((t) => t.doneAt !== null && localDay(t.doneAt) === today).length,
    days,
  };
}
