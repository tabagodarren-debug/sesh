import { z } from "zod";
import {
  emptyDaily,
  idle,
  localDayKey,
  startOfLocalDay,
  type DailyFocus,
  type FocusHistoryDay,
  type TimerState,
} from "./timer";

export const positions = [
  "left top",
  "center top",
  "right top",
  "left center",
  "center center",
  "right center",
  "left bottom",
  "center bottom",
  "right bottom",
] as const;

export const wallpaperEngineKinds = [
  "image",
  "video",
  "scene",
  "web",
  "application",
  "unknown",
] as const;

export const wallpaperEngineProjectSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(240),
  kind: z.enum(wallpaperEngineKinds),
  previewPath: z.string().min(1).max(4096),
  contentPath: z.string().min(1).max(4096),
  projectPath: z.string().min(1).max(4096),
});

export type WallpaperEngineProject = z.infer<
  typeof wallpaperEngineProjectSchema
>;

export const settingsSchema = z.object({
  alwaysOnTop: z.boolean().catch(true),
  compactMode: z.boolean().catch(false),
  backgroundId: z.string().nullable().catch(null),
  blur: z.number().min(0).max(20).catch(0),
  opacity: z.number().min(0).max(1).catch(1),
  overlay: z.number().min(0).max(1).catch(0.4),
  fit: z.enum(["cover", "contain"]).catch("cover"),
  position: z.enum(positions).catch("center center"),
  textOpacity: z.number().min(0.6).max(1).catch(1),
  textScale: z.number().min(0.8).max(1.2).catch(1),
  cursorStyle: z.enum(["system", "sesh"]).catch("sesh"),
  apiKey: z.string().max(128).catch(""),
  username: z.string().trim().min(1).max(24).catch("Editable text"),
  profileImagePath: z.string().nullable().catch(null),
  wallpaperEngineProject: wallpaperEngineProjectSchema.nullable().catch(null),
});

export type SeshSettings = z.infer<typeof settingsSchema>;
export const defaults = (): SeshSettings => settingsSchema.parse({});

const timerSchema = z.object({
  id: z.string(),
  status: z.enum(["idle", "running", "paused"]),
  startedAt: z.number().finite().nonnegative().nullable(),
  runningSince: z.number().finite().nonnegative().nullable(),
  accumulatedMs: z.number().finite().nonnegative(),
  pausedAt: z.number().finite().nonnegative().nullable(),
});

const dailySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accumulatedMs: z.number().finite().nonnegative(),
  trackingSince: z.number().finite().nonnegative().nullable(),
});

const focusSessionSchema = z.object({
  id: z.string().min(1),
  startedAt: z.number().finite().nonnegative(),
  endedAt: z.number().finite().nonnegative(),
  durationMs: z.number().finite().nonnegative(),
});

const historyDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accumulatedMs: z.number().finite().nonnegative(),
  sessions: z.array(focusSessionSchema).max(10_000),
});

export interface Snapshot {
  version: 4;
  settings: SeshSettings;
  timer: TimerState;
  daily: DailyFocus;
  history: FocusHistoryDay[];
}

function migrateTimer(raw: unknown): TimerState {
  const parsed = timerSchema.safeParse(raw);
  if (parsed.success) {
    const timer = parsed.data;
    const valid =
      (timer.status === "idle" &&
        timer.startedAt === null &&
        timer.runningSince === null) ||
      (timer.status === "running" &&
        timer.startedAt !== null &&
        timer.runningSince !== null &&
        timer.runningSince >= timer.startedAt) ||
      (timer.status === "paused" &&
        timer.startedAt !== null &&
        timer.runningSince === null);
    return valid ? timer : idle();
  }

  const legacy =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (
    legacy &&
    typeof legacy.id === "string" &&
    typeof legacy.startedAt === "number" &&
    legacy.startedAt >= 0
  ) {
    if (legacy.status === "running" && legacy.stoppedAt === null) {
      return {
        id: legacy.id,
        status: "running",
        startedAt: legacy.startedAt,
        runningSince: legacy.startedAt,
        accumulatedMs: 0,
        pausedAt: null,
      };
    }
    if (
      legacy.status === "stopped" &&
      typeof legacy.stoppedAt === "number" &&
      legacy.stoppedAt >= legacy.startedAt
    ) {
      return {
        id: legacy.id,
        status: "paused",
        startedAt: legacy.startedAt,
        runningSince: null,
        accumulatedMs: legacy.stoppedAt - legacy.startedAt,
        pausedAt: legacy.stoppedAt,
      };
    }
  }
  return idle();
}

export function restore(raw: unknown, now = Date.now()): Snapshot {
  const data =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawSettings =
    data.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  const settings = settingsSchema.parse(rawSettings);
  const timer = migrateTimer(data.timer);
  const parsedDaily = dailySchema.safeParse(data.daily);
  let daily = parsedDaily.success ? parsedDaily.data : emptyDaily(now);
  const parsedHistory = z.array(historyDaySchema).max(20_000).safeParse(data.history);
  let history: FocusHistoryDay[] = parsedHistory.success
    ? parsedHistory.data
    : daily.accumulatedMs > 0
      ? [{ date: daily.date, accumulatedMs: daily.accumulatedMs, sessions: [] }]
      : [];

  if (
    daily.accumulatedMs > 0 &&
    !history.some((entry) => entry.date === daily.date)
  ) {
    history = [
      ...history,
      { date: daily.date, accumulatedMs: daily.accumulatedMs, sessions: [] },
    ].sort((left, right) => left.date.localeCompare(right.date));
  }

  if (!parsedDaily.success && timer.status === "running") {
    daily = {
      date: localDayKey(now),
      accumulatedMs: 0,
      trackingSince: Math.max(
        startOfLocalDay(now),
        Math.min(now, timer.runningSince ?? now),
      ),
    };
  }
  if (timer.status !== "running" && daily.trackingSince !== null) {
    daily = { ...daily, trackingSince: null };
  }
  if (timer.status === "running" && daily.trackingSince === null) {
    daily = {
      ...daily,
      trackingSince: Math.min(now, timer.runningSince ?? now),
    };
  }

  return { version: 4, settings, timer, daily, history };
}

export interface BackgroundRecord {
  id: string;
  name: string;
  source: "local" | "wallhaven";
  kind?: "image" | "video";
  path: string;
  lastUsed: number;
  size: number;
}

export function evictionCandidates(
  records: BackgroundRecord[],
  active: string | null,
  limit = 40,
) {
  return records
    .filter((r) => r.source === "wallhaven" && r.id !== active)
    .sort((a, b) => a.lastUsed - b.lastUsed)
    .slice(
      0,
      Math.max(
        0,
        records.filter((r) => r.source === "wallhaven").length - limit,
      ),
    );
}
