import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import {
  Check,
  CalendarDays,
  Image,
  Maximize2,
  Minimize2,
  MoreVertical,
  Move,
  Palette,
  Pause,
  Pin,
  Play,
  RotateCcw,
  Share2,
  X,
} from "lucide-react";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import {
  type BackgroundRecord,
  type SeshSettings,
  type Snapshot,
} from "./domain/settings";
import {
  formatElapsed,
  metrics,
  reconcileFocusHistory,
  timerReducer,
  todayElapsed,
  type TimerAction,
} from "./domain/timer";
import {
  imageUrl,
  importProfileImage,
  library,
  localAssetUrl,
  native,
  prepareWallpaperEngineProject,
  saveSnapshot,
  saveShareExport,
  touchImage,
} from "./services/storage";
import {
  drag,
  initWindow,
  openConfigWindow,
  quit,
  resetPosition,
  setCompact,
  setTop,
} from "./services/window";
import { Settings } from "./components/Settings";
import { ShareExport } from "./components/ShareExport";
import { SessionCalendar } from "./components/SessionCalendar";
import { renderShareImage, renderShareVideo } from "./services/share";
import {
  BackgroundLibrary,
  presets,
  presetUrl,
} from "./components/BackgroundLibrary";

type Panel = "appearance" | "library" | "share" | "calendar" | null;

