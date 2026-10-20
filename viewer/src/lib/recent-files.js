// Tracks the last 5 backup files opened in this browser, so the pick
// screen can show "Recently viewed" instead of starting blank every time.
//
// Two tiers, because browsers differ in what they'll let a static site do:
//  - Metadata (name/size/date) always goes in localStorage — enough to show
//    a list on every browser, including Safari/iOS.
//  - On a browser with the File System Access API (Chrome/Edge desktop —
//    window.showOpenFilePicker), the actual FileSystemFileHandle is kept in
//    IndexedDB too, so a listed entry can be reopened with one click (after
//    the browser's own re-grant permission prompt) instead of walking the
//    file picker again. Everything about the file's *content* is still
//    read fresh from disk on that reopen — nothing from the file itself is
//    cached, only the handle needed to ask to read it again.
const META_KEY = "ledger.recentFiles";
const MAX_RECENT = 5;
const DB_NAME = "ledger-viewer";
const STORE = "handles";

export function hasFileSystemAccess() {
  return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
}

function idOf(name, size, lastModified) {
  return `${name}|${size}|${lastModified}`;
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putHandle(id, handle) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getHandle(id) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export function listRecentFiles() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "[]");
  } catch {
    return [];
  }
}

// Records a just-opened file. `handle` is the FileSystemFileHandle when the
// file came from showOpenFilePicker(), or null for the plain <input
// type=file> fallback (its files can't be reopened without the user
// picking again — browsers don't expose a path for that input).
export async function recordRecentFile(file, handle) {
  const id = idOf(file.name, file.size, file.lastModified);
  const entry = {
    id,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    openedAt: Date.now(),
    hasHandle: !!handle,
  };
  const existing = listRecentFiles().filter((e) => e.id !== id);
  const next = [entry, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(META_KEY, JSON.stringify(next));
  if (handle) {
    try {
      await putHandle(id, handle);
    } catch (e) {
      console.warn("Couldn't persist file handle for quick reopen:", e);
    }
  }
}

export function removeRecentFile(id) {
  localStorage.setItem(META_KEY, JSON.stringify(listRecentFiles().filter((e) => e.id !== id)));
}
