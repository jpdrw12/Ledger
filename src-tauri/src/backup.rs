use chrono::Local;
use std::collections::BTreeMap;
use std::fs;
use std::fs::File;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Where the live database lives: <app_config_dir>/<db_file>.
/// tauri-plugin-sql resolves "sqlite:<name>" relative to the app *config*
/// dir (~/.config/<id> on Linux), not the data dir — these differ on Linux,
/// so this must match the plugin or backups can't find the database.
/// `db_file` is the active profile's database (ledger.db, profile2.db, …);
/// commands take it as Option<String> defaulting to ledger.db.
fn db_path(app: &AppHandle, db_file: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("could not resolve app config dir: {e}"))?;
    Ok(dir.join(db_file))
}

/// The profile's file stem ("ledger", "profile2") — used to prefix backup
/// snapshots so profiles don't mix in the backups folder.
fn db_stem(db_file: &str) -> String {
    db_file.trim_end_matches(".db").to_string()
}

fn active_db(db_file: &Option<String>) -> String {
    db_file.clone().unwrap_or_else(|| "ledger.db".to_string())
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
pub fn backup_now(app: AppHandle, db_file: Option<String>) -> Result<String, String> {
    let db = active_db(&db_file);
    let source = db_path(&app, &db)?;
    if !source.exists() {
        return Err("No database file found yet — open the app and add some data first.".into());
    }

    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
    let file_name = format!("{}-backup-{timestamp}.db", db_stem(&db));
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
fn restore_from_path(app: &AppHandle, source: PathBuf, db: &str) -> Result<(), String> {
    if !source.exists() {
        return Err(format!("backup file not found: {}", source.display()));
    }
    let dest = db_path(app, db)?;
    fs::copy(&source, &dest).map_err(|e| format!("restore failed: {e}"))?;

    // The plugin runs in WAL mode. Any -wal/-shm left from the connection we
    // just closed belongs to the OLD database; if left in place, SQLite would
    // replay it on top of the restored file and clobber it. Remove them so the
    // restored database opens clean.
    for ext in ["-wal", "-shm"] {
        let sidecar = dest.with_file_name(format!("{db}{ext}"));
        if sidecar.exists() {
            let _ = fs::remove_file(&sidecar);
        }
    }
    Ok(())
}

/// Restores a named snapshot from the local backups dir.
#[tauri::command]
pub fn restore_backup(app: AppHandle, file_name: String, db_file: Option<String>) -> Result<(), String> {
    let source = backups_dir(&app)?.join(&file_name);
    restore_from_path(&app, source, &active_db(&db_file))
}

/// Restores a named snapshot from a chosen folder (e.g. a Drive sync folder).
#[tauri::command]
pub fn restore_from_folder(app: AppHandle, dir: String, file_name: String, db_file: Option<String>) -> Result<(), String> {
    let source = PathBuf::from(&dir).join(&file_name);
    restore_from_path(&app, source, &active_db(&db_file))
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

/// Deletes a profile's database file (plus WAL/SHM sidecars). Only the extra
/// profile slots are allowed — never ledger.db (the primary profile) and never
/// an arbitrary path. The UI double-confirms and blocks deleting the active
/// profile before calling this. Backups of the profile are left in place.
#[tauri::command]
pub fn delete_profile_db(app: AppHandle, db_file: String) -> Result<(), String> {
    const DELETABLE: [&str; 5] = ["profile2.db", "profile3.db", "profile4.db", "profile5.db", "profile6.db"];
    if !DELETABLE.contains(&db_file.as_str()) {
        return Err(format!("not a deletable profile database: {db_file}"));
    }
    let path = db_path(&app, &db_file)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("delete failed: {e}"))?;
    }
    for ext in ["-wal", "-shm"] {
        let sidecar = path.with_file_name(format!("{db_file}{ext}"));
        if sidecar.exists() {
            let _ = fs::remove_file(&sidecar);
        }
    }
    Ok(())
}

/// Writes text (e.g. a CSV export) to an arbitrary path the user chose via
/// the save dialog. Plain file write — no app dirs involved.
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| format!("could not write file: {e}"))
}

