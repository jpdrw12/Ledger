import { invoke } from "@tauri-apps/api/core";

export async function backupNow() {
  // Returns the created file name on success.
  return invoke("backup_now");
}

export async function listBackups() {
  return invoke("list_backups");
}

export async function restoreBackup(fileName) {
  return invoke("restore_backup", { fileName });
}

// backupToDrive() isn't wired up yet — see the notes in
// src-tauri/src/backup.rs for what it takes (your own Google Cloud
// OAuth client). Once that command exists on the Rust side, this
// becomes a one-line invoke() call exactly like the ones above.
