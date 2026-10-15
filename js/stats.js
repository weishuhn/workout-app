// Simple consistency stats over the workout log, in the device's local time.

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfLocalWeek(now) {
  const d = startOfLocalDay(now);
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

export function workoutsThisWeek(log, now = new Date()) {
  const start = startOfLocalWeek(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return log.filter((entry) => {
    const t = new Date(entry.startedAt);
    return t >= start && t < end;
  }).length;
}

export function currentStreak(log, now = new Date()) {
  const days = new Set(log.map((entry) => dayKey(new Date(entry.startedAt))));
  const cursor = startOfLocalDay(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
