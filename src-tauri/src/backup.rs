use chrono::Local;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Where the live database lives: <app_data_dir>/ledger.db
/// (this matches the "sqlite:ledger.db" path tauri-plugin-sql resolves to)
fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
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

/// Lists local backup snapshots, most recent first.
#[tauri::command]
pub fn list_backups(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = backups_dir(&app)?;
    let mut names: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| format!("could not read backups dir: {e}"))?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.ends_with(".db"))
        .collect();
    names.sort();
    names.reverse();
    Ok(names)
}

/// Restores a named backup over the live database.
///
/// IMPORTANT: the SQL plugin holds an open connection to the live file.
/// Call this only right before quitting the app, and prompt the user to
/// restart afterwards — overwriting a file out from under an open
/// SQLite connection is asking for trouble on some platforms.
#[tauri::command]
pub fn restore_backup(app: AppHandle, file_name: String) -> Result<(), String> {
    let dest = db_path(&app)?;
    let source = backups_dir(&app)?.join(&file_name);
    if !source.exists() {
        return Err(format!("backup file not found: {file_name}"));
    }
    fs::copy(&source, &dest).map_err(|e| format!("restore failed: {e}"))?;
    Ok(())
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