/// Reads a text file the user chose via the open dialog (e.g. a CSV to import).
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("could not read file: {e}"))
}

// ---------------------------------------------------------------------
// Archiving — compress a month's loose .db snapshots into a single
// archive/<YYYY-MM>.zip so the active list doesn't bloat. Archived
// backups stay fully restorable (extracted on demand).

/// Resolves the base backup location: empty dir means the local backups
/// dir, otherwise the chosen folder.
fn resolve_base(app: &AppHandle, dir: &str) -> Result<PathBuf, String> {
    if dir.is_empty() {
        backups_dir(app)
    } else {
        let p = PathBuf::from(dir);
        if !p.is_dir() {
            return Err(format!("backup folder no longer exists: {dir}"));
        }
        Ok(p)
    }
}

fn archive_subdir(base: &PathBuf) -> Result<PathBuf, String> {
    let d = base.join("archive");
    fs::create_dir_all(&d).map_err(|e| format!("could not create archive dir: {e}"))?;
    Ok(d)
}

/// Extracts the "YYYY-MM" prefix from a backup filename
/// (ledger-backup-2026-06-25_...). Filenames are ASCII, so byte indexing
/// is safe here.
fn file_year_month(name: &str) -> Option<String> {
    let b = name.as_bytes();
    if b.len() < 7 {
        return None;
    }
    for i in 0..=b.len() - 7 {
        if b[i].is_ascii_digit()
            && b[i + 1].is_ascii_digit()
            && b[i + 2].is_ascii_digit()
            && b[i + 3].is_ascii_digit()
            && b[i + 4] == b'-'
            && b[i + 5].is_ascii_digit()
            && b[i + 6].is_ascii_digit()
        {
            return Some(name[i..i + 7].to_string());
        }
    }
    None
}

/// Bundles every loose .db backup for the given month into
/// archive/<YYYY-MM>.zip (merging into an existing zip), then deletes the
/// loose originals. Returns how many snapshots were archived.
#[tauri::command]
pub fn archive_month(app: AppHandle, dir: String, year_month: String) -> Result<usize, String> {
    let base = resolve_base(&app, &dir)?;
    let to_archive: Vec<String> = list_db_files(&base)?
        .into_iter()
        .filter(|n| file_year_month(n).as_deref() == Some(year_month.as_str()))
        .collect();
    if to_archive.is_empty() {
        return Ok(0);
    }

    let adir = archive_subdir(&base)?;
    let zip_path = adir.join(format!("{year_month}.zip"));

    // The zip crate can't append in place: read any existing entries, add the
    // new ones, and rewrite. BTreeMap dedupes by name (timestamped, so safe).
    let mut entries: BTreeMap<String, Vec<u8>> = BTreeMap::new();
    if zip_path.exists() {
        let f = File::open(&zip_path).map_err(|e| format!("open archive failed: {e}"))?;
        let mut zr = zip::ZipArchive::new(f).map_err(|e| format!("read archive failed: {e}"))?;
        for i in 0..zr.len() {
            let mut zf = zr
                .by_index(i)
                .map_err(|e| format!("read archive entry failed: {e}"))?;
            let name = zf.name().to_string();
            let mut buf = Vec::new();
            zf.read_to_end(&mut buf)
                .map_err(|e| format!("read archive entry failed: {e}"))?;
            entries.insert(name, buf);
        }
    }
    for name in &to_archive {
        let bytes = fs::read(base.join(name)).map_err(|e| format!("read backup failed: {e}"))?;
        entries.insert(name.clone(), bytes);
    }

    // Write to a temp file, then atomically replace the real zip.
    let tmp_path = adir.join(format!("{year_month}.zip.tmp"));
    {
        let tf = File::create(&tmp_path).map_err(|e| format!("create archive failed: {e}"))?;
        let mut zw = zip::ZipWriter::new(tf);
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (name, bytes) in &entries {
            zw.start_file(name, opts)
                .map_err(|e| format!("write archive entry failed: {e}"))?;
            zw.write_all(bytes)
                .map_err(|e| format!("write archive entry failed: {e}"))?;
        }
        zw.finish().map_err(|e| format!("finalize archive failed: {e}"))?;
    }
    fs::rename(&tmp_path, &zip_path).map_err(|e| format!("replace archive failed: {e}"))?;

    let count = to_archive.len();
    for name in &to_archive {
        let _ = fs::remove_file(base.join(name));
    }
    Ok(count)
}

