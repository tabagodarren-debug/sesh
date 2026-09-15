import { describe, expect, it } from "vitest";
import {
  emptyDaily,
  formatElapsed,
  metrics,
  reconcileDaily,
  reconcileFocusHistory,
  timerReducer,
  todayElapsed,
  idle,
  localDayKey,
} from "../src/domain/timer";
import { defaults, evictionCandidates, restore } from "../src/domain/settings";
import { calendarStats, monthCalendar } from "../src/domain/calendar";

describe("session stopwatch", () => {
  it("calculates elapsed time from absolute timestamps despite missed ticks", () => {
    const running = timerReducer(idle(), { type: "start", now: 1_000 });
    expect(metrics(running, 121_000).elapsed).toBe(120_000);
  });

  it("pauses exactly and resumes without counting paused time", () => {
    const running = timerReducer(idle(), { type: "start", now: 1_000 });
    const paused = timerReducer(running, { type: "pause", now: 31_000 });
    expect(paused.status).toBe("paused");
    expect(metrics(paused, 999_999).elapsed).toBe(30_000);
    const resumed = timerReducer(paused, { type: "resume", now: 61_000 });
    expect(metrics(resumed, 71_000).elapsed).toBe(40_000);
    expect(resumed.startedAt).toBe(1_000);
  });

  it("ignores invalid transitions and resets cleanly", () => {
    const initial = idle();
    expect(timerReducer(initial, { type: "pause", now: 1_000 })).toBe(initial);
    expect(timerReducer(initial, { type: "resume", now: 1_000 })).toBe(initial);
    const reset = timerReducer(initial, { type: "reset" });
    expect(reset.status).toBe("idle");
    expect(reset.id).not.toBe(initial.id);
  });

  it("formats elapsed time with an unbounded hour field", () => {
    expect(formatElapsed(999)).toBe("0:00:00");
    expect(formatElapsed(90 * 60_000)).toBe("1:30:00");
    expect(formatElapsed(12 * 3_600_000 + 17 * 60_000 + 48_000)).toBe(
      "12:17:48",
    );
    expect(formatElapsed(-10)).toBe("0:00:00");
  });

  it("accumulates only running time in today's ledger", () => {
    const at = new Date(2026, 8, 14, 8, 0).getTime();
    const running = timerReducer(idle(), { type: "start", now: at });
    let daily = emptyDaily(at);
    daily = { ...daily, trackingSince: at };
    expect(todayElapsed(daily, running, at + 30_000)).toBe(30_000);
    daily = reconcileDaily(daily, at + 30_000, true);
    const paused = timerReducer(running, { type: "pause", now: at + 30_000 });
    daily = { ...daily, trackingSince: null };
    expect(todayElapsed(daily, paused, at + 90_000)).toBe(30_000);
  });

  it("starts a new daily total at local midnight during a running session", () => {
    const before = new Date(2026, 8, 14, 23, 59, 50).getTime();
    const after = new Date(2026, 8, 15, 0, 0, 10).getTime();
    const running = timerReducer(idle(), { type: "start", now: before });
    const daily = {
      date: localDayKey(before),
      accumulatedMs: 20_000,
      trackingSince: before,
    };
    expect(todayElapsed(daily, running, after)).toBe(10_000);
    expect(reconcileDaily(daily, after, true)).toMatchObject({
      date: localDayKey(after),
      accumulatedMs: 10_000,
      trackingSince: after,
    });
  });

  it("archives running time across midnight and keeps one logical session", () => {
    const before = new Date(2026, 8, 14, 23, 59, 50).getTime();
    const after = new Date(2026, 8, 15, 0, 0, 10).getTime();
    const timer = timerReducer(idle(), { type: "start", now: before });
    const result = reconcileFocusHistory(
      { date: localDayKey(before), accumulatedMs: 0, trackingSince: before },
      [],
      timer,
      after,
    );
    expect(result.history).toHaveLength(2);
    expect(result.history.map((day) => day.accumulatedMs)).toEqual([10_000, 10_000]);
    expect(result.history[0].sessions[0].id).toBe(timer.id);
    expect(result.history[1].sessions[0].id).toBe(timer.id);
    expect(result.daily).toMatchObject({
      date: localDayKey(after),
      accumulatedMs: 10_000,
      trackingSince: after,
    });
  });

  it("builds benchmark intensity and streak statistics from daily history", () => {
    const history = [1, 2, 3].map((day) => ({
      date: `2026-09-0${day}`,
      accumulatedMs: day === 1 ? 30 * 60_000 : 60 * 60_000,
      sessions: [],
    }));
    const calendar = monthCalendar(history, new Date(2026, 8, 1));
    expect(calendar.days[0].intensity).toBe(3);
    expect(calendar.days[1].intensity).toBe(4);
    const stats = calendarStats(
      history,
      new Date(2026, 8, 1),
      new Date(2026, 8, 3, 12).getTime(),
    );
    expect(stats.activeDays).toBe(3);
    expect(stats.goalDays).toBe(2);
    expect(stats.currentStreak).toBe(2);
    expect(stats.bestMonthStreak).toBe(2);
  });

  it("restores the new model and migrates legacy stopped sessions to paused", () => {
    const running = timerReducer(idle(), { type: "start", now: 1_000 });
    expect(
      metrics(
        restore(
          {
            settings: defaults(),
            timer: running,
            daily: { date: localDayKey(1_000), accumulatedMs: 0, trackingSince: 1_000 },
          },
          61_000,
        ).timer,
        61_000,
      ).elapsed,
    ).toBe(60_000);
    expect(
      restore(
        {
          daily: {
            date: "2026-09-14",
            accumulatedMs: 42_000,
            trackingSince: null,
          },
        },
        new Date(2026, 8, 14, 12).getTime(),
      ).history[0],
    ).toMatchObject({ date: "2026-09-14", accumulatedMs: 42_000 });
    const migrated = restore(
      {
        timer: {
          id: "legacy",
          status: "stopped",
          startedAt: 1_000,
          stoppedAt: 3_000,
        },
      },
      4_000,
    ).timer;
    expect(migrated.status).toBe("paused");
    expect(metrics(migrated, 99_999).elapsed).toBe(2_000);
  });

  it("recovers defaults and rejects malformed timer state", () => {
    expect(restore(null).timer.status).toBe("idle");
    expect(restore(null).settings.username).toBe("Editable text");
    expect(restore(null).settings.cursorStyle).toBe("bibata");
    expect(
      restore({ settings: { cursorStyle: "sesh" } }).settings.cursorStyle,
    ).toBe("bibata");
    expect(
      restore({ timer: { ...idle(), status: "running" } }).timer.status,
    ).toBe("idle");
    expect(
      restore({ settings: { username: "x".repeat(30), blur: 100 } }).settings
        .blur,
    ).toBe(0);
  });

  it("preserves valid Wallpaper Engine selections and rejects unsafe shapes", () => {
    const project = {
      id: "workshop:123",
      title: "Live background",
      kind: "video" as const,
      previewPath: "C:\\Steam\\preview.jpg",
      contentPath: "C:\\Steam\\wallpaper.mp4",
      projectPath: "C:\\Steam\\project.json",
    };
    expect(
      restore({
        settings: {
          backgroundId: `wallpaper-engine:${project.id}`,
          wallpaperEngineProject: project,
        },
      }).settings.wallpaperEngineProject,
    ).toEqual(project);
    expect(
      restore({
        settings: {
          wallpaperEngineProject: { ...project, kind: "executable" },
        },
      }).settings.wallpaperEngineProject,
    ).toBeNull();
  });

  it("selects only old unprotected remote files for eviction", () => {
    const records = Array.from({ length: 43 }, (_, i) => ({
      id: String(i),
      name: "image",
      source: "wallhaven" as const,
      path: "",
      lastUsed: i,
      size: 1,
    }));
    expect(evictionCandidates(records, "0").map((record) => record.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });
});
