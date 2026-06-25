import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

// Prompts for a save location and writes text there. Returns the path, or
// null if the user cancelled.
export async function exportTextFile(defaultName, contents) {
  const path = await save({ defaultPath: defaultName, filters: [{ name: "CSV", extensions: ["csv"] }] });
  if (!path) return null;
  await invoke("write_text_file", { path, contents });
  return path;
}

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

// --- Archiving --------------------------------------------------------
// `dir` is the chosen backup folder, or "" for the local backups dir.

// Compresses a month's loose snapshots into archive/<YYYY-MM>.zip and
// removes the originals. Returns how many were archived.
export async function archiveMonth(dir, yearMonth) {
  return invoke("archive_month", { dir, yearMonth });
}

export async function listArchives(dir) {
  return invoke("list_archives", { dir });
}

export async function listArchiveContents(dir, zipName) {
  return invoke("list_archive_contents", { dir, zipName });
}

export async function restoreFromArchive(dir, zipName, fileName) {
  return invoke("restore_from_archive", { dir, zipName, fileName });
}

export async function deleteArchive(dir, zipName) {
  return invoke("delete_archive", { dir, zipName });
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

// Auto-archive retention: keep the newest `keepMonths` months active; older
// months are compressed into the archive after each backup.
const RETENTION_KEY = "ledger.retention";

export function getRetention() {
  try {
    const raw = localStorage.getItem(RETENTION_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Bad retention setting:", e);
  }
  return { enabled: false, keepMonths: 3 };
}

export function setRetention(r) {
  localStorage.setItem(RETENTION_KEY, JSON.stringify(r));
}
