import { useEffect, useMemo, useState } from "react";
import { ChevronsUpDown, ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { Snapshot } from "../domain/settings";
import {
  ACTIVE_DAY_MIN_MS,
  calendarStats,
  formatCalendarDuration,
  liveHistory,
  monthCalendar,
} from "../domain/calendar";
import { localDayKey } from "../domain/timer";
import { renderCalendarImage } from "../services/calendarExport";
import { saveShareExport } from "../services/storage";
import { Dialog } from "./Dialog";

const weekdays = ["M", "T", "W", "T", "F", "S", "S"];

function compactTotal(ms: number) {
  return formatCalendarDuration(ms).replaceAll(" ", "");
}

function sessionTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SessionCalendar({
  snapshot,
  onClose,
  notify,
  standalone = false,
}: {
  snapshot: Snapshot;
  onClose: () => void;
  notify: (message: string) => void;
  standalone?: boolean;
}) {
  const initialNow = Date.now();
  const [now, setNow] = useState(initialNow);
  const [displayedMonth, setDisplayedMonth] = useState(
    () => new Date(new Date(initialNow).getFullYear(), new Date(initialNow).getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(localDayKey(initialNow));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (snapshot.timer.status !== "running") return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [snapshot.timer.status]);

  const history = useMemo(
    () => liveHistory(snapshot.daily, snapshot.history, snapshot.timer, now),
    [now, snapshot.daily, snapshot.history, snapshot.timer],
  );
  const { days, mondayOffset } = useMemo(
    () => monthCalendar(history, displayedMonth),
    [displayedMonth, history],
  );
  const stats = useMemo(
    () => calendarStats(history, displayedMonth, now),
    [displayedMonth, history, now],
  );
  const selected = days.find((day) => day.date === selectedDate) ?? days[0];
  const bestMs = Math.max(...days.map((day) => day.accumulatedMs));
  const recordedMs = selected.sessions.reduce(
    (sum, session) => sum + session.durationMs,
    0,
  );
  const importedMs = Math.max(0, selected.accumulatedMs - recordedMs);

  const changeMonth = (offset: number) => {
    const next = new Date(
      displayedMonth.getFullYear(),
      displayedMonth.getMonth() + offset,
      1,
    );
    setDisplayedMonth(next);
    setSelectedDate(localDayKey(new Date(next.getFullYear(), next.getMonth(), 1, 12).getTime()));
    setDetailsOpen(false);
  };

  const exportCalendar = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await renderCalendarImage(history, displayedMonth, now);
      const key = `${displayedMonth.getFullYear()}-${String(displayedMonth.getMonth() + 1).padStart(2, "0")}`;
      const saved = await saveShareExport(blob, `sesh-calendar-${key}.png`, "png");
      if (saved) notify("Calendar image saved.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not export the calendar.");
    } finally {
      setExporting(false);
    }
  };

  const moveSelection = (date: string, offset: number) => {
    const index = days.findIndex((day) => day.date === date);
    const target = days[Math.max(0, Math.min(days.length - 1, index + offset))];
    if (!target) return;
    setSelectedDate(target.date);
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-calendar-date="${target.date}"]`)?.focus(),
    );
  };

  const monthLabel = displayedMonth.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  const headerActions = (
    <div className="calendar-head-controls">
      <div className="calendar-month-switcher">
        <button onClick={() => changeMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={15} />
        </button>
        <strong>{monthLabel}</strong>
        <button onClick={() => changeMonth(1)} aria-label="Next month">
          <ChevronRight size={15} />
        </button>
      </div>
      <span className="calendar-unit"><ChevronsUpDown size={13} /> HOURS</span>
      <button
        className="calendar-export-icon"
        onClick={() => void exportCalendar()}
        disabled={exporting}
        aria-label={exporting ? "Exporting calendar" : "Export calendar as PNG"}
        title="Export PNG"
      >
        <Download size={15} />
      </button>
      <span className="calendar-head-divider" aria-hidden="true" />
    </div>
  );

  return (
    <Dialog
      title="Session Calendar"
      onClose={onClose}
      wide
      standalone={standalone}
      variant="calendar"
      headerActions={headerActions}
    >
      <section className="calendar-shell" aria-label="Daily focus history">
        <div className="calendar-summary">
          <strong>+{compactTotal(stats.totalMs)}</strong>
          <span>{stats.activeDays} / {compactTotal(stats.totalMs)}</span>
        </div>

        <div className="calendar-weekdays" aria-hidden="true">
          {weekdays.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
        </div>
        <div className="calendar-grid" role="grid" aria-label={`${monthLabel} focus calendar`}>
          {Array.from({ length: mondayOffset }, (_, index) => (
            <span className="calendar-empty" key={`empty-${index}`} aria-hidden="true" />
          ))}
          {days.map((day) => {
            const isSelected = day.date === selected.date;
            const isBest = bestMs >= ACTIVE_DAY_MIN_MS && day.accumulatedMs === bestMs;
            return (
              <button
                key={day.date}
                type="button"
                role="gridcell"
                data-calendar-date={day.date}
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                aria-label={`${new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" })}, ${formatCalendarDuration(day.accumulatedMs)}${isBest ? ", highest focus time this month" : ""}`}
                className={`calendar-day intensity-${day.intensity}${isBest ? " best" : ""}`}
                onClick={() => {
                  setSelectedDate(day.date);
                  setDetailsOpen(day.accumulatedMs >= ACTIVE_DAY_MIN_MS && (!isSelected || !detailsOpen));
                }}
                onKeyDown={(event) => {
                  const offset = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -7 : event.key === "ArrowDown" ? 7 : 0;
                  if (offset) {
                    event.preventDefault();
                    moveSelection(day.date, offset);
                  }
                }}
              >
                <span className="calendar-day-number">{day.day}</span>
                {day.accumulatedMs >= ACTIVE_DAY_MIN_MS ? (
                  <strong>{formatCalendarDuration(day.accumulatedMs, true)}</strong>
                ) : null}
              </button>
            );
          })}
        </div>

        {detailsOpen && selected.accumulatedMs >= ACTIVE_DAY_MIN_MS ? (
          <section className="calendar-day-popover" aria-live="polite">
            <div className="calendar-popover-title">
              <span>{new Date(`${selected.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
              <strong>+{compactTotal(selected.accumulatedMs)}</strong>
              <button onClick={() => setDetailsOpen(false)} aria-label="Close day details"><X size={13} /></button>
            </div>
            <div className="calendar-popover-sessions">
              {selected.sessions.map((session, index) => (
                <span key={session.id}>
                  Session {index + 1} · {sessionTime(session.startedAt)}–{sessionTime(session.endedAt)} · {formatCalendarDuration(session.durationMs)}
                </span>
              ))}
              {importedMs > 0 ? <span>Preserved total · {formatCalendarDuration(importedMs)}</span> : null}
            </div>
          </section>
        ) : null}

        <footer className="calendar-footer">
          <div className="calendar-stats">
            <span>Current Focus Streak: <strong>{stats.currentStreak} days</strong></span>
            <span>Best Focus Streak in {monthLabel.split(" ")[0]}: <strong>{stats.bestMonthStreak} days</strong></span>
            <span>Best Focus Streak (All Time): <strong>{stats.bestAllTimeStreak} days</strong></span>
            <span>Active Days: <strong>{stats.allTimeActiveDays} total</strong></span>
          </div>
          <div className="calendar-footer-brand" aria-label="SESH">
            <img src="/sesh-logo.png" alt="" />
            <strong>SESH</strong>
          </div>
        </footer>
      </section>
    </Dialog>
  );
}

