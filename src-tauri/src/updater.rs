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
use tauri::{AppHandle, Manager};

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
/// installer with that platform's standard admin prompt. Returns a status word:
/// "installed" (ran a system installer), "opened" (launched an installer the
/// user completes), or "downloaded" (couldn't launch — the path is included).
#[tauri::command]
pub fn install_update(
    app: AppHandle,
    asset_url: String,
    asset_name: String,
) -> Result<String, String> {
    // Guard the file name: no path separators, so a crafted asset name can't
    // escape the cache dir.
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

    let status = Command::new("curl")
        .args(["-L", "--fail", "-o"])
        .arg(&dest)
        .arg(&asset_url)
        .status()
        .map_err(|e| format!("couldn't run curl: {e}"))?;
    if !status.success() {
        return Err("failed to download the update".into());
    }
    let path = dest.to_string_lossy().to_string();

    #[cfg(target_os = "linux")]
    {
        // pkexec shows the desktop's graphical password prompt (polkit).
        match Command::new("pkexec")
            .args(["apt-get", "install", "-y"])
            .arg(&dest)
            .status()
        {
            Ok(s) if s.success() => Ok("installed".into()),
            // Non-zero (e.g. user cancelled) or pkexec missing: leave the .deb
            // downloaded and let the UI point the user at it.
            _ => Ok(format!("downloaded\n{path}")),
        }
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&dest)
            .status()
            .map_err(|e| format!("couldn't open the installer: {e}"))?;
        Ok("opened".into())
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(&dest)
            .status()
            .map_err(|e| format!("couldn't launch the installer: {e}"))?;
        Ok("opened".into())
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        Ok(format!("downloaded\n{path}"))
    }
}

/// Relaunches the app so a freshly-installed update takes effect. `restart()`
/// never returns.
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}