const [globeWidth, globeHeight, , , globePath] = faGlobe.icon;
function AxiomGlobe({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${globeWidth} ${globeHeight}`}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={Array.isArray(globePath) ? globePath.join(" ") : globePath} />
    </svg>
  );
}

export default function App({ initial }: { initial: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const stateRef = useRef(initial);
  const [now, setNow] = useState(Date.now());
  const [panel, setPanel] = useState<Panel>(null);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [records, setRecords] = useState<BackgroundRecord[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initial.settings.username);
  const [profileBusy, setProfileBusy] = useState(false);
  const [modeTransition, setModeTransition] = useState<
    "contracting" | "expanding" | null
  >(null);
  const [engineReady, setEngineReady] = useState(
    !initial.settings.wallpaperEngineProject,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const activeVideo = useRef<HTMLVideoElement>(null);

  const s = snapshot.settings;
  const t = snapshot.timer;
  const timerMetrics = metrics(t, now);
  const focusPercentage = Math.floor(
    (timerMetrics.elapsed / (60 * 60 * 1000)) * 100,
  );
  const today = todayElapsed(snapshot.daily, t, now);
  const record = records.find((item) => item.id === s.backgroundId);
  const engineProject =
    s.wallpaperEngineProject &&
    s.backgroundId === `wallpaper-engine:${s.wallpaperEngineProject.id}`
      ? s.wallpaperEngineProject
      : null;
  const localVideoBackground = record?.kind === "video" ? imageUrl(record) : null;
  const background = record && record.kind !== "video"
    ? imageUrl(record)
    : presets.some((preset) => preset.id === s.backgroundId)
      ? presetUrl(s.backgroundId!)
      : null;
  const engineBackground =
    engineProject && engineReady
      ? localAssetUrl(
          engineProject.kind === "image" || engineProject.kind === "video"
            ? engineProject.contentPath
            : engineProject.previewPath,
        )
      : null;
  const hasBackground = Boolean(background || engineBackground || localVideoBackground);
  const profileImage = s.profileImagePath
    ? localAssetUrl(s.profileImagePath)
    : null;

  const notify = useCallback((message: string) => setToast(message), []);
  const commit = useCallback(
    (next: Snapshot, debounce = false) => {
      stateRef.current = next;
      setSnapshot(next);
      if (native) void emitTo("config", "sesh-snapshot-updated", next).catch(() => {});
      void saveSnapshot(next, debounce).catch(() =>
        notify("Could not save changes. They may not survive a restart."),
      );
    },
    [notify],
  );

  const act = useCallback(
    (action: TimerAction) => {
      const current = stateRef.current;
      const actionNow = "now" in action ? action.now : Date.now();
      const reconciled = reconcileFocusHistory(
        current.daily,
        current.history,
        current.timer,
        actionNow,
      );
      let daily = reconciled.daily;
      const timer = timerReducer(current.timer, action);
      if (
        timer.status === "running" &&
        current.timer.status !== "running"
      ) {
        daily = { ...daily, trackingSince: actionNow };
      } else if (timer.status !== "running") {
        daily = { ...daily, trackingSince: null };
      }
      commit({ ...current, timer, daily, history: reconciled.history });
      setNow(actionNow);
    },
    [commit],
  );

  const update = useCallback(
    (patch: Partial<SeshSettings>, debounce = true) => {
      const current = stateRef.current;
      const settings = { ...current.settings, ...patch };
      commit({ ...current, settings }, debounce);
      if (patch.alwaysOnTop !== undefined) {
        void setTop(patch.alwaysOnTop).catch(() =>
          notify("Could not change always-on-top."),
        );
      }
      if (
        patch.backgroundId &&
        !patch.backgroundId.startsWith("wallpaper-engine:")
      ) {
        void touchImage(patch.backgroundId).catch(() => {});
      }
    },
    [commit, notify],
  );

  const toggleCompact = useCallback(async () => {
    const next = !stateRef.current.settings.compactMode;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    try {
      setModeTransition(next ? "contracting" : "expanding");
      if (!reducedMotion) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      await setCompact(next);
      update({ compactMode: next });
      setMenu(false);
    } catch {
      notify("Could not resize the window.");
    } finally {
      setTimeout(() => setModeTransition(null), reducedMotion ? 0 : 240);
    }
  }, [notify, update]);

  useEffect(() => {
    let active = true;
    if (!engineProject) {
      setEngineReady(true);
      return () => {
        active = false;
      };
    }
    setEngineReady(false);
    void prepareWallpaperEngineProject(engineProject)
      .then(() => {
        if (active) setEngineReady(true);
      })
      .catch(() => {
        if (active) {
          setEngineReady(false);
          notify("This Wallpaper Engine background is no longer available.");
        }
      });
    return () => {
      active = false;
    };
  }, [engineProject, notify]);

  const toggleTimer = useCallback(() => {
    const timer = stateRef.current.timer;
    const actionNow = Date.now();
    if (timer.status === "idle") act({ type: "start", now: actionNow });
    else if (timer.status === "running")
      act({ type: "pause", now: actionNow });
    else act({ type: "resume", now: actionNow });
  }, [act]);

  const resetTimer = useCallback(() => {
    act({ type: "reset" });
  }, [act]);

  const reconcileLifecycle = useCallback(() => {
    const time = Date.now();
    const current = stateRef.current;
    const reconciled = reconcileFocusHistory(
      current.daily,
      current.history,
      current.timer,
      time,
    );
    const daily = reconciled.daily;
    if (
      daily.date !== current.daily.date ||
      daily.accumulatedMs !== current.daily.accumulatedMs ||
      daily.trackingSince !== current.daily.trackingSince ||
      reconciled.history !== current.history
    ) {
      commit({ ...current, daily, history: reconciled.history });
    }
    setNow(time);
  }, [commit]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void initWindow(initial.settings.compactMode, initial.settings.alwaysOnTop)
      .then((fn) => {
        if (disposed) fn();
        else cleanup = fn;
      })
      .catch(() => notify("Could not restore the window."));
    void library()
      .then(setRecords)
      .catch(() => notify("Could not load your image library."));
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [initial.settings.alwaysOnTop, initial.settings.compactMode, notify]);

  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<{ patch: Partial<SeshSettings>; debounce: boolean }>(
      "sesh-settings-updated",
      (event) => {
        const current = stateRef.current;
        const settings = { ...current.settings, ...event.payload.patch };
        const next = { ...current, settings };
        commit(next, event.payload.debounce);
        if (event.payload.patch.alwaysOnTop !== undefined) {
          void setTop(event.payload.patch.alwaysOnTop).catch(() => {});
        }
        void library().then(setRecords).catch(() => {});
      },
    ).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [commit]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    reconcileLifecycle();
    const interval =
      t.status === "running"
        ? setInterval(() => setNow(Date.now()), 250)
        : undefined;
    window.addEventListener("focus", reconcileLifecycle);
    document.addEventListener("visibilitychange", reconcileLifecycle);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", reconcileLifecycle);
      document.removeEventListener("visibilitychange", reconcileLifecycle);
    };
  }, [reconcileLifecycle, t.status]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        panel ||
        menu ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        (event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,select,button,[contenteditable]"))
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        toggleTimer();
      } else if (event.key.toLowerCase() === "c") {
        void toggleCompact();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [menu, panel, toggleCompact, toggleTimer]);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector("button")?.focus();
    const close = (event: PointerEvent) => {
      if (
        !menuRef.current?.contains(event.target as Node) &&
        !menuButton.current?.contains(event.target as Node)
      ) {
        setMenu(false);
      }
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  useEffect(() => {
    if (editingName) {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
  }, [editingName]);

  const openPanel = async (nextPanel: Exclude<Panel, null>) => {
    setMenu(false);
    if (stateRef.current.settings.compactMode) await toggleCompact();
    try {
      if (!(await openConfigWindow(nextPanel))) setPanel(nextPanel);
    } catch {
      notify("Could not open the configuration window.");
    }
  };

  const finishName = (save: boolean) => {
    if (save) {
      const next = nameDraft.trim();
      if (next) update({ username: next.slice(0, 24) }, false);
      else setNameDraft(stateRef.current.settings.username);
    } else {
      setNameDraft(stateRef.current.settings.username);
    }
    setEditingName(false);
  };

  const chooseProfile = async () => {
    if (profileBusy) return;
    setProfileBusy(true);
    try {
      const path = await importProfileImage();
      if (path) update({ profileImagePath: path }, false);
    } catch {
      notify("Could not use that image. Choose PNG, JPG, or WEBP under 20 MB.");
    } finally {
      setProfileBusy(false);
    }
  };

  const elapsedText = `+${formatElapsed(timerMetrics.elapsed)}`;
  const focusText = `+${focusPercentage}%`;
  const todayText = `+${formatElapsed(today)}`;
  const startedText = t.startedAt
    ? new Date(t.startedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

  const shareData = {
    elapsed: elapsedText,
    focus: focusText,
    started: startedText,
    today: todayText,
    username: s.username,
    quote: "Save yourself from regret.",
    profileUrl: profileImage,
    backgroundUrl: localVideoBackground ?? engineBackground ?? background,
    videoUrl:
      localVideoBackground ??
      (engineProject?.kind === "video" ? engineBackground : null),
    videoDuration:
      activeVideo.current && Number.isFinite(activeVideo.current.duration)
        ? activeVideo.current.duration
        : null,
    fit: s.fit,
    position: s.position,
    opacity: s.opacity,
    overlay: s.overlay,
    blur: s.blur,
  };

  const exportStill = async () => {
    try {
      const blob = await renderShareImage(shareData);
      const saved = await saveShareExport(blob, `sesh-${Date.now()}.png`, "png");
      if (saved) notify("Share card saved.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not export the share card.");
      throw error;
    }
  };

  const exportLoop = async () => {
    if (!shareData.videoUrl) return;
    try {
      const result = await renderShareVideo(shareData);
      const saved = await saveShareExport(
        result.blob,
        `sesh-${Date.now()}.${result.extension}`,
        result.extension,
      );
      if (saved) notify("Loop card saved.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not export the loop card.");
      throw error;
    }
  };

  const openSharePanel = async () => {
    setMenu(false);
    if (stateRef.current.settings.compactMode) await toggleCompact();
    try {
      if (!(await openConfigWindow("share", shareData))) setPanel("share");
    } catch {
      notify("Could not open the share window.");
    }
  };

  const openCalendarPanel = async () => {
    setMenu(false);
    if (stateRef.current.settings.compactMode) await toggleCompact();
    reconcileLifecycle();
    try {
      if (!(await openConfigWindow("calendar", undefined, stateRef.current))) {
        setPanel("calendar");
      }
    } catch {
      notify("Could not open the session calendar.");
    }
  };

  const handleDrag = (event: React.MouseEvent<HTMLElement>) => {
    if (
      event.button === 0 &&
      !(event.target as HTMLElement).closest(
        "button,input,select,textarea,a,summary,[data-no-drag]",
      )
    ) {
      drag();
    }
  };

  return (
    <main
      className={`app ${s.compactMode ? "compact" : "normal"}${modeTransition ? ` mode-${modeTransition}` : ""}`}
      style={{ "--text-scale": s.textScale } as CSSProperties}
    >
      {background && (
        <div
          key={background}
          className="background background-reveal"
          style={{
            "--background-opacity": s.opacity,
            backgroundImage: `url("${background}")`,
            backgroundSize: s.fit,
            backgroundPosition: s.position,
            filter: `blur(${s.blur}px)`,
            inset: s.blur ? -s.blur * 3 : 0,
          } as CSSProperties}
        />
      )}
      {localVideoBackground && (
        <div
          key={localVideoBackground}
          className="background background-reveal"
          style={{
            "--background-opacity": s.opacity,
            filter: `blur(${s.blur}px)`,
            inset: s.blur ? -s.blur * 3 : 0,
          } as CSSProperties}
        >
          <video
            ref={activeVideo}
            crossOrigin="anonymous"
            className="engine-media"
            src={localVideoBackground}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
            style={{ objectFit: s.fit, objectPosition: s.position }}
            onError={() => notify("This local video loop could not be played.")}
          />
        </div>
      )}
      {engineBackground && engineProject?.kind === "video" && (
        <div
          key={engineBackground}
          className="background background-reveal"
          style={{
            "--background-opacity": s.opacity,
            filter: `blur(${s.blur}px)`,
            inset: s.blur ? -s.blur * 3 : 0,
          } as CSSProperties}
        >
          <video
            ref={activeVideo}
            crossOrigin="anonymous"
            className="engine-media"
            src={engineBackground}
            poster={localAssetUrl(engineProject.previewPath)}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
            style={{ objectFit: s.fit, objectPosition: s.position }}
            onError={() => {
              setEngineReady(false);
              notify("This live wallpaper could not be played.");
            }}
          />
        </div>
      )}
      {engineBackground && engineProject?.kind !== "video" && (
        <div
          key={engineBackground}
          className="background background-reveal"
          style={{
            "--background-opacity": s.opacity,
            filter: `blur(${s.blur}px)`,
            inset: s.blur ? -s.blur * 3 : 0,
          } as CSSProperties}
        >
          <img
            className="engine-media"
            src={engineBackground}
            alt=""
            draggable={false}
            style={{ objectFit: s.fit, objectPosition: s.position }}
            onError={() => {
              setEngineReady(false);
              notify("This Wallpaper Engine preview is no longer available.");
            }}
          />
        </div>
      )}
      <div className="overlay" style={{ opacity: hasBackground ? s.overlay : 0 }} />

      <div
        className="foreground"
        onMouseDown={handleDrag}
        onDoubleClick={(event) => {
          if (
            s.compactMode &&
            !(event.target as HTMLElement).closest("[data-no-drag]")
          ) {
            void toggleCompact();
          }
        }}
      >
        {s.compactMode ? (
          <section className="compact-content" aria-label="Compact focus timer">
            <div
              className="compact-time"
              data-no-drag
              role="timer"
              aria-label={`Elapsed time ${formatElapsed(timerMetrics.elapsed)}`}
              title="Double-click to return to normal mode"
              onDoubleClick={() => void toggleCompact()}
            >
              {elapsedText}
            </div>
            <div className="compact-controls" data-no-drag>
              <button
                className="timer-control"
                aria-label={
                  t.status === "running"
                    ? "Pause timer"
                    : t.status === "paused"
                      ? "Resume timer"
                      : "Start timer"
                }
                title={
                  t.status === "running"
                    ? "Pause"
                    : t.status === "paused"
                      ? "Resume"
                      : "Start"
                }
                onClick={toggleTimer}
              >
                {t.status === "running" ? (
                  <Pause aria-hidden="true" />
                ) : (
                  <Play aria-hidden="true" />
                )}
              </button>
              <button
                className="timer-control"
                aria-label="Reset current session"
                title="Reset"
                onClick={resetTimer}
              >
                <RotateCcw aria-hidden="true" />
              </button>
              <button
                className="timer-control"
                aria-label="Return to normal mode"
                title="Normal mode"
                onClick={() => void toggleCompact()}
              >
                <Maximize2 aria-hidden="true" />
              </button>
            </div>
            <div
              className="compact-focus"
              data-no-drag
              aria-label={`Focus ${focusPercentage} percent`}
              title="Double-click to return to normal mode"
              onDoubleClick={() => void toggleCompact()}
            >
              {focusText}
            </div>
          </section>
        ) : (
          <>
            <header className="main-header">
              <img
                className="brand-mark"
                src="/sesh-logo.png"
                alt="SESH"
                draggable={false}
              />
              <span className="wordmark">SESH</span>
              <button
                className="close-button"
                data-no-drag
                aria-label="Exit SESH"
                title="Exit SESH"
                onClick={() => void quit()}
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <section
              className="session-content"
              style={{ opacity: s.textOpacity }}
            >
              <h1>ELAPSED</h1>
              <div
                className="elapsed-block"
                role="timer"
                aria-label={`Elapsed time ${formatElapsed(timerMetrics.elapsed)}`}
              >
                {elapsedText}
              </div>
              <dl className="session-metrics">
                <div>
                  <dt>FOCUS</dt>
                  <dd className="focus-value">{focusText}</dd>
                </div>
                <div>
                  <dt>Started</dt>
                  <dd>{startedText}</dd>
                </div>
                <div>
                  <dt>Today</dt>
                  <dd>{todayText}</dd>
                </div>
              </dl>
            </section>

            <section className="identity" data-no-drag>
              <div className="identity-main">
                <button
                  className="profile-button"
                  aria-label="Choose profile picture"
                  title="Choose profile picture"
                  disabled={profileBusy}
                  onClick={() => void chooseProfile()}
                >
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt="Profile"
                      onError={() => update({ profileImagePath: null })}
                    />
                  ) : (
                    <svg
                      className="profile-placeholder"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
                      <circle cx="24" cy="16" r="9" />
                      <path d="M8 45c.7-11.2 6.2-17 16-17s15.3 5.8 16 17H8Z" />
                    </svg>
                  )}
                  <span className="profile-hover" aria-hidden="true" />
                </button>
                {editingName ? (
                  <input
                    ref={nameInput}
                    className="username-input"
                    aria-label="Username"
                    maxLength={24}
                    value={nameDraft}
                    onChange={(event) =>
                      setNameDraft(event.target.value.replace(/[\r\n]/g, ""))
                    }
                    onBlur={() => finishName(true)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        finishName(true);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        finishName(false);
                      }
                    }}
                  />
                ) : (
                  <button
                    className="username"
                    aria-label={`Edit username, currently ${s.username}`}
                    onClick={() => {
                      setNameDraft(s.username);
                      setEditingName(true);
                    }}
                  >
                    {s.username}
                  </button>
                )}
              </div>
              <div className="identity-meta">
                <span className="site-label">
                  <AxiomGlobe />
                  sesh.timer
                </span>
                <span className="quote">Save yourself from regret.</span>
              </div>
            </section>

            <div className="main-controls" data-no-drag>
              <button
                className="timer-control"
                aria-label="Reset current session"
                title="Reset"
                onClick={resetTimer}
              >
                <RotateCcw aria-hidden="true" />
              </button>
              <button
                className="timer-control"
                aria-label={
                  t.status === "running"
                    ? "Pause timer"
                    : t.status === "paused"
                      ? "Resume timer"
                      : "Start timer"
                }
                title={
                  t.status === "running"
                    ? "Pause"
                    : t.status === "paused"
                      ? "Resume"
                      : "Start"
                }
                onClick={toggleTimer}
              >
                {t.status === "running" ? (
                  <Pause aria-hidden="true" />
                ) : (
                  <Play aria-hidden="true" />
                )}
              </button>
              <button
                ref={menuButton}
                className="timer-control"
                aria-label="Settings"
                aria-expanded={menu}
                aria-haspopup="menu"
                title="Settings"
                onClick={() => setMenu((value) => !value)}
              >
                <MoreVertical aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="menu"
          role="menu"
          data-no-drag
          onKeyDown={(event) => {
            const buttons = Array.from(
              menuRef.current!.querySelectorAll("button"),
            );
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (event.key === "Escape") {
              setMenu(false);
              menuButton.current?.focus();
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              buttons[
                (index +
                  (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                  buttons.length
              ].focus();
            }
          }}
        >
          <button
            role="menuitemcheckbox"
            aria-checked={s.alwaysOnTop}
            onClick={() => update({ alwaysOnTop: !s.alwaysOnTop })}
          >
            <Pin />
            Always on top
            {s.alwaysOnTop && <Check className="trailing" />}
          </button>
          <button role="menuitem" onClick={() => void toggleCompact()}>
            {s.compactMode ? <Maximize2 /> : <Minimize2 />}
            {s.compactMode ? "Normal mode" : "Compact mode"}
            <kbd>C</kbd>
          </button>
          <div className="separator" />
          <button role="menuitem" onClick={() => void openPanel("appearance")}>
            <Palette />
            Appearance
          </button>
          <button role="menuitem" onClick={() => void openPanel("library")}>
            <Image />
            Background library
          </button>
          <button role="menuitem" onClick={() => void openCalendarPanel()}>
            <CalendarDays />
            Session calendar
          </button>
          <button
            role="menuitem"
            onClick={() => void openSharePanel()}
          >
            <Share2 />
            Share card
          </button>
          <div className="separator" />
          <button
            role="menuitem"
            onClick={() => {
              void resetPosition();
              setMenu(false);
            }}
          >
            <Move />
            Reset window position
          </button>
          <button role="menuitem" onClick={() => void quit()}>
            <X />
            Quit SESH
          </button>
        </div>
      )}

      {toast && (
        <button
          type="button"
          role="status"
          className="toast"
          onClick={() => setToast("")}
        >
          {toast}
        </button>
      )}
      {panel === "appearance" && (
        <Settings
          settings={s}
          update={update}
          onClose={() => setPanel(null)}
          background={background}
          onLibrary={() => setPanel("library")}
        />
      )}
      {panel === "library" && (
        <BackgroundLibrary
          settings={s}
          update={update}
          records={records}
          onRecords={setRecords}
          onClose={() => setPanel(null)}
          notify={notify}
        />
      )}
      {panel === "share" && (
        <ShareExport
          onClose={() => setPanel(null)}
          hasVideo={Boolean(shareData.videoUrl)}
          videoDuration={shareData.videoDuration}
          exportImage={exportStill}
          exportVideo={exportLoop}
        />
      )}
      {panel === "calendar" && (
        <SessionCalendar
          snapshot={snapshot}
          onClose={() => setPanel(null)}
          notify={notify}
        />
      )}
    </main>
  );
}
