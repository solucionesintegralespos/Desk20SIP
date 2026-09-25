export interface ReminderTask { id: string; title: string; date: string; start: string; scheduledAt: string; clientName: string | null }
// `until: null` means already shown; a number is a snooze deadline.
export type ReminderMarks = Record<string, { until: number | null; at: number }>;
const KEEP_MS = 3 * 24 * 60 * 60 * 1000;

// Rescheduling a task produces a new key, so it is reminded again at its new time.
export const reminderKey = (task: ReminderTask) => `${task.id}@${task.date}T${task.start}`;

// Tasks whose time has arrived and were neither shown nor are snoozed; marks them as shown.
export function takeDueReminders(tasks: ReminderTask[], marks: ReminderMarks, now = Date.now()) {
  const next: ReminderMarks = {};
  for (const [key, mark] of Object.entries(marks)) if (now - mark.at <= KEEP_MS) next[key] = mark;
  const due: Array<{ task: ReminderTask; key: string }> = [];
  for (const task of tasks) {
    if (Date.parse(task.scheduledAt) > now) continue;
    const key = reminderKey(task), mark = next[key];
    if (mark && (mark.until === null || mark.until > now)) continue;
    next[key] = { until: null, at: now };
    due.push({ task, key });
  }
  return { due, marks: next };
}

export const snoozeReminder = (marks: ReminderMarks, key: string, ms: number, now = Date.now()): ReminderMarks => ({ ...marks, [key]: { until: now + ms, at: now } });
