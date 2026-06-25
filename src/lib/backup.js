import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export async function backupNow() {
  // Returns the created file name on success.
  return invoke("backup_now");
}

export async function listBackups() {
  return invoke("list_backups");
}

// Lists .db snapshots actually present in the chosen folder (live read).
export async function listFolderBackups(dir) {
  return invoke("list_folder_backups", { dir });
}

export async function restoreBackup(fileName) {
  return invoke("restore_backup", { fileName });
}

export async function restoreFromFolder(dir, fileName) {
  return invoke("restore_from_folder", { dir, fileName });
}

// Offsite redundancy without any cloud account: copy a snapshot into a
// folder the user picked (typically a Drive/Dropbox desktop sync folder).
// Returns the full destination path on success.
export async function mirrorBackup(fileName, destDir) {
  return invoke("mirror_backup", { fileName, destDir });
}

// Opens the native folder picker; returns the chosen path, or null if
// the user cancelled.
export async function pickBackupFolder() {
  const selected = await open({ directory: true, multiple: false, title: "Choose a backup folder" });
  return typeof selected === "string" ? selected : null;
}

const MIRROR_FOLDER_KEY = "ledger.mirrorFolder";

export function getMirrorFolder() {
  return localStorage.getItem(MIRROR_FOLDER_KEY) || "";
}

export function setMirrorFolder(path) {
  if (path) localStorage.setItem(MIRROR_FOLDER_KEY, path);
  else localStorage.removeItem(MIRROR_FOLDER_KEY);
}
