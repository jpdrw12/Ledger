// Custom in-app updater. Deliberately NOT the official tauri-plugin-updater
// (which would force signing keys + AppImage on Linux); instead we reuse the
// per-OS installers already published to each GitHub Release and let each OS
// show its own standard admin prompt at install time. No signing, no sudoers
// dependency — works for any user on any OS.
//
// Everything goes through `curl` (ships on modern Linux/macOS/Windows) so we
// don't pull in an HTTP crate. The repo is public, so no auth is needed.

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};

const REPO: &str = "jpdrw12/Ledger";

#[derive(Serialize)]
pub struct UpdateInfo {
    /// Latest published version, tag with the leading "v" stripped (e.g. "0.12.0").
    latest_version: String,
    /// Raw CHANGELOG.md at that tag — the frontend parses it for the preview.
    changelog_md: String,
    /// Download URL of the installer asset matching the current OS.
    asset_url: String,
    /// File name of that asset (e.g. "household-ledger_0.12.0_amd64.deb").
    asset_name: String,
}

/// Runs `curl -sL <url>` and returns stdout as a string, erroring on a
/// non-zero exit or unreadable output.
fn curl(url: &str) -> Result<String, String> {
    let out = Command::new("curl")
        .args(["-sL", "--fail", url])
        .output()
        .map_err(|e| format!("couldn't run curl (is it installed?): {e}"))?;
    if !out.status.success() {
        return Err(format!("network request failed for {url}"));
    }
    String::from_utf8(out.stdout).map_err(|e| format!("bad response for {url}: {e}"))
}

/// The suffix of the release asset that belongs to the current OS. Matches how
/// tauri-action names bundles: Linux `.deb`, macOS `.dmg`, Windows `.msi`.
fn asset_suffix() -> &'static str {
    if cfg!(target_os = "linux") {
        "amd64.deb"
    } else if cfg!(target_os = "macos") {
        ".dmg"
    } else {
        ".msi"
    }
}

#[tauri::command]
pub fn check_for_update() -> Result<UpdateInfo, String> {
    let api = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let body = curl(&api)?;
    let json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("couldn't parse release info: {e}"))?;

    let tag = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .ok_or("no tag_name in latest release")?;
    let latest_version = tag.trim_start_matches('v').to_string();

    // Pick the asset for this OS. Windows falls back to a .exe installer if no
    // .msi is present.
    let assets = json
        .get("assets")
        .and_then(|v| v.as_array())
        .ok_or("no assets in latest release")?;
    let pick = |suffix: &str| -> Option<(String, String)> {
        assets.iter().find_map(|a| {
            let name = a.get("name")?.as_str()?;
            if name.ends_with(suffix) {
                let url = a.get("browser_download_url")?.as_str()?;
                Some((name.to_string(), url.to_string()))
            } else {
                None
            }
        })
    };
    let (asset_name, asset_url) = pick(asset_suffix())
        .or_else(|| if cfg!(target_os = "windows") { pick(".exe") } else { None })
        .ok_or_else(|| format!("no installer asset for this platform in {tag}"))?;

    // Notes come from CHANGELOG.md at the tag (release bodies are static).
    let changelog_md = curl(&format!(
        "https://raw.githubusercontent.com/{REPO}/{tag}/CHANGELOG.md"
    ))
    .unwrap_or_default();

    Ok(UpdateInfo {
        latest_version,
        changelog_md,
        asset_url,
        asset_name,
    })
}

/// Downloads the installer to the app cache dir, then hands it to the OS
/// installer with that platform's standard admin prompt.
///
/// Runs the whole download+install on a background thread and returns
/// immediately: a synchronous Tauri command runs on the **main thread**, so
/// doing the blocking work here directly freezes the UI (which is exactly what
/// happened — the window locked up during `curl`/`apt-get`). Progress and the
/// final outcome are reported via events instead of the return value:
///   - "update-progress": "downloading" | "installing"
///   - "update-done": { status: "installed" | "opened" | "downloaded" | "error",
///                      path?, error? }
#[tauri::command]
pub fn install_update(app: AppHandle, asset_url: String, asset_name: String) -> Result<(), String> {
    // Guard the file name: no path separators, so a crafted asset name can't
    // escape the cache dir. (Validated synchronously so obvious mistakes still
    // surface as a rejected promise.)
    if asset_name.contains('/') || asset_name.contains('\\') || asset_name.contains("..") {
        return Err("unexpected asset name".into());
    }
    let dir: PathBuf = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("could not resolve cache dir: {e}"))?
        .join("updates");
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create cache dir: {e}"))?;
    let dest = dir.join(&asset_name);

    let done = move |app: &AppHandle, status: &str, extra: serde_json::Value| {
        let mut payload = serde_json::json!({ "status": status });
        if let (Some(obj), Some(ex)) = (payload.as_object_mut(), extra.as_object()) {
            for (k, v) in ex {
                obj.insert(k.clone(), v.clone());
            }
        }
        let _ = app.emit("update-done", payload);
    };

    std::thread::spawn(move || {
        let _ = app.emit("update-progress", "downloading");
        let dl = Command::new("curl")
            .args(["-L", "--fail", "-o"])
            .arg(&dest)
            .arg(&asset_url)
            .status();
        match dl {
            Ok(s) if s.success() => {}
            _ => {
                done(&app, "error", serde_json::json!({ "error": "failed to download the update" }));
                return;
            }
        }
        let path = dest.to_string_lossy().to_string();
        let _ = app.emit("update-progress", "installing");

        #[cfg(target_os = "linux")]
        {
            match Command::new("pkexec")
                .args(["apt-get", "install", "-y"])
                .arg(&dest)
                .status()
            {
                Ok(s) if s.success() => done(&app, "installed", serde_json::json!({})),
                // Cancelled / pkexec missing: leave the .deb downloaded.
                _ => done(&app, "downloaded", serde_json::json!({ "path": path })),
            }
        }
        #[cfg(target_os = "macos")]
        {
            match Command::new("open").arg(&dest).status() {
                Ok(_) => done(&app, "opened", serde_json::json!({})),
                Err(e) => done(&app, "error", serde_json::json!({ "error": format!("couldn't open the installer: {e}") })),
            }
        }
        #[cfg(target_os = "windows")]
        {
            match Command::new("cmd").args(["/C", "start", ""]).arg(&dest).status() {
                Ok(_) => done(&app, "opened", serde_json::json!({})),
                Err(e) => done(&app, "error", serde_json::json!({ "error": format!("couldn't launch the installer: {e}") })),
            }
        }
        #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
        {
            done(&app, "downloaded", serde_json::json!({ "path": path }));
        }
    });

    Ok(())
}

/// Relaunches the app so a freshly-installed update takes effect.
///
/// NOT `app.restart()` — that re-execs `/proc/self/exe`, which on Linux still
/// resolves to the *old* binary's inode after apt replaces the file on disk
/// (the path may even come back as "…/household-ledger (deleted)"). Re-execing
/// that relaunches the version we just replaced. Instead we spawn the binary by
/// its real on-disk path (stripping any " (deleted)" marker) and exit, so the
/// freshly-installed binary is what comes up.
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    if let Ok(exe) = std::env::current_exe() {
        let mut path = exe.to_string_lossy().to_string();
        if let Some(stripped) = path.strip_suffix(" (deleted)") {
            path = stripped.to_string();
        }
        let _ = Command::new(path).spawn();
    }
    app.exit(0);
}
