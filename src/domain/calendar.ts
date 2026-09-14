import {
  localDayKey,
  reconcileFocusHistory,
  type DailyFocus,
  type FocusHistoryDay,
  type TimerState,
} from "./timer";

export const DAILY_BENCHMARK_MS = 60 * 60 * 1000;
export const ACTIVE_DAY_MIN_MS = 60 * 1000;

export interface CalendarDayView extends FocusHistoryDay {
  day: number;
  intensity: 0 | 1 | 2 | 3 | 4;
  reachedBenchmark: boolean;
}

export function liveHistory(
  daily: DailyFocus,
  history: FocusHistoryDay[],
  timer: TimerState,
  now: number,
) {
  return reconcileFocusHistory(daily, history, timer, now).history;
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthCalendar(
  history: FocusHistoryDay[],
  displayedMonth: Date,
) {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const byDate = new Map(history.map((entry) => [entry.date, entry]));
  const days: CalendarDayView[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = localDayKey(new Date(year, month, day, 12).getTime());
    const record = byDate.get(date) ?? {
      date,
      accumulatedMs: 0,
      sessions: [],
    };
    const ratio = record.accumulatedMs / DAILY_BENCHMARK_MS;
    const intensity: CalendarDayView["intensity"] =
      record.accumulatedMs < ACTIVE_DAY_MIN_MS
        ? 0
        : ratio < 0.25
          ? 1
          : ratio < 0.5
            ? 2
            : ratio < 1
              ? 3
              : 4;
    days.push({
      ...record,
      day,
      intensity,
      reachedBenchmark: record.accumulatedMs >= DAILY_BENCHMARK_MS,
    });
  }
  return { days, mondayOffset };
}

function consecutiveRun(keys: Set<string>, end: Date) {
  let count = 0;
  const cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12);
  while (keys.has(localDayKey(cursor.getTime()))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function bestRun(entries: FocusHistoryDay[], benchmark = DAILY_BENCHMARK_MS) {
  const keys = new Set(
    entries
      .filter((entry) => entry.accumulatedMs >= benchmark)
      .map((entry) => entry.date),
  );
  let best = 0;
  for (const key of keys) {
    const date = new Date(`${key}T12:00:00`);
    const previous = new Date(date);
    previous.setDate(previous.getDate() - 1);
    if (!keys.has(localDayKey(previous.getTime()))) {
      let cursor = new Date(date);
      let run = 0;
      while (keys.has(localDayKey(cursor.getTime()))) {
        run += 1;
        cursor.setDate(cursor.getDate() + 1);
      }
      best = Math.max(best, run);
    }
  }
  return best;
}

export function calendarStats(
  history: FocusHistoryDay[],
  displayedMonth: Date,
  now: number,
) {
  const prefix = monthKey(displayedMonth);
  const month = history.filter((entry) => entry.date.startsWith(prefix));
  const active = month.filter((entry) => entry.accumulatedMs >= ACTIVE_DAY_MIN_MS);
  const goal = month.filter((entry) => entry.accumulatedMs >= DAILY_BENCHMARK_MS);
  const totalMs = month.reduce((sum, entry) => sum + entry.accumulatedMs, 0);
  const goalKeys = new Set(
    history
      .filter((entry) => entry.accumulatedMs >= DAILY_BENCHMARK_MS)
      .map((entry) => entry.date),
  );
  const today = new Date(now);
  const streakEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  if (!goalKeys.has(localDayKey(streakEnd.getTime()))) {
    streakEnd.setDate(streakEnd.getDate() - 1);
  }
  return {
    totalMs,
    averageMs: active.length ? totalMs / active.length : 0,
    activeDays: active.length,
    goalDays: goal.length,
    allTimeActiveDays: history.filter(
      (entry) => entry.accumulatedMs >= ACTIVE_DAY_MIN_MS,
    ).length,
    currentStreak: consecutiveRun(goalKeys, streakEnd),
    bestMonthStreak: bestRun(month),
    bestAllTimeStreak: bestRun(history),
  };
}

export function formatCalendarDuration(ms: number, compact = false) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (compact) return hours > 0 ? `+${hours}:${String(remainder).padStart(2, "0")}` : `+${remainder}m`;
  return hours > 0 ? `${hours}H ${String(remainder).padStart(2, "0")}M` : `${remainder}M`;
}

