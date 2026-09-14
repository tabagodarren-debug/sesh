#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

struct DiskLock(Mutex<()>);
fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let p = app
        .path()
        .app_data_dir()
        .map_err(|_| "Could not locate application data.")?;
    fs::create_dir_all(p.join("backgrounds")).map_err(|_| "Could not create application data.")?;
    fs::create_dir_all(p.join("profile")).map_err(|_| "Could not create application data.")?;
    Ok(p)
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
#[tauri::command]
fn set_window_mode(
    window: tauri::WebviewWindow,
    compact: bool,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    let (default_width, default_height, min_width, min_height) = if compact {
        (680.0, 140.0, 420.0, 88.0)
    } else {
        (840.0, 570.0, 700.0, 475.0)
    };
    let width = width.unwrap_or(default_width).max(min_width);
    let height = height.unwrap_or(default_height).max(min_height);
    window
        .set_resizable(true)
        .map_err(|error| format!("Could not unlock window resize: {error}"))?;
    window
        .set_min_size(None::<tauri::LogicalSize<f64>>)
        .map_err(|error| format!("Could not clear window constraints: {error}"))?;
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|error| format!("Could not resize window: {error}"))?;
    window
        .set_min_size(Some(tauri::LogicalSize::new(min_width, min_height)))
        .map_err(|error| format!("Could not apply window constraints: {error}"))?;
    window
        .set_resizable(true)
        .map_err(|error| format!("Could not finalize window mode: {error}"))
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).map_err(|_| "Could not encode settings.")?;
    let temp = path.with_extension("tmp");
    fs::write(&temp, bytes).map_err(|_| "Could not save settings.")?;
    if path.exists() {
        fs::copy(path, path.with_extension("bak")).map_err(|_| "Could not back up settings.")?;
    }
    fs::rename(&temp, path)
        .or_else(|_| {
            fs::copy(&temp, path)?;
            fs::remove_file(&temp)
        })
        .map_err(|_| "Could not save settings.".to_string())
}
fn read_json(path: &Path) -> Option<Value> {
    fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .or_else(|| {
            fs::read(path.with_extension("bak"))
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
        })
}
#[tauri::command]
fn read_snapshot(app: tauri::AppHandle) -> Result<Value, String> {
    Ok(read_json(&root(&app)?.join("state.json")).unwrap_or(Value::Null))
}
#[tauri::command]
fn save_snapshot(
    app: tauri::AppHandle,
    lock: tauri::State<DiskLock>,
    value: Value,
) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|_| "Storage busy.")?;
    write_json(&root(&app)?.join("state.json"), &value)
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Background {
    id: String,
    name: String,
    source: String,
    #[serde(default = "default_background_kind")]
    kind: String,
    path: String,
    last_used: u64,
    size: u64,
}

fn default_background_kind() -> String {
    "image".into()
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WallpaperEngineProject {
    id: String,
    title: String,
    kind: String,
    preview_path: String,
    content_path: String,
    project_path: String,
}

#[derive(Serialize)]
struct WallpaperEngineLibrary {
    projects: Vec<WallpaperEngineProject>,
}

#[cfg(target_os = "windows")]
fn steam_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for variable in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Some(value) = std::env::var_os(variable) {
            let candidate = PathBuf::from(value).join("Steam");
            if candidate.join("steamapps").is_dir() && !roots.contains(&candidate) {
                roots.push(candidate);
            }
        }
    }

    let known = roots.clone();
    for root in known {
        let library_file = root.join("steamapps").join("libraryfolders.vdf");
        let Ok(text) = fs::read_to_string(library_file) else {
            continue;
        };
        for line in text.lines() {
            let quoted: Vec<_> = line.split('"').collect();
            if quoted.len() < 4 || quoted[1] != "path" {
                continue;
            }
            let candidate = PathBuf::from(quoted[3].replace("\\\\", "\\"));
            if candidate.join("steamapps").is_dir() && !roots.contains(&candidate) {
                roots.push(candidate);
            }
        }
    }
    roots
}

#[cfg(not(target_os = "windows"))]
fn steam_roots() -> Vec<PathBuf> {
    Vec::new()
}

