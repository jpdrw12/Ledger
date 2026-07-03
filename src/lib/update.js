import { invoke } from "@tauri-apps/api/core";

// ---- Tauri command wrappers ------------------------------------------------

// Returns { latestVersion, changelogMd, assetUrl, assetName } or throws.
export async function checkForUpdate() {
  const info = await invoke("check_for_update");
  // Rust returns snake_case; map to the camelCase the app uses everywhere else.
  return {
    latestVersion: info.latest_version,
    changelogMd: info.changelog_md,
    assetUrl: info.asset_url,
    assetName: info.asset_name,
  };
}

// Downloads + installs the update. Resolves to a status string:
// "installed" | "opened" | "downloaded\n<path>".
export function installUpdate(assetUrl, assetName) {
  return invoke("install_update", { assetUrl, assetName });
}

export function restartApp() {
  return invoke("restart_app");
}

// ---- Pure helpers (unit-tested) --------------------------------------------

// Compares two dotted numeric versions. Returns -1 if a < b, 1 if a > b, 0 if
// equal. Missing segments count as 0 ("1.2" === "1.2.0"). Non-numeric junk in a
// segment is treated as 0 so a malformed tag never throws.
export function compareVersions(a, b) {
  const pa = String(a).split(".");
  const pb = String(b).split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = parseInt(pa[i], 10) || 0;
    const nb = parseInt(pb[i], 10) || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

export function isNewer(latest, current) {
  return compareVersions(latest, current) > 0;
}

// Parses a Keep-a-Changelog style file into [{ version, body }] in document
// order. Sections are delimited by "## [x.y.z]" headers; the body is the text
// between one header and the next, trimmed. Anything before the first version
// header (the file's intro) is ignored.
export function parseChangelog(md) {
  const sections = [];
  const re = /^##\s*\[(\d+\.\d+\.\d+)\][^\n]*\n/gm;
  const matches = [...String(md || "").matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const version = matches[i][1];
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : md.length;
    sections.push({ version, body: md.slice(start, end).trim() });
  }
  return sections;
}

// Concatenates the notes for every version strictly newer than `current`,
// newest first, into a single string for the "what's new" preview. Each block
// is prefixed with its version header.
export function notesSince(sections, current) {
  return sections
    .filter((s) => isNewer(s.version, current))
    .sort((a, b) => compareVersions(b.version, a.version))
    .map((s) => `v${s.version}\n${s.body}`)
    .join("\n\n")
    .trim();
}