/// Lists archive zips (YYYY-MM.zip) in the active location, newest first.
#[tauri::command]
pub fn list_archives(app: AppHandle, dir: String) -> Result<Vec<String>, String> {
    let base = resolve_base(&app, &dir)?;
    let adir = base.join("archive");
    if !adir.is_dir() {
        return Ok(vec![]);
    }
    let mut names: Vec<String> = fs::read_dir(&adir)
        .map_err(|e| format!("could not read archive dir: {e}"))?
        .filter_map(|e| e.ok())
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| n.ends_with(".zip"))
        .collect();
    names.sort();
    names.reverse();
    Ok(names)
}

/// Lists the .db snapshots inside one archive zip, newest first.
#[tauri::command]
pub fn list_archive_contents(
    app: AppHandle,
    dir: String,
    zip_name: String,
) -> Result<Vec<String>, String> {
    let base = resolve_base(&app, &dir)?;
    let zip_path = base.join("archive").join(&zip_name);
    let f = File::open(&zip_path).map_err(|e| format!("open archive failed: {e}"))?;
    let mut zr = zip::ZipArchive::new(f).map_err(|e| format!("read archive failed: {e}"))?;
    let mut names: Vec<String> = (0..zr.len())
        .filter_map(|i| zr.by_index(i).ok().map(|zf| zf.name().to_string()))
        .filter(|n| n.ends_with(".db"))
        .collect();
    names.sort();
    names.reverse();
    Ok(names)
}

/// Extracts one snapshot from an archive zip and restores it over the live
/// database (same close/reopen flow as restore_backup — see that fn).
#[tauri::command]
pub fn restore_from_archive(
    app: AppHandle,
    dir: String,
    zip_name: String,
    file_name: String,
    db_file: Option<String>,
) -> Result<(), String> {
    let base = resolve_base(&app, &dir)?;
    let zip_path = base.join("archive").join(&zip_name);
    let f = File::open(&zip_path).map_err(|e| format!("open archive failed: {e}"))?;
    let mut zr = zip::ZipArchive::new(f).map_err(|e| format!("read archive failed: {e}"))?;
    let mut zf = zr
        .by_name(&file_name)
        .map_err(|_| format!("not found in archive: {file_name}"))?;
    let mut buf = Vec::new();
    zf.read_to_end(&mut buf)
        .map_err(|e| format!("read archive entry failed: {e}"))?;

    let db = active_db(&db_file);
    let tmp = db_path(&app, &db)?.with_file_name("restore-from-archive.tmp.db");
    fs::write(&tmp, &buf).map_err(|e| format!("extract failed: {e}"))?;
    let result = restore_from_path(&app, tmp.clone(), &db);
    let _ = fs::remove_file(&tmp);
    result
}

/// Permanently deletes an archive zip. UI confirms before calling this.
#[tauri::command]
pub fn delete_archive(app: AppHandle, dir: String, zip_name: String) -> Result<(), String> {
    let base = resolve_base(&app, &dir)?;
    let zip_path = base.join("archive").join(&zip_name);
    if zip_path.exists() {
        fs::remove_file(&zip_path).map_err(|e| format!("delete archive failed: {e}"))?;
    }
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