fn wallpaper_engine_install() -> Option<(PathBuf, Vec<PathBuf>)> {
    let roots = steam_roots();
    for root in &roots {
        let directory = root
            .join("steamapps")
            .join("common")
            .join("wallpaper_engine");
        for executable in ["wallpaper64.exe", "wallpaper32.exe"] {
            let path = directory.join(executable);
            if path.is_file() {
                return Some((path, roots));
            }
        }
    }
    None
}

fn wallpaper_engine_project_roots(steam: &[PathBuf]) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for root in steam {
        let workshop = root
            .join("steamapps")
            .join("workshop")
            .join("content")
            .join("431960");
        if workshop.is_dir() {
            roots.push(workshop);
        }
        let local = root
            .join("steamapps")
            .join("common")
            .join("wallpaper_engine")
            .join("projects")
            .join("myprojects");
        if local.is_dir() {
            roots.push(local);
        }
    }
    roots
}

fn confined_project_file(directory: &Path, relative: &str) -> Option<PathBuf> {
    if relative.is_empty() {
        return None;
    }
    let root = directory.canonicalize().ok()?;
    let candidate = directory.join(relative).canonicalize().ok()?;
    (candidate.starts_with(root) && candidate.is_file()).then_some(candidate)
}

fn project_kind(value: Option<&str>, content: &Path) -> String {
    let declared = value.unwrap_or_default().to_ascii_lowercase();
    if matches!(declared.as_str(), "scene" | "web" | "application") {
        return declared;
    }
    let extension = content
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(extension.as_str(), "mp4" | "webm" | "m4v" | "mov") {
        "video".into()
    } else if matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif") {
        "image".into()
    } else if declared == "video" {
        "video".into()
    } else {
        "unknown".into()
    }
}

fn read_wallpaper_engine_project(
    directory: &Path,
    library_root: &Path,
) -> Option<WallpaperEngineProject> {
    let project_path = directory.join("project.json").canonicalize().ok()?;
    if fs::metadata(&project_path).ok()?.len() > 8 * 1024 * 1024 {
        return None;
    }
    let value: Value = serde_json::from_slice(&fs::read(&project_path).ok()?).ok()?;
    let preview = value
        .get("preview")
        .and_then(Value::as_str)
        .and_then(|path| confined_project_file(directory, path))
        .or_else(|| {
            ["preview.jpg", "preview.png", "preview.gif", "preview.webp"]
                .iter()
                .find_map(|name| confined_project_file(directory, name))
        })?;
    let declared_file = value
        .get("file")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let declared_content = confined_project_file(directory, declared_file);
    let kind = project_kind(
        value.get("type").and_then(Value::as_str),
        declared_content.as_deref().unwrap_or(&project_path),
    );
    let content = if matches!(kind.as_str(), "image" | "video") {
        declared_content.unwrap_or_else(|| preview.clone())
    } else {
        project_path.clone()
    };
    let folder = directory
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("project");
    let source = if library_root.ends_with("myprojects") {
        "local"
    } else {
        "workshop"
    };
    let title = value
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(folder)
        .chars()
        .take(240)
        .collect();
    Some(WallpaperEngineProject {
        id: format!("{source}:{folder}"),
        title,
        kind,
        preview_path: preview.to_string_lossy().into_owned(),
        content_path: content.to_string_lossy().into_owned(),
        project_path: project_path.to_string_lossy().into_owned(),
    })
}

fn validated_wallpaper_engine_project(
    project: &WallpaperEngineProject,
) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let (_, steam) = wallpaper_engine_install().ok_or("Wallpaper Engine is not installed.")?;
    let project_path = PathBuf::from(&project.project_path)
        .canonicalize()
        .map_err(|_| "Wallpaper Engine project is no longer available.")?;
    let directory = project_path
        .parent()
        .ok_or("Wallpaper Engine project path is invalid.")?;
    let in_library = wallpaper_engine_project_roots(&steam).iter().any(|root| {
        root.canonicalize()
            .is_ok_and(|root| directory.starts_with(root))
    });
    if !in_library || project_path.file_name().and_then(|v| v.to_str()) != Some("project.json") {
        return Err("Wallpaper Engine project path is not trusted.".into());
    }
    let preview = PathBuf::from(&project.preview_path)
        .canonicalize()
        .map_err(|_| "Wallpaper preview is no longer available.")?;
    let content = PathBuf::from(&project.content_path)
        .canonicalize()
        .map_err(|_| "Wallpaper content is no longer available.")?;
    if !preview.starts_with(directory) || !content.starts_with(directory) {
        return Err("Wallpaper Engine asset path is not trusted.".into());
    }
    Ok((project_path, preview, content))
}

