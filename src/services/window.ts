import {
  getCurrentWindow,
  getAllWindows,
  availableMonitors,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { native, flushStorage } from "./storage";
import type { ShareCardData } from "./share";
import type { Snapshot } from "../domain/settings";
type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  monitor: string | null;
};
export function safeBounds(
  b: Bounds,
  monitors: {
    position: { x: number; y: number };
    size: { width: number; height: number };
  }[],
) {
  return monitors.some(
    (m) =>
      b.x >= m.position.x &&
      b.y >= m.position.y &&
      b.x + 80 <= m.position.x + m.size.width &&
      b.y + 80 <= m.position.y + m.size.height,
  );
}
let mode = false;
let changing = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const normalSize = { width: 840, height: 570, minWidth: 700, minHeight: 475 };
const compactSize = { width: 680, height: 140, minWidth: 420, minHeight: 88 };
const maxStoredDimension = 16_384;

function dimensions(compact: boolean) {
  return compact ? compactSize : normalSize;
}

export function restoredWindowSize(
  bounds: Pick<Bounds, "width" | "height"> | null,
  target: ReturnType<typeof dimensions>,
) {
  if (
    !bounds ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return null;
  }
  return {
    width: Math.max(target.minWidth, Math.min(bounds.width, maxStoredDimension)),
    height: Math.max(target.minHeight, Math.min(bounds.height, maxStoredDimension)),
  };
}

function storageKey(compact: boolean) {
  return `sesh-window-${compact ? "compact" : "normal"}`;
}

async function captureBounds(
  window: ReturnType<typeof getCurrentWindow>,
  compact: boolean,
) {
  const [position, size, scale, monitors] = await Promise.all([
    window.outerPosition(),
    window.innerSize(),
    window.scaleFactor(),
    availableMonitors(),
  ]);
  localStorage.setItem(
    storageKey(compact),
    JSON.stringify({
      x: position.x,
      y: position.y,
      width: size.width / scale,
      height: size.height / scale,
      monitor:
        monitors.find(
          (monitor) =>
            position.x >= monitor.position.x &&
            position.x < monitor.position.x + monitor.size.width,
        )?.name ?? null,
    } satisfies Bounds),
  );
}

async function applyNativeMode(
  compact: boolean,
  size?: { width: number; height: number },
) {
  await invoke("set_window_mode", {
    compact,
    width: size?.width,
    height: size?.height,
  });
}

export async function initWindow(compact: boolean, top: boolean) {
  if (!native) return () => {};
  const w = getCurrentWindow();
  mode = compact;
  const target = dimensions(compact);
  // React has already hydrated the persisted snapshot by the time this effect
  // runs, so showing here cannot expose an incorrect timer frame.
  await w.show();
  try {
    await w.setAlwaysOnTop(top);
    const b = JSON.parse(
      localStorage.getItem(storageKey(compact)) ?? "null",
    ) as Bounds | null;
    const restored = restoredWindowSize(b, target);
    if (restored) {
      await applyNativeMode(compact, restored);
      if (b && safeBounds(b, await availableMonitors()))
        await w.setPosition(new PhysicalPosition(b.x, b.y));
      else await w.center();
    } else {
      await applyNativeMode(compact);
      await w.center();
    }
  } catch {
    try {
      await applyNativeMode(compact);
      await w.center();
    } catch {
      // The native setup hook has already shown a usable default window.
    }
  } finally {
    await w.show();
  }
  const save = () => {
    if (changing) return;
    const eventMode = mode;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (changing) return;
      try {
        await captureBounds(w, eventMode);
      } catch {
        /* A closing window cannot be queried. */
      }
    }, 250);
  };
  const offMove = await w.onMoved(save);
  const offResize = await w.onResized(save);
  return () => {
    offMove();
    offResize();
    clearTimeout(saveTimer);
  };
}
export async function setCompact(compact: boolean) {
  if (!native) return;
  const previousMode = mode;
  const w = getCurrentWindow();
  clearTimeout(saveTimer);
  // Persist the outgoing mode immediately. A quick mode switch used to cancel
  // the debounced resize save and lose the user's last compact bounds.
  try {
    await captureBounds(w, previousMode);
  } catch {
    // A transient bounds read must not prevent the user from switching modes.
  }
  changing = true;
  try {
    const target = dimensions(compact);
    let b: Bounds | null = null;
    try {
      b = JSON.parse(
        localStorage.getItem(storageKey(compact)) ?? "null",
      );
    } catch {}
    await applyNativeMode(compact, restoredWindowSize(b, target) ?? target);
    if (b && safeBounds(b, await availableMonitors())) {
      await w.setPosition(new PhysicalPosition(b.x, b.y));
    }
    mode = compact;
  } catch (error) {
    mode = previousMode;
    try {
      await applyNativeMode(previousMode);
    } catch {
      // Preserve the original resize error; a later launch reapplies constraints.
    }
    throw error;
  } finally {
    changing = false;
  }
}
export async function setTop(top: boolean) {
  if (native) await getCurrentWindow().setAlwaysOnTop(top);
}
export async function openConfigWindow(
  panel: "appearance" | "library" | "share" | "calendar",
  shareData?: ShareCardData,
  calendarSnapshot?: Snapshot,
) {
  if (!native) return false;
  const windows = await getAllWindows();
  const config = windows.find((candidate) => candidate.label === "config");
  if (!config) throw new Error("Configuration window is unavailable.");

  const panelSize = panel === "calendar"
    ? { width: 820, height: 650, minWidth: 680, minHeight: 560 }
    : { width: 600, height: 680, minWidth: 460, minHeight: 520 };
  await config.setMinSize(new LogicalSize(panelSize.minWidth, panelSize.minHeight));
  await config.setSize(new LogicalSize(panelSize.width, panelSize.height));
  {
    const main = getCurrentWindow();
    const [position, size, configSize, monitors] = await Promise.all([
      main.outerPosition(),
      main.outerSize(),
      config.outerSize(),
      availableMonitors(),
    ]);
    const monitor = monitors.find(
      (item) =>
        position.x >= item.position.x &&
        position.x < item.position.x + item.size.width &&
        position.y >= item.position.y &&
        position.y < item.position.y + item.size.height,
    );
    if (monitor) {
      const gap = 14;
      const monitorRight = monitor.position.x + monitor.size.width;
      const right = position.x + size.width + gap;
      const left = position.x - configSize.width - gap;
      const x =
        right + configSize.width <= monitorRight
          ? right
          : Math.max(left, monitor.position.x);
      const maxY = monitor.position.y + monitor.size.height - configSize.height;
      const y = Math.max(
        monitor.position.y,
        Math.min(position.y, Math.max(maxY, monitor.position.y)),
      );
      await config.setPosition(new PhysicalPosition(x, y));
    }
  }
  await config.show();
  if (panel === "share" && shareData) {
    await emitTo("config", "share-data", shareData);
  }
  if (panel === "calendar" && calendarSnapshot) {
    await emitTo("config", "calendar-data", calendarSnapshot);
  }
  await emitTo("config", "config-panel", panel);
  await config.setFocus();
  return true;
}
export async function resetPosition() {
  if (native) await getCurrentWindow().center();
}
export async function quit() {
  await flushStorage();
  if (native) await invoke("quit_app");
}
export async function drag() {
  if (native) await getCurrentWindow().startDragging();
}
