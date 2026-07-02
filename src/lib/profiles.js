// User profiles: each profile is a completely separate SQLite database in the
// app config dir. The slots are fixed (they must be registered for migrations
// at compile time in src-tauri/src/main.rs); profile metadata (names) lives in
// localStorage on this machine.
export const PROFILE_SLOTS = ["ledger.db", "profile2.db", "profile3.db", "profile4.db", "profile5.db", "profile6.db"];

const ACTIVE_KEY = "ledger.profile";
const META_KEY = "ledger.profiles";

export function activeProfileDb() {
  const v = localStorage.getItem(ACTIVE_KEY);
  return PROFILE_SLOTS.includes(v) ? v : PROFILE_SLOTS[0];
}

// { "ledger.db": "JP", "profile2.db": "Britt", ... } — only claimed slots.
export function getProfiles() {
  try {
    const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");
    if (!meta[PROFILE_SLOTS[0]]) meta[PROFILE_SLOTS[0]] = "Profile 1";
    return meta;
  } catch {
    return { [PROFILE_SLOTS[0]]: "Profile 1" };
  }
}

export function saveProfiles(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function activeProfileName() {
  return getProfiles()[activeProfileDb()] || "Profile 1";
}

// Claims the next unclaimed slot with the given name; returns its db file, or
// null if all slots are taken.
export function addProfile(name) {
  const meta = getProfiles();
  const free = PROFILE_SLOTS.find((s) => !meta[s]);
  if (!free) return null;
  meta[free] = name;
  saveProfiles(meta);
  return free;
}

// Frees a slot's metadata (the DB file itself is deleted via the Rust
// delete_profile_db command). Slot 1 (ledger.db) is never removable.
export function removeProfile(dbFile) {
  if (dbFile === PROFILE_SLOTS[0]) return;
  const meta = getProfiles();
  delete meta[dbFile];
  saveProfiles(meta);
}

// Switching sets the active slot; the caller closes the db connection and
// reloads the window so everything reopens against the new file.
export function setActiveProfile(dbFile) {
  if (PROFILE_SLOTS.includes(dbFile)) localStorage.setItem(ACTIVE_KEY, dbFile);
}

// The backup-filename prefix for a profile ("ledger", "profile2", ...).
export const profileStem = (dbFile = activeProfileDb()) => dbFile.replace(/\.db$/, "");