#[tauri::command]
fn wallpaper_engine_library(
    app: tauri::AppHandle,
) -> Result<Option<WallpaperEngineLibrary>, String> {
    let Some((_, steam)) = wallpaper_engine_install() else {
        return Ok(None);
    };
    let scope = app.asset_protocol_scope();
    let mut projects = Vec::new();
    for root in wallpaper_engine_project_roots(&steam) {
        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten().take(2500) {
            let directory = entry.path();
            if !directory.is_dir() {
                continue;
            }
            let Some(project) = read_wallpaper_engine_project(&directory, &root) else {
                continue;
            };
            if !matches!(project.kind.as_str(), "image" | "video") {
                continue;
            }
            let _ = scope.allow_file(&project.preview_path);
            let _ = scope.allow_file(&project.content_path);
            projects.push(project);
        }
    }
    projects.sort_by_key(|project| project.title.to_ascii_lowercase());
    projects.dedup_by(|left, right| left.id == right.id);
    Ok(Some(WallpaperEngineLibrary { projects }))
}

#[tauri::command]
fn prepare_wallpaper_engine_project(
    app: tauri::AppHandle,
    project: WallpaperEngineProject,
) -> Result<(), String> {
    let (_, preview, content) = validated_wallpaper_engine_project(&project)?;
    app.asset_protocol_scope()
        .allow_file(preview)
        .map_err(|_| "Could not prepare Wallpaper Engine preview.")?;
    if matches!(project.kind.as_str(), "image" | "video") {
        app.asset_protocol_scope()
            .allow_file(content)
            .map_err(|_| "Could not prepare Wallpaper Engine content.")?;
    }
    Ok(())
}

fn records(dir: &Path) -> Vec<Background> {
    read_json(&dir.join("library.json"))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}
