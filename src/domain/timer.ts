export type Status = "idle" | "running" | "paused";

export interface TimerState {
  id: string;
  status: Status;
  startedAt: number | null;
  runningSince: number | null;
  accumulatedMs: number;
  pausedAt: number | null;
}

export interface DailyFocus {
  date: string;
  accumulatedMs: number;
  trackingSince: number | null;
}

export interface FocusSessionRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface FocusHistoryDay {
  date: string;
  accumulatedMs: number;
  sessions: FocusSessionRecord[];
}

export type TimerAction =
  | { type: "start" | "pause" | "resume" | "reconcile"; now: number }
  | { type: "reset" };

export function idle(): TimerState {
  return {
    id: crypto.randomUUID(),
    status: "idle",
    startedAt: null,
    runningSince: null,
    accumulatedMs: 0,
    pausedAt: null,
  };
}

export function metrics(state: TimerState, now: number) {
  const active =
    state.status === "running" && state.runningSince !== null
      ? Math.max(0, now - state.runningSince)
      : 0;
  return { elapsed: Math.max(0, state.accumulatedMs + active) };
}

export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "start":
      return state.status === "idle"
        ? {
            id: crypto.randomUUID(),
            status: "running",
            startedAt: action.now,
            runningSince: action.now,
            accumulatedMs: 0,
            pausedAt: null,
          }
        : state;
    case "pause":
      return state.status === "running" && state.runningSince !== null
        ? {
            ...state,
            status: "paused",
            accumulatedMs:
              state.accumulatedMs + Math.max(0, action.now - state.runningSince),
            runningSince: null,
            pausedAt: action.now,
          }
        : state;
    case "resume":
      return state.status === "paused"
        ? {
            ...state,
            status: "running",
            runningSince: action.now,
            pausedAt: null,
          }
        : state;
    case "reset":
      return idle();
    case "reconcile":
      return state;
  }
}

export function localDayKey(now: number) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function startOfLocalDay(now: number) {
  const date = new Date(now);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function startOfNextLocalDay(now: number) {
  const date = new Date(now);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  ).getTime();
}

function addFocusInterval(
  history: FocusHistoryDay[],
  sessionId: string,
  from: number,
  to: number,
) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return history;
  }
  const next = history.map((day) => ({
    ...day,
    sessions: day.sessions.map((session) => ({ ...session })),
  }));
  let cursor = from;
  while (cursor < to) {
    const end = Math.min(to, startOfNextLocalDay(cursor));
    const durationMs = end - cursor;
    const date = localDayKey(cursor);
    let day = next.find((entry) => entry.date === date);
    if (!day) {
      day = { date, accumulatedMs: 0, sessions: [] };
      next.push(day);
    }
    day.accumulatedMs += durationMs;
    const session = day.sessions.find((entry) => entry.id === sessionId);
    if (session) {
      session.startedAt = Math.min(session.startedAt, cursor);
      session.endedAt = Math.max(session.endedAt, end);
      session.durationMs += durationMs;
    } else {
      day.sessions.push({
        id: sessionId,
        startedAt: cursor,
        endedAt: end,
        durationMs,
      });
    }
    cursor = end;
  }
  return next.sort((left, right) => left.date.localeCompare(right.date));
}

export function reconcileFocusHistory(
  daily: DailyFocus,
  history: FocusHistoryDay[],
  timer: TimerState,
  now: number,
) {
  let nextHistory = history;
  if (
    timer.status === "running" &&
    daily.trackingSince !== null &&
    now > daily.trackingSince
  ) {
    nextHistory = addFocusInterval(
      history,
      timer.id,
      daily.trackingSince,
      now,
    );
  }
  const date = localDayKey(now);
  const accumulatedMs =
    nextHistory.find((entry) => entry.date === date)?.accumulatedMs ?? 0;
  return {
    history: nextHistory,
    daily: {
      date,
      accumulatedMs,
      trackingSince: timer.status === "running" ? now : null,
    } satisfies DailyFocus,
  };
}

export function emptyDaily(now: number): DailyFocus {
  return { date: localDayKey(now), accumulatedMs: 0, trackingSince: null };
}

export function reconcileDaily(
  daily: DailyFocus,
  now: number,
  wasRunning: boolean,
): DailyFocus {
  const date = localDayKey(now);
  if (daily.date !== date) {
    const currentDayContribution =
      wasRunning && daily.trackingSince !== null
        ? Math.max(0, now - Math.max(startOfLocalDay(now), daily.trackingSince))
        : 0;
    return {
      date,
      accumulatedMs: currentDayContribution,
      trackingSince: wasRunning ? now : null,
    };
  }

  const contribution =
    wasRunning && daily.trackingSince !== null
      ? Math.max(0, now - daily.trackingSince)
      : 0;
  return {
    date,
    accumulatedMs: Math.max(0, daily.accumulatedMs + contribution),
    trackingSince: wasRunning ? now : null,
  };
}

export function todayElapsed(
  daily: DailyFocus,
  timer: TimerState,
  now: number,
) {
  const date = localDayKey(now);
  if (daily.date !== date) {
    if (timer.status !== "running") return 0;
    const since = daily.trackingSince ?? timer.runningSince ?? now;
    return Math.max(0, now - Math.max(startOfLocalDay(now), since));
  }
  const live =
    timer.status === "running" && daily.trackingSince !== null
      ? Math.max(0, now - daily.trackingSince)
      : 0;
  return Math.max(0, daily.accumulatedMs + live);
}

export function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, "0")}:${(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

export function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
