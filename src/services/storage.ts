import { invoke, isTauri, convertFileSrc } from "@tauri-apps/api/core";
import {
  restore,
  type Snapshot,
  type BackgroundRecord,
  type WallpaperEngineProject,
} from "../domain/settings";
export const native = isTauri();
let queue: Promise<unknown> = Promise.resolve();
let pending: Snapshot | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let waiters: {resolve:()=>void;reject:(e:unknown)=>void}[] = [];
export async function readSnapshot() {
  const now = Date.now();
  try {
    return restore(
      native
        ? await invoke("read_snapshot")
        : JSON.parse(localStorage.getItem("sesh-v1") ?? "null"),
      now,
    );
  } catch {
    return restore(null, now);
  }
}
function enqueueSnapshot(value: Snapshot): Promise<void> {
  const run = async () => {
    if (native) await invoke("save_snapshot", { value });
    else localStorage.setItem("sesh-v1", JSON.stringify(value));
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
function flushPending(){
  clearTimeout(debounceTimer);
  if(!pending)return;
  const value=pending,list=waiters;pending=null;waiters=[];
  void enqueueSnapshot(value).then(()=>list.forEach(w=>w.resolve()),e=>list.forEach(w=>w.reject(e)));
}
export function saveSnapshot(value:Snapshot,debounce=false):Promise<void>{
  if(!debounce){flushPending();return enqueueSnapshot(value);}
  pending=value;clearTimeout(debounceTimer);debounceTimer=setTimeout(flushPending,180);
  return new Promise((resolve,reject)=>waiters.push({resolve,reject}));
}
export const flushStorage = () => {flushPending();return queue;};
export function imageUrl(record: BackgroundRecord) {
  return native ? convertFileSrc(record.path) : record.path;
}
export function localAssetUrl(path: string) {
  return native ? convertFileSrc(path) : path;
}
export async function library(): Promise<BackgroundRecord[]> {
  return native
    ? invoke("list_backgrounds")
    : JSON.parse(localStorage.getItem("sesh-images") ?? "[]");
}
export async function importImage(): Promise<BackgroundRecord | null> {
  if (native) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      filters: [
        {
          name: "Images and video loops",
          extensions: ["png", "jpg", "jpeg", "webp", "mp4", "webm"],
        },
      ],
    });
    return path ? invoke("import_image", { path }) : null;
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,video/mp4,video/webm";
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      const f = input.files?.[0];
      const isVideo = f?.type.startsWith("video/") ?? false;
      if (!f || f.size > (isVideo ? 200 : 20) * 1024 * 1024) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const record: BackgroundRecord = {
          id: crypto.randomUUID(),
          name: f.name,
          source: "local",
          kind: isVideo ? "video" : "image",
          path: String(reader.result),
          lastUsed: Date.now(),
          size: f.size,
        };
        try {
          localStorage.setItem(
            "sesh-images",
            JSON.stringify([...(await library()), record]),
          );
          resolve(record);
        } catch {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(f);
    };
    input.click();
  });
}

export async function saveShareExport(
  blob: Blob,
  suggestedName: string,
  extension: "png" | "webm" | "mp4",
): Promise<boolean> {
  if (native) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: suggestedName,
      filters: [
        {
          name: extension === "png" ? "PNG image" : "Video",
          extensions: [extension],
        },
      ],
    });
    if (!path) return false;
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    await invoke("save_share_export", { path, bytes });
    return true;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return true;
}
export async function importProfileImage(): Promise<string | null> {
  if (native) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    return path ? invoke<string>("import_profile_image", { path }) : null;
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file || file.size > 20 * 1024 * 1024) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
export async function deleteImage(id: string, active: string | null) {
  if (native) await invoke("delete_background", { id, active });
  else
    localStorage.setItem(
      "sesh-images",
      JSON.stringify((await library()).filter((r) => r.id !== id)),
    );
}
export async function touchImage(id: string) {
  if (native) await invoke("touch_background", { id });
}
export interface Wallpaper {
  id: string;
  path: string;
  resolution: string;
  thumbs: { small: string };
  purity: string;
}
export interface SearchOptions {
  query: string;
  category: string;
  sorting: string;
  resolution: string;
  page: number;
  apiKey: string;
}
export async function searchWallpapers(
  options: SearchOptions,
): Promise<{
  data: Wallpaper[];
  meta: { current_page: number; last_page: number };
}> {
  if (!native) throw new Error("Open the desktop app to browse Wallhaven.");
  return invoke("search_wallpapers", { options });
}
export async function downloadWallpaper(
  wallpaper: Wallpaper,
  active: string | null,
): Promise<BackgroundRecord> {
  return invoke("download_wallpaper", {
    id: wallpaper.id,
    url: wallpaper.path,
    active,
  });
}

export interface WallpaperEngineLibrary {
  projects: WallpaperEngineProject[];
}

export async function wallpaperEngineLibrary(): Promise<WallpaperEngineLibrary | null> {
  if (!native) return null;
  return invoke("wallpaper_engine_library");
}

export async function prepareWallpaperEngineProject(
  project: WallpaperEngineProject,
): Promise<void> {
  if (native) await invoke("prepare_wallpaper_engine_project", { project });
}