fn safe_file(dir: &Path, p: &str) -> bool {
    let path = Path::new(p);
    path.parent() == Some(dir.join("backgrounds").as_path()) && path.file_name().is_some()
}
#[tauri::command]
fn list_backgrounds(app: tauri::AppHandle) -> Result<Vec<Background>, String> {
    let dir = root(&app)?;
    Ok(records(&dir)
        .into_iter()
        .filter(|r| safe_file(&dir, &r.path) && Path::new(&r.path).is_file())
        .collect())
}
const MAX_BYTES: u64 = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES: u64 = 200 * 1024 * 1024;
fn validate_image(bytes: &[u8]) -> Result<&'static str, String> {
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Image must be smaller than 20 MB.".into());
    }
    let format =
        image::guess_format(bytes).map_err(|_| "Unsupported image. Use PNG, JPG, or WEBP.")?;
    let ext = match format {
        image::ImageFormat::Png => "png",
        image::ImageFormat::Jpeg => "jpg",
        image::ImageFormat::WebP => "webp",
        _ => return Err("Unsupported image. Use PNG, JPG, or WEBP.".into()),
    };
    let reader = image::ImageReader::with_format(std::io::Cursor::new(bytes), format);
    let (w, h) = reader
        .into_dimensions()
        .map_err(|_| "Could not open image.")?;
    if w == 0 || h == 0 || w as u64 * h as u64 > 40_000_000 {
        return Err("Image dimensions are too large (maximum 40 megapixels).".into());
    }
    image::load_from_memory_with_format(bytes, format).map_err(|_| "Could not decode image.")?;
    Ok(ext)
}
fn add_image(
    dir: &Path,
    bytes: &[u8],
    name: String,
    source: &str,
    id: String,
) -> Result<Background, String> {
    let ext = validate_image(bytes)?;
    let path = dir.join("backgrounds").join(format!("{id}.{ext}"));
    fs::write(&path, bytes).map_err(|_| "Could not save image.")?;
    let r = Background {
        id,
        name,
        source: source.into(),
        kind: "image".into(),
        path: path.to_string_lossy().into_owned(),
        last_used: now(),
        size: bytes.len() as u64,
    };
    let mut all = records(dir);
    all.retain(|b| b.id != r.id);
    all.push(r.clone());
    write_json(&dir.join("library.json"), &all)?;
    Ok(r)
}
#[tauri::command]
fn import_image(
    app: tauri::AppHandle,
    lock: tauri::State<DiskLock>,
    path: String,
) -> Result<Background, String> {
    let _guard = lock.0.lock().map_err(|_| "Storage busy.")?;
    let p = Path::new(&path);
    let metadata = fs::metadata(p).map_err(|_| "Could not open media.")?;
    let bytes = fs::read(p).map_err(|_| "Could not open image.")?;
    let is_webm = bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]);
    let is_mp4 = bytes.len() >= 12 && &bytes[4..8] == b"ftyp";
    if is_webm || is_mp4 {
        if metadata.len() > MAX_VIDEO_BYTES {
            return Err("Video must be smaller than 200 MB.".into());
        }
        let ext = if is_webm { "webm" } else { "mp4" };
        let dir = root(&app)?;
        let id = uuid::Uuid::new_v4().to_string();
        let destination = dir.join("backgrounds").join(format!("{id}.{ext}"));
        fs::write(&destination, &bytes).map_err(|_| "Could not save video.")?;
        let record = Background {
            id,
            name: p
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            source: "local".into(),
            kind: "video".into(),
            path: destination.to_string_lossy().into_owned(),
            last_used: now(),
            size: bytes.len() as u64,
        };
        let mut all = records(&dir);
        all.push(record.clone());
        write_json(&dir.join("library.json"), &all)?;
        return Ok(record);
    }
    if metadata.len() > MAX_BYTES {
        return Err("Image must be smaller than 20 MB.".into());
    }
    add_image(
        &root(&app)?,
        &bytes,
        p.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        "local",
        uuid::Uuid::new_v4().to_string(),
    )
}

