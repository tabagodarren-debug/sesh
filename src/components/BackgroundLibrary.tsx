import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Film,
  ImageOff,
  MonitorPlay,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  type BackgroundRecord,
  type SeshSettings,
  type WallpaperEngineProject,
} from "../domain/settings";
import {
  library,
  importImage,
  deleteImage,
  imageUrl,
  localAssetUrl,
  searchWallpapers,
  downloadWallpaper,
  prepareWallpaperEngineProject,
  wallpaperEngineLibrary,
  type WallpaperEngineLibrary,
  type Wallpaper,
} from "../services/storage";
import { Dialog } from "./Dialog";
export const presets = [
  { id: "preset-dark", name: "Obsidian", category: "Dark" },
  { id: "preset-abstract", name: "Fold", category: "Abstract" },
  { id: "preset-space", name: "Orbit", category: "Space" },
  { id: "preset-gradient", name: "After hours", category: "Gradient" },
  { id: "preset-minimal", name: "Quiet lines", category: "Minimal" },
];
export function presetUrl(id: string) {
  return `/backgrounds/${id}.svg`;
}
export function BackgroundLibrary({
  settings: s,
  update,
  records,
  onRecords,
  onClose,
  notify,
  standalone = false,
}: {
  settings: SeshSettings;
  update: (p: Partial<SeshSettings>) => void;
  records: BackgroundRecord[];
  onRecords: (r: BackgroundRecord[]) => void;
  onClose: () => void;
  notify: (t: string) => void;
  standalone?: boolean;
}) {
  const [tab, setTab] = useState("Presets");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("010");
  const [sorting, setSorting] = useState("toplist");
  const [resolution, setResolution] = useState("1920x1080");
  const [items, setItems] = useState<Wallpaper[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [download, setDownload] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<BackgroundRecord | null>(null);
  const [revision, setRevision] = useState(0);
  const [engine, setEngine] = useState<WallpaperEngineLibrary | null>(null);
  const [engineQuery, setEngineQuery] = useState("");
  const [engineLimit, setEngineLimit] = useState(60);
  const [engineOpening, setEngineOpening] = useState("");
  const sequence = useRef(0);
  useEffect(() => {
    let active = true;
    void wallpaperEngineLibrary()
      .then((result) => {
        if (active) setEngine(result);
      })
      .catch(() => {
        // Detection is intentionally silent. Unsupported or missing providers
        // should not add noise to the cross-platform experience.
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (tab !== "Wallhaven") return;
    const seq = ++sequence.current;
    setBusy(true);
    setError("");
    const timeout = setTimeout(() => {
      void searchWallpapers({
        query,
        category,
        sorting,
        resolution,
        page,
        apiKey: s.apiKey,
      })
        .then((result) => {
          if (seq !== sequence.current) return;
          setItems(result.data);
          setLastPage(result.meta.last_page);
        })
        .catch((e) => {
          if (seq === sequence.current) {
            setError(
              typeof e === "string"
                ? e
                : (e.message ?? "Unable to load Wallhaven."),
            );
            setItems([]);
          }
        })
        .finally(() => {
          if (seq === sequence.current) setBusy(false);
        });
    }, 350);
    return () => {
      clearTimeout(timeout);
      sequence.current++;
    };
  }, [tab, query, category, sorting, resolution, page, revision, s.apiKey]);
  const choose = (id: string | null) => {
    update({ backgroundId: id, wallpaperEngineProject: null });
  };
  async function add() {
    try {
      const r = await importImage();
      if (r) {
        onRecords(await library());
        choose(r.id);
      }
    } catch {
      notify("Could not open media. Use PNG, JPG, WEBP, MP4, or WEBM.");
    }
  }
  async function selectWallpaper(w: Wallpaper) {
    setDownload(w.id);
    try {
      const r = await downloadWallpaper(w, s.backgroundId);
      onRecords(await library());
      choose(r.id);
      notify("Background saved for offline use.");
    } catch (e) {
      notify(typeof e === "string" ? e : "Could not download wallpaper.");
    } finally {
      setDownload("");
    }
  }
  async function selectEngineProject(project: WallpaperEngineProject) {
    setEngineOpening(project.id);
    try {
      await prepareWallpaperEngineProject(project);
      update({
        backgroundId: `wallpaper-engine:${project.id}`,
        wallpaperEngineProject: project,
      });
      notify(
        project.kind === "video"
          ? "Live wallpaper applied."
          : project.kind === "scene"
            ? "Static scene preview applied."
            : "Wallpaper Engine image applied.",
      );
    } catch (e) {
      notify(
        typeof e === "string"
          ? e
          : "Could not open this Wallpaper Engine project.",
      );
    } finally {
      setEngineOpening("");
    }
  }
  const engineProjects = useMemo(() => {
    const normalized = engineQuery.trim().toLocaleLowerCase();
    return (engine?.projects ?? []).filter(
      (project) =>
        (project.kind === "image" ||
          project.kind === "video" ||
          project.kind === "scene") &&
        (!normalized || project.title.toLocaleLowerCase().includes(normalized)),
    );
  }, [engine, engineQuery]);
  return (
    <Dialog title="Background library" onClose={onClose} wide standalone={standalone}>
      {(close) => (
        <>
      <nav className="tabs" aria-label="Background sources">
        {[
          "Presets",
          "Wallhaven",
          ...(engine ? ["Wallpaper Engine"] : []),
          "My Media",
        ].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <div key={tab} className="dialog-body library-body tab-panel">
        {tab === "Presets" ? (
          <>
            <p className="hint">A little atmosphere. Nothing in your way.</p>
            <div className="wallpaper-grid">
              <button
                className="wallpaper none"
                aria-pressed={!s.backgroundId}
                onClick={() => choose(null)}
              >
                <ImageOff size={24} />
                <span>No background</span>
                {!s.backgroundId && (
                  <Check className="selected-check" size={16} />
                )}
              </button>
              {presets.map((p) => (
                <button
                  className="wallpaper"
                  key={p.id}
                  aria-pressed={s.backgroundId === p.id}
                  onClick={() => choose(p.id)}
                >
                  <img src={presetUrl(p.id)} alt="" />
                  <span>
                    {p.name}
                    <small>{p.category}</small>
                  </span>
                  {s.backgroundId === p.id && (
                    <Check className="selected-check" size={16} />
                  )}
                </button>
              ))}
            </div>
          </>
        ) : tab === "My Media" ? (
          <>
            <button className="secondary full" onClick={add}>
              <Plus size={16} /> Add image or video
            </button>
            <p className="hint">
              PNG, JPG, WEBP · up to 20 MB<br />MP4, WEBM loops · up to 200 MB
              <br />
              Imported media stays available if the original moves.
            </p>
            {records.length === 0 ? (
              <div className="empty">
                <ImageOff />
                <p>Your space, your media.</p>
                <small>Add an image or video loop to make SESH yours.</small>
              </div>
            ) : (
              <div className="wallpaper-grid">
                {records.map((r) => (
                  <div className="image-entry" key={r.id}>
                    <button
                      className="wallpaper"
                      aria-pressed={s.backgroundId === r.id}
                      onClick={() => choose(r.id)}
                    >
                      {r.kind === "video" ? (
                        <video
                          src={imageUrl(r)}
                          crossOrigin="anonymous"
                          muted
                          playsInline
                          preload="metadata"
                          aria-hidden="true"
                        />
                      ) : (
                        <img loading="lazy" src={imageUrl(r)} alt="" />
                      )}
                      <span>{r.name}</span>
                      {s.backgroundId === r.id && (
                        <Check className="selected-check" size={16} />
                      )}
                    </button>
                    <button
                      className="delete-image icon"
                      aria-label={`Delete ${r.name}`}
                      onClick={() => setDeleting(r)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : tab === "Wallpaper Engine" && engine ? (
          <>
            <div className="provider-intro">
              <span className="provider-icon" aria-hidden="true">
                <MonitorPlay />
              </span>
              <div>
                <strong>Installed Wallpaper Engine</strong>
                <p className="hint">
                  Videos play live inside SESH. Scene wallpapers with a static
                  preview are available as still backgrounds.
                </p>
              </div>
            </div>
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Search installed Wallpaper Engine projects"
                placeholder={`Search ${engineProjects.length} compatible wallpapers…`}
                value={engineQuery}
                onChange={(event) => {
                  setEngineQuery(event.target.value);
                  setEngineLimit(60);
                }}
              />
            </label>
            {engineProjects.length === 0 ? (
              <div className="empty">
                <ImageOff />
                <p>No compatible installed wallpapers.</p>
                <small>
                  Subscribe to a Video wallpaper or a Scene wallpaper with a
                  static preview, then reopen this library.
                </small>
              </div>
            ) : (
              <>
                <div className="wallpaper-grid engine-grid">
                  {engineProjects.slice(0, engineLimit).map((project) => {
                    const selected =
                      s.backgroundId === `wallpaper-engine:${project.id}`;
                    return (
                      <button
                        key={project.id}
                        className="wallpaper engine-wallpaper"
                        aria-pressed={selected}
                        disabled={!!engineOpening}
                        onClick={() => void selectEngineProject(project)}
                      >
                        <img
                          loading="lazy"
                          src={localAssetUrl(project.previewPath)}
                          alt=""
                        />
                        <span>
                          <b>{project.title}</b>
                          <small>
                            <Film aria-hidden="true" />
                            {project.kind === "video"
                              ? "Live video"
                              : project.kind === "scene"
                                ? "Static scene preview"
                                : "Static image"}
                          </small>
                        </span>
                        {engineOpening === project.id && (
                          <span className="wallpaper-busy">Opening…</span>
                        )}
                        {selected && (
                          <Check className="selected-check" size={16} />
                        )}
                      </button>
                    );
                  })}
                </div>
                {engineLimit < engineProjects.length && (
                  <button
                    className="secondary full load-more"
                    onClick={() => setEngineLimit((limit) => limit + 60)}
                  >
                    Show more
                  </button>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Search Wallhaven"
                placeholder="Search wallpapers…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <div className="filters">
              <label>
                Category
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="010">Anime</option>
                  <option value="100">General</option>
                  <option value="111">All</option>
                </select>
              </label>
              <label>
                Sort
                <select
                  value={sorting}
                  onChange={(e) => {
                    setSorting(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="toplist">Top</option>
                  <option value="favorites">Favorites</option>
                  <option value="date_added">Latest</option>
                </select>
              </label>
              <label>
                Min. size
                <select
                  value={resolution}
                  onChange={(e) => {
                    setResolution(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="1920x1080">1080p</option>
                  <option value="2560x1440">1440p</option>
                  <option value="3840x2160">4K</option>
                </select>
              </label>
            </div>
            <div className="chips">
              {[
                "Top Anime",
                "Anime City",
                "Night",
                "Cyberpunk",
                "Space",
                "Scenic",
                "Minimal",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setQuery(q === "Top Anime" ? "" : q);
                    setPage(1);
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="hint">
              SFW only · Full images download when selected.
            </p>
            {busy ? (
              <div
                className="wallpaper-grid"
                role="status"
                aria-label="Loading wallpapers"
              >
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div className="skeleton" key={i} />
                ))}
              </div>
            ) : error ? (
              <div className="empty" role="status">
                <p>{error}</p>
                <button
                  className="secondary"
                  onClick={() => setRevision((r) => r + 1)}
                >
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="empty">
                No wallpapers found. Try another search.
              </div>
            ) : (
              <>
                <div className="wallpaper-grid">
                  {items.map((w) => (
                    <button
                      key={w.id}
                      className="wallpaper"
                      disabled={!!download}
                      onClick={() => selectWallpaper(w)}
                    >
                      <img
                        loading="lazy"
                        src={w.thumbs.small}
                        alt={`Wallpaper ${w.id}`}
                      />
                      <span>
                        {download === w.id ? "Saving…" : w.resolution}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="pagination">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <small>
                    {page} / {lastPage}
                  </small>
                  <button
                    disabled={page >= lastPage}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
            <details>
              <summary>Optional API key</summary>
              <label>
                Wallhaven API key
                <input
                  type="password"
                  value={s.apiKey}
                  onChange={(e) => update({ apiKey: e.target.value })}
                  autoComplete="off"
                />
              </label>
              <p className="hint">
                Stored on this device. Sent only to Wallhaven.
              </p>
            </details>
          </>
        )}
      </div>
      <footer className="dialog-foot">
        <small>Saved locally. Always yours.</small>
        <button className="primary" onClick={close}>
          Done
        </button>
      </footer>
      {deleting && (
        <Dialog title="Delete image?" onClose={() => setDeleting(null)}>
          {(closeDelete) => (
            <>
          <div className="dialog-body">
            <p>
              This removes “{deleting.name}” from SESH. Your original file is
              kept.
            </p>
            {deleting.id === s.backgroundId && (
              <p className="hint">
                The timer will return to its plain background.
              </p>
            )}
          </div>
          <footer className="dialog-foot">
            <button onClick={closeDelete}>Cancel</button>
            <button
              className="danger"
              onClick={async () => {
                try {
                  if (deleting.id === s.backgroundId) choose(null);
                  await deleteImage(deleting.id, null);
                  onRecords(await library());
                  closeDelete();
                } catch {
                  notify("Could not delete image.");
                }
              }}
            >
              Delete image
            </button>
          </footer>
            </>
          )}
        </Dialog>
      )}
        </>
      )}
    </Dialog>
  );
}
