use chrono::Local;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Where the live database lives: <app_config_dir>/ledger.db
/// tauri-plugin-sql resolves "sqlite:ledger.db" relative to the app
/// *config* dir (~/.config/<id> on Linux), not the data dir — these
/// differ on Linux, so this must match the plugin or backups can't
/// find the database.
fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("could not resolve app config dir: {e}"))?;
    Ok(dir.join("ledger.db"))
}

fn backups_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?
        .join("backups");
    fs::create_dir_all(&dir).map_err(|e| format!("could not create backups dir: {e}"))?;
    Ok(dir)
}

/// Copies the live database to a timestamped file inside the local
/// backups folder. This never touches the live file in place — it only
/// ever reads a snapshot of it, so a backup can never corrupt the
/// working database.
#[tauri::command]
pub fn backup_now(app: AppHandle) -> Result<String, String> {
    let source = db_path(&app)?;
    if !source.exists() {
        return Err("No database file found yet — open the app and add some data first.".into());
    }

    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
    let file_name = format!("ledger-backup-{timestamp}.db");
    let dest = backups_dir(&app)?.join(&file_name);

    fs::copy(&source, &dest).map_err(|e| format!("backup failed: {e}"))?;

    Ok(file_name)
}

/// Lists .db snapshots in a directory, most recent first (by name, which
/// is timestamped). Shared by the local-dir and chosen-folder listings.
fn list_db_files(dir: &PathBuf) -> Result<Vec<String>, String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .map_err(|e| format!("could not read folder: {e}"))?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.ends_with(".db"))
        .collect();
    names.sort();
    names.reverse();
    Ok(names)
}

/// Lists local backup snapshots, most recent first.
#[tauri::command]
pub fn list_backups(app: AppHandle) -> Result<Vec<String>, String> {
    list_db_files(&backups_dir(&app)?)
}

/// Lists backup snapshots in a chosen folder (e.g. a Drive sync folder),
/// most recent first. Returns an empty list if the folder is gone.
#[tauri::command]
pub fn list_folder_backups(dir: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&dir);
    if !path.is_dir() {
        return Ok(vec![]);
    }
    list_db_files(&path)
}

/// Copies a snapshot over the live database, then clears stale WAL sidecars.
///
/// IMPORTANT: the SQL plugin holds an open connection to the live file.
/// The caller (handleRestore in App.jsx) closes that connection via
/// db.closeDb() before invoking this, then reopens and reloads — so the
/// file is not being copied out from under a live connection. Don't call
/// this without closing the connection first.
fn restore_from_path(app: &AppHandle, source: PathBuf) -> Result<(), String> {
    if !source.exists() {
        return Err(format!("backup file not found: {}", source.display()));
    }
    let dest = db_path(app)?;
    fs::copy(&source, &dest).map_err(|e| format!("restore failed: {e}"))?;

    // The plugin runs in WAL mode. Any -wal/-shm left from the connection we
    // just closed belongs to the OLD database; if left in place, SQLite would
    // replay it on top of the restored file and clobber it. Remove them so the
    // restored ledger.db opens clean.
    for ext in ["-wal", "-shm"] {
        let sidecar = dest.with_file_name(format!("ledger.db{ext}"));
        if sidecar.exists() {
            let _ = fs::remove_file(&sidecar);
        }
    }
    Ok(())
}

/// Restores a named snapshot from the local backups dir.
#[tauri::command]
pub fn restore_backup(app: AppHandle, file_name: String) -> Result<(), String> {
    let source = backups_dir(&app)?.join(&file_name);
    restore_from_path(&app, source)
}

/// Restores a named snapshot from a chosen folder (e.g. a Drive sync folder).
#[tauri::command]
pub fn restore_from_folder(app: AppHandle, dir: String, file_name: String) -> Result<(), String> {
    let source = PathBuf::from(&dir).join(&file_name);
    restore_from_path(&app, source)
}

/// Copies an existing local backup snapshot into an external folder
/// (e.g. a Google Drive or Dropbox desktop sync folder) for offsite
/// redundancy. This is a plain file copy — no network, no credentials,
/// no tokens. The "cloud" part is whatever sync client owns that folder.
#[tauri::command]
pub fn mirror_backup(app: AppHandle, file_name: String, dest_dir: String) -> Result<String, String> {
    let source = backups_dir(&app)?.join(&file_name);
    if !source.exists() {
        return Err(format!("backup file not found: {file_name}"));
    }
    let dir = PathBuf::from(&dest_dir);
    if !dir.is_dir() {
        return Err(format!("backup folder no longer exists: {dest_dir}"));
    }
    let dest = dir.join(&file_name);
    fs::copy(&source, &dest).map_err(|e| format!("copy to backup folder failed: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

// ---------------------------------------------------------------------
// Google Drive upload — intentionally left as a stub.
//
// This needs credentials only you can create (a free Google Cloud
// project + OAuth client ID for a "Desktop app"), so it can't be wired
// up generically. The shape of it, when you're ready:
//
//   1. Request only the `drive.file` scope (the app only ever sees
//      files it created, not your whole Drive — keeps this out of
//      Google's stricter verification requirements).
//   2. Use the "installed app" / loopback OAuth flow: open the
//      system browser to Google's consent screen, run a tiny local
//      HTTP listener on localhost to catch the redirect with the
//      auth code, then exchange it for tokens.
//   3. Set the OAuth consent screen's publishing status to
//      "Production" (you'll click through one "unverified app"
//      warning) — leaving it in "Testing" mode expires your refresh
//      token every 7 days, which means re-logging in weekly.
//   4. Store the refresh token in the OS keychain
//      (the `keyring` crate works well from Rust) rather than in
//      the SQLite database itself.
//   5. On `backup_now`, after writing the local snapshot, also
//      stream that same file to Drive's `files.create` endpoint via
//      a multipart upload, then log the upload in the `backups`
//      table with destination = 'google_drive'.
//
// #[tauri::command]
// pub async fn backup_to_drive(app: AppHandle) -> Result<(), String> {
//     todo!("OAuth + Drive upload — see notes above")
// }
