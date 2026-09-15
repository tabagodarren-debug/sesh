import { useCallback, useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  BackgroundRecord,
  SeshSettings,
  Snapshot,
} from "./domain/settings";
import {
  BackgroundLibrary,
  presets,
  presetUrl,
} from "./components/BackgroundLibrary";
import { Settings } from "./components/Settings";
import { ShareExport } from "./components/ShareExport";
import { SessionCalendar } from "./components/SessionCalendar";
import {
  imageUrl,
  library,
  native,
  saveShareExport,
} from "./services/storage";
import {
  renderShareImage,
  renderShareVideo,
  type ShareCardData,
} from "./services/share";

type ConfigPanel = "appearance" | "library" | "share" | "calendar";

export default function ConfigWindow({
  initial,
  initialPanel,
}: {
  initial: Snapshot;
  initialPanel: ConfigPanel;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const snapshotRef = useRef(initial);
  const [panel, setPanel] = useState<ConfigPanel>(initialPanel);
  const [windowRevision, setWindowRevision] = useState(0);
  const [records, setRecords] = useState<BackgroundRecord[]>([]);
  const [toast, setToast] = useState("");
  const [shareData, setShareData] = useState<ShareCardData | null>(null);

  const notify = useCallback((message: string) => setToast(message), []);
  const update = useCallback(
    (patch: Partial<SeshSettings>, debounce = true) => {
      const current = snapshotRef.current;
      const settings = { ...current.settings, ...patch };
      const next = { ...current, settings };
      snapshotRef.current = next;
      setSnapshot(next);
      if (native) {
        void emitTo("main", "sesh-settings-updated", {
          patch,
          debounce,
        }).catch(() => notify("Could not save this change."));
      }
    },
    [notify],
  );

  useEffect(() => {
    document.body.classList.add("config-window");
    void library()
      .then(setRecords)
      .catch(() => notify("Could not load your image library."));
    if (!native) return () => document.body.classList.remove("config-window");
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    let unlistenShare: (() => void) | undefined;
    let unlistenSnapshot: (() => void) | undefined;
    let unlistenCalendar: (() => void) | undefined;
    void listen<string>("config-panel", (event) => {
      setPanel(
        event.payload === "library"
          ? "library"
          : event.payload === "share"
            ? "share"
            : event.payload === "calendar"
              ? "calendar"
            : "appearance",
      );
      setWindowRevision((revision) => revision + 1);
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    const applySnapshot = (value: Snapshot) => {
      snapshotRef.current = value;
      setSnapshot(value);
    };
    void listen<Snapshot>("sesh-snapshot-updated", (event) => {
      applySnapshot(event.payload);
    }).then((dispose) => {
      if (disposed) dispose();
      else unlistenSnapshot = dispose;
    });
    void listen<Snapshot>("calendar-data", (event) => {
      applySnapshot(event.payload);
    }).then((dispose) => {
      if (disposed) dispose();
      else unlistenCalendar = dispose;
    });
    void listen<ShareCardData>("share-data", (event) => {
      setShareData(event.payload);
    }).then((dispose) => {
      if (disposed) dispose();
      else unlistenShare = dispose;
    });
    const configWindow = getCurrentWindow();
    void configWindow
      .onCloseRequested((event) => {
        event.preventDefault();
        void configWindow.hide();
      })
      .then((dispose) => {
        if (disposed) dispose();
        else unlistenClose = dispose;
      });
    return () => {
      disposed = true;
      document.body.classList.remove("config-window");
      unlisten?.();
      unlistenShare?.();
      unlistenClose?.();
      unlistenSnapshot?.();
      unlistenCalendar?.();
    };
  }, [notify]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const settings = snapshot.settings;
  const record = records.find((item) => item.id === settings.backgroundId);
  const background = record
    ? imageUrl(record)
    : presets.some((preset) => preset.id === settings.backgroundId)
      ? presetUrl(settings.backgroundId!)
      : null;
  const close = () => {
    if (native) void getCurrentWindow().hide();
  };

  const exportStill = async () => {
    if (!shareData) throw new Error("Session details are still loading.");
    const blob = await renderShareImage(shareData);
    const saved = await saveShareExport(blob, `sesh-${Date.now()}.png`, "png");
    if (saved) notify("Share card saved.");
  };

  const exportLoop = async () => {
    if (!shareData?.videoUrl) throw new Error("There is no video background to export.");
    const result = await renderShareVideo(shareData);
    const saved = await saveShareExport(
      result.blob,
      `sesh-${Date.now()}.${result.extension}`,
      result.extension,
    );
    if (saved) notify("Loop card saved.");
  };

  return (
    <main className="config-app" data-cursor={settings.cursorStyle}>
      {panel === "appearance" ? (
        <Settings
          key={`appearance-${windowRevision}`}
          settings={settings}
          update={update}
          onClose={close}
          background={background}
          onLibrary={() => setPanel("library")}
          standalone
        />
      ) : panel === "library" ? (
        <BackgroundLibrary
          key={`library-${windowRevision}`}
          settings={settings}
          update={update}
          records={records}
          onRecords={setRecords}
          onClose={close}
          notify={notify}
          standalone
        />
      ) : panel === "calendar" ? (
        <SessionCalendar
          key={`calendar-${windowRevision}`}
          snapshot={snapshot}
          onClose={close}
          notify={notify}
          standalone
        />
      ) : shareData ? (
        <ShareExport
          key={`share-${windowRevision}`}
          onClose={close}
          hasVideo={Boolean(shareData.videoUrl)}
          videoDuration={shareData.videoDuration}
          exportImage={exportStill}
          exportVideo={exportLoop}
          standalone
        />
      ) : (
        <div className="config-loading" role="status">Preparing your session…</div>
      )}
      {toast && (
        <button
          type="button"
          role="status"
          className="toast config-toast"
          onClick={() => setToast("")}
        >
          {toast}
        </button>
      )}
    </main>
  );
}
