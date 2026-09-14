import {
  calendarStats,
  formatCalendarDuration,
  monthCalendar,
} from "../domain/calendar";
import type { FocusHistoryDay } from "../domain/timer";

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export async function renderCalendarImage(
  history: FocusHistoryDay[],
  displayedMonth: Date,
  now = Date.now(),
) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1180;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Calendar export is unavailable.");
  const { days, mondayOffset } = monthCalendar(history, displayedMonth);
  const stats = calendarStats(history, displayedMonth, now);
  const best = Math.max(...days.map((day) => day.accumulatedMs));
  const weekday = ["M", "T", "W", "T", "F", "S", "S"];
  const fills = ["#090a0b", "#071713", "#082019", "#09281f", "#0a3025"];
  const pad = 74;

  context.fillStyle = "#090a0b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#131518";
  roundedRect(context, 32, 32, 1536, 1116, 18);
  context.fill();
  context.strokeStyle = "rgba(255,255,255,.12)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "#f5f5f7";
  context.font = "700 28px Geist Variable, Geist, sans-serif";
  context.fillText("SESSION CALENDAR", pad, 92);
  context.textAlign = "center";
  context.font = "650 27px Geist Variable, Geist, sans-serif";
  context.fillText(
    displayedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    800,
    92,
  );
  context.textAlign = "right";
  context.fillStyle = "#a7aab2";
  context.font = "650 22px Geist Variable, Geist, sans-serif";
  context.fillText("HOURS", 1526, 92);

  context.textAlign = "left";
  context.fillStyle = "#31d8ab";
  context.font = "700 36px Geist Variable, Geist, sans-serif";
  context.fillText(formatCalendarDuration(stats.totalMs), pad, 152);
  context.fillStyle = "#31d8ab";
  context.fillRect(pad, 174, 1452, 2);
  context.font = "600 20px Geist Variable, Geist, sans-serif";
  context.fillText(
    `${stats.activeDays} ACTIVE / ${formatCalendarDuration(stats.totalMs)}`,
    pad,
    214,
  );
  context.textAlign = "right";
  context.fillStyle = "#c0c2c8";
  context.fillText(
    `${stats.goalDays} GOAL DAYS / ${formatCalendarDuration(stats.averageMs)} AVG`,
    1526,
    214,
  );

  const gridX = pad;
  const gridY = 284;
  const gap = 8;
  const cellWidth = (1452 - gap * 6) / 7;
  const cellHeight = 112;
  context.textAlign = "center";
  context.fillStyle = "#858993";
  context.font = "600 18px Geist Variable, Geist, sans-serif";
  weekday.forEach((label, index) =>
    context.fillText(label, gridX + index * (cellWidth + gap) + cellWidth / 2, 258),
  );

  days.forEach((day) => {
    const slot = mondayOffset + day.day - 1;
    const column = slot % 7;
    const row = Math.floor(slot / 7);
    const x = gridX + column * (cellWidth + gap);
    const y = gridY + row * (cellHeight + gap);
    const isBest = best > 0 && day.accumulatedMs === best;
    context.fillStyle = isBest ? "#372f1d" : fills[day.intensity];
    roundedRect(context, x, y, cellWidth, cellHeight, 8);
    context.fill();
    if (isBest) {
      context.strokeStyle = "#554827";
      context.lineWidth = 2;
      context.stroke();
    }
    context.textAlign = "left";
    context.fillStyle = isBest ? "#aa9150" : day.intensity ? "#249371" : "#30333a";
    context.font = "600 17px Geist Variable, Geist, sans-serif";
    context.fillText(String(day.day), x + 12, y + 24);
    if (day.accumulatedMs >= 60_000) {
      context.textAlign = "center";
      context.fillStyle = isBest ? "#e6c96e" : "#31d8ab";
      context.font = "700 25px Geist Variable, Geist, sans-serif";
      context.fillText(
        formatCalendarDuration(day.accumulatedMs, true),
        x + cellWidth / 2,
        y + 70,
      );
    }
  });

  const metrics = [
    ["CURRENT STREAK", `${stats.currentStreak} days`],
    ["BEST THIS MONTH", `${stats.bestMonthStreak} days`],
    ["BEST ALL TIME", `${stats.bestAllTimeStreak} days`],
    ["ACTIVE DAYS", `${stats.allTimeActiveDays} total`],
  ];
  const footerY = 1048;
  const pillWidth = 337;
  metrics.forEach(([label, value], index) => {
    const x = pad + index * (pillWidth + 34);
    context.fillStyle = "#191b1f";
    roundedRect(context, x, footerY, pillWidth, 54, 27);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,.09)";
    context.stroke();
    context.textAlign = "center";
    context.fillStyle = "#858993";
    context.font = "600 14px Geist Variable, Geist, sans-serif";
    context.fillText(label, x + pillWidth / 2, footerY + 21);
    context.fillStyle = "#f5f5f7";
    context.font = "700 17px Geist Variable, Geist, sans-serif";
    context.fillText(value, x + pillWidth / 2, footerY + 42);
  });

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not create calendar image."))),
      "image/png",
    );
  });
}