#[tauri::command]
fn save_share_export(path: String, bytes: Vec<u8>) -> Result<(), String> {
    const MAX_EXPORT_BYTES: usize = 80 * 1024 * 1024;
    if bytes.is_empty() || bytes.len() > MAX_EXPORT_BYTES {
        return Err("The exported card has an invalid size.".into());
    }
    let destination = PathBuf::from(path);
    let extension = destination
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "png" | "webm" | "mp4") {
        return Err("Choose a PNG, WEBM, or MP4 file.".into());
    }
    let parent = destination
        .parent()
        .ok_or("Choose a valid export location.")?;
    if !parent.is_dir() {
        return Err("The export folder is unavailable.".into());
    }
    let temporary = destination.with_extension(format!("{extension}.tmp"));
    fs::write(&temporary, bytes).map_err(|_| "Could not write the share card.")?;
    if destination.exists() {
        fs::remove_file(&destination).map_err(|_| "Could not replace the existing file.")?;
    }
    fs::rename(&temporary, &destination).map_err(|_| "Could not finish the share card.".to_string())
}
#[tauri::command]
fn import_profile_image(
    app: tauri::AppHandle,
    lock: tauri::State<DiskLock>,
    path: String,
) -> Result<String, String> {
    let _guard = lock.0.lock().map_err(|_| "Storage busy.")?;
    let source = Path::new(&path);
    if fs::metadata(source)
        .map_err(|_| "Could not open image.")?
        .len()
        > MAX_BYTES
    {
        return Err("Image must be smaller than 20 MB.".into());
    }
    let bytes = fs::read(source).map_err(|_| "Could not open image.")?;
    let ext = validate_image(&bytes)?;
    let directory = root(&app)?.join("profile");
    let destination = directory.join(format!("avatar-{}.{ext}", uuid::Uuid::new_v4()));
    let temporary = directory.join(format!(
        "avatar-{temporary}.{ext}",
        temporary = uuid::Uuid::new_v4()
    ));
    fs::write(&temporary, &bytes).map_err(|_| "Could not save profile image.")?;
    if destination.exists() {
        fs::remove_file(&destination).map_err(|_| "Could not replace profile image.")?;
    }
    fs::rename(&temporary, &destination)
        .or_else(|_| {
            fs::copy(&temporary, &destination)?;
            fs::remove_file(&temporary)
        })
        .map_err(|_| "Could not save profile image.".to_string())?;

    if let Ok(entries) = fs::read_dir(&directory) {
        for entry in entries.flatten() {
            let old = entry.path();
            let is_avatar = old
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("avatar"));
            if is_avatar && old != destination {
                let _ = fs::remove_file(old);
            }
        }
    }
    Ok(destination.to_string_lossy().into_owned())
}
#[tauri::command]
fn delete_background(
    app: tauri::AppHandle,
    lock: tauri::State<DiskLock>,
    id: String,
    active: Option<String>,
) -> Result<(), String> {
    if active.as_deref() == Some(&id) {
        return Err("Choose another background before deleting this image.".into());
    }
    let _guard = lock.0.lock().map_err(|_| "Storage busy.")?;
    let dir = root(&app)?;
    let mut all = records(&dir);
    if let Some(r) = all.iter().find(|r| r.id == id) {
        if safe_file(&dir, &r.path) && Path::new(&r.path).exists() {
            fs::remove_file(&r.path).map_err(|_| "Could not delete image.")?;
        }
    }
    all.retain(|r| r.id != id);
    write_json(&dir.join("library.json"), &all)
}
#[tauri::command]
fn touch_background(
    app: tauri::AppHandle,
    lock: tauri::State<DiskLock>,
    id: String,
) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|_| "Storage busy.")?;
    let dir = root(&app)?;
    let mut all = records(&dir);
    if let Some(r) = all.iter_mut().find(|r| r.id == id) {
        r.last_used = now();
    }
    write_json(&dir.join("library.json"), &all)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchOptions {
    query: String,
    category: String,
    sorting: String,
    resolution: String,
    page: u32,
    api_key: String,
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("SESH/0.1")
        .build()
        .map_err(|_| "Could not connect to Wallhaven.".into())
}
#[tauri::command]
async fn search_wallpapers(options: SearchOptions) -> Result<Value, String> {
    let category = match options.category.as_str() {
        "100" => "100",
        "111" => "111",
        _ => "010",
    };
    let sorting = match options.sorting.as_str() {
        "favorites" => "favorites",
        "date_added" => "date_added",
        _ => "toplist",
    };
    let resolution = match options.resolution.as_str() {
        "2560x1440" => "2560x1440",
        "3840x2160" => "3840x2160",
        _ => "1920x1080",
    };
    let mut params = vec![
        ("q", options.query.chars().take(200).collect::<String>()),
        ("categories", category.into()),
        ("purity", "100".into()),
        ("sorting", sorting.into()),
        ("atleast", resolution.into()),
        ("page", options.page.clamp(1, 1000).to_string()),
        ("topRange", "1M".into()),
    ];
    if !options.api_key.is_empty() {
        params.push(("apikey", options.api_key));
    }
    let res = client()?
        .get("https://wallhaven.cc/api/v1/search")
        .query(&params)
        .send()
        .await
        .map_err(|_| "Unable to load Wallhaven. Check your connection and try again.")?;
    if !res.status().is_success() {
        return Err(if res.status().as_u16() == 429 {
            "Wallhaven is busy. Try again in a minute."
        } else {
            "Unable to load Wallhaven. Check the API key or try again."
        }
        .into());
    }
    let mut value: Value = res
        .json()
        .await
        .map_err(|_| "Invalid wallpaper response.")?;
    if let Some(data) = value.get_mut("data").and_then(Value::as_array_mut) {
        data.retain(|r| {
            r.get("purity").and_then(Value::as_str) == Some("sfw")
                && r.get("id").and_then(Value::as_str).is_some()
                && r.pointer("/thumbs/small")
                    .and_then(Value::as_str)
                    .is_some_and(|s| s.starts_with("https://th.wallhaven.cc/"))
        });
    } else {
        return Err("Invalid wallpaper response.".into());
    }
    Ok(value)
}
fn valid_download(id: &str, url: &str) -> bool {
    if id.len() != 6 || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return false;
    }
    reqwest::Url::parse(url).is_ok_and(|u| {
        u.scheme() == "https"
            && u.host_str() == Some("w.wallhaven.cc")
            && u.port().is_none()
            && u.username().is_empty()
            && u.password().is_none()
            && u.path().contains(&format!("wallhaven-{id}."))
    })
}
#[tauri::command]
async fn download_wallpaper(
    app: tauri::AppHandle,
    lock: tauri::State<'_, DiskLock>,
    id: String,
    url: String,
    active: Option<String>,
) -> Result<Background, String> {
    if !valid_download(&id, &url) {
        return Err("Invalid wallpaper address.".into());
    }
    let mut response = client()?
        .get(&url)
        .send()
        .await
        .map_err(|_| "Could not download wallpaper.")?;
    if !response.status().is_success() {
        return Err("Could not download wallpaper.".into());
    }
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    if !["image/png", "image/jpeg", "image/webp"]
        .iter()
        .any(|m| mime.starts_with(m))
    {
        return Err("Unsupported wallpaper format.".into());
    }
    if response.content_length().unwrap_or(0) > MAX_BYTES {
        return Err("Wallpaper is too large.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Download interrupted. Try again.")?
    {
        if bytes.len() + chunk.len() > MAX_BYTES as usize {
            return Err("Wallpaper is too large.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let _guard = lock.0.lock().map_err(|_| "Storage busy.")?;
    let dir = root(&app)?;
    let record = add_image(
        &dir,
        &bytes,
        format!("Wallhaven {id}"),
        "wallhaven",
        format!("wh-{id}"),
    )?;
    let mut all = records(&dir);
    let count = all.iter().filter(|r| r.source == "wallhaven").count();
    let mut candidates: Vec<_> = all
        .iter()
        .filter(|r| {
            r.source == "wallhaven" && Some(r.id.as_str()) != active.as_deref() && r.id != record.id
        })
        .cloned()
        .collect();
    candidates.sort_by_key(|r| r.last_used);
    for old in candidates.iter().take(count.saturating_sub(40)) {
        if safe_file(&dir, &old.path) {
            let _ = fs::remove_file(&old.path);
        }
        all.retain(|r| r.id != old.id);
    }
    write_json(&dir.join("library.json"), &all)?;
    Ok(record)
}
fn main() {
    tauri::Builder::default()
        .manage(DiskLock(Mutex::new(())))
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            eprintln!(
                "SESH startup windows: {:?}",
                app.webview_windows().keys().collect::<Vec<_>>()
            );
            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_window_mode,
            quit_app,
            wallpaper_engine_library,
            prepare_wallpaper_engine_project,
            read_snapshot,
            save_snapshot,
            list_backgrounds,
            import_image,
            import_profile_image,
            save_share_export,
            delete_background,
            touch_background,
            search_wallpapers,
            download_wallpaper
        ])
        .run(tauri::generate_context!())
        .expect("SESH could not start");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restrict_downloads() {
        assert!(valid_download(
            "abc123",
            "https://w.wallhaven.cc/full/ab/wallhaven-abc123.jpg"
        ));
        assert!(!valid_download("../abc", "https://w.wallhaven.cc/a"));
        assert!(!valid_download(
            "abc123",
            "https://evil.example/wallhaven-abc123.jpg"
        ));
        assert!(!valid_download(
            "abc123",
            "http://w.wallhaven.cc/wallhaven-abc123.jpg"
        ));
    }
    #[test]
    fn rejects_bad_images() {
        assert!(validate_image(b"not an image").is_err());
    }
    #[test]
    fn confines_paths() {
        let d = Path::new("data");
        assert!(safe_file(
            d,
            &d.join("backgrounds").join("a.png").to_string_lossy()
        ));
        assert!(!safe_file(d, "secret.txt"));
    }
    #[test]
    fn classifies_wallpaper_engine_media() {
        assert_eq!(project_kind(Some("Video"), Path::new("clip.mp4")), "video");
        assert_eq!(project_kind(Some("Web"), Path::new("index.html")), "web");
        assert_eq!(project_kind(None, Path::new("still.webp")), "image");
        assert_eq!(project_kind(None, Path::new("unknown.bin")), "unknown");
    }
}
