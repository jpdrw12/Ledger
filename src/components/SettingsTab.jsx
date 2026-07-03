import React, { useState } from "react";
import { FolderSync, Trash2, Archive, Sun, Moon, Monitor, Users, Plus, Download, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { closeDb } from "../lib/db.js";
import { invoke } from "@tauri-apps/api/core";
import { PROFILE_SLOTS, activeProfileDb, getProfiles, saveProfiles, addProfile, setActiveProfile, removeProfile } from "../lib/profiles.js";
import { parseChangelog, notesSince } from "../lib/update.js";
import changelogText from "../../CHANGELOG.md?raw";
import { useToast } from "./Toast.jsx";

const THEMES = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
];

const SCALE_OPTIONS = [50, 60, 70, 75, 80, 90, 100, 110, 125, 150];
const DEFAULT_SCALE = 75;

// Swatch colors mirror the per-theme accents in styles.js (data-accent).
const ACCENTS = [
  { id: "red", color: "#C0392B" },
  { id: "blue", color: "#2C6EA5" },
  { id: "yellow", color: "#C99A12" },
  { id: "orange", color: "#C96A1E" },
  { id: "green", color: "#2E6B4D" },
  { id: "purple", color: "#6B4D9E" },
];

// Consolidated preferences: theme, offsite backup folder, and the
// auto-archive retention policy. All state lives in App; this is presentation.
function SettingsTab({
  theme, onThemeChange,
  uiScale, onScaleChange, onResetScale,
  accent, onAccentChange,
  containScroll, onContainScrollChange,
  mirrorFolder, onChooseFolder, onClearFolder, onCopyAllToFolder,
  retention, onRetentionChange,
  appVersion, updateInfo, hasUpdate, updateBusy, updatePhase, updateError,
  onCheckUpdate, onInstallUpdate, onRestart,
}) {
  const { confirm, toast } = useToast();
  const [profiles, setProfiles] = useState(getProfiles);
  const [newProfileName, setNewProfileName] = useState("");
  const [showChangelog, setShowChangelog] = useState(false);
  const [installed, setInstalled] = useState(false); // update installed → offer restart
  const active = activeProfileDb();

  // "What's new" preview: notes for every version newer than the running one,
  // parsed from the CHANGELOG.md fetched with the update check.
  const whatsNew = hasUpdate ? notesSince(parseChangelog(updateInfo.changelogMd), appVersion) : "";
  // Full history from the bundled changelog (works offline).
  const changelogSections = parseChangelog(changelogText);

  const doInstall = async () => {
    const status = await onInstallUpdate();
    // On "installed" the app auto-restarts; only surface a manual Restart button
    // as a fallback if that somehow didn't happen.
    if (status === "installed") setInstalled(true);
  };

  const phaseLabel =
    updatePhase === "downloading" ? "Downloading update…"
    : updatePhase === "installing" ? "Installing… you may be asked for your password"
    : updatePhase === "restarting" ? "Update installed — restarting…"
    : null;

  const renameProfile = (slot, name) => {
    const next = { ...profiles, [slot]: name.trim() || profiles[slot] };
    setProfiles(next);
    saveProfiles(next);
  };
  const createProfile = () => {
    const name = newProfileName.trim();
    if (!name) return;
    const slot = addProfile(name);
    if (!slot) return; // all slots taken (button is hidden then anyway)
    setProfiles(getProfiles());
    setNewProfileName("");
  };
  const switchProfile = async (slot) => {
    if (slot === active) return;
    if (!(await confirm(`Switch to "${profiles[slot]}"? The app will reload with that profile's ledger.`, { confirmLabel: "Switch" }))) return;
    await closeDb();
    setActiveProfile(slot);
    sessionStorage.setItem("ledger.skipPicker", "1"); // explicit choice — skip the startup picker on this reload
    window.location.reload();
  };
  const slotsFree = PROFILE_SLOTS.some((s) => !profiles[s]);

  // Deleting a profile erases its whole database — double confirmation, and
  // never the active profile or the primary slot.
  const deleteProfile = async (slot) => {
    const name = profiles[slot];
    if (!(await confirm(`Delete the profile "${name}"? Its entire ledger — accounts, months, cards, everything — will be permanently erased. Backups of it are kept.`, { danger: true, confirmLabel: "Continue" }))) return;
    if (!(await confirm(`Really delete "${name}"? This cannot be undone.`, { danger: true, confirmLabel: "Delete profile" }))) return;
    try {
      await invoke("delete_profile_db", { dbFile: slot });
      removeProfile(slot);
      setProfiles(getProfiles());
      toast(`Profile "${name}" deleted.`, "success");
    } catch (e) {
      toast(`Couldn't delete profile: ${e}`, "error");
    }
  };

  return (
    <div className="section">
      <div className="section-head">
        <h2>Settings</h2>
      </div>

      <h4 className="block-title"><Download size={13} /> Updates</h4>
      <div className="insight-card">
        <div className="backup-folder" style={{ marginTop: 0 }}>
          <span className="small-label" style={{ flex: 1 }}>
            Current version <span className="mono">v{appVersion}</span>
          </span>
          <button className="btn-secondary" onClick={onCheckUpdate} disabled={updateBusy}>
            <RefreshCw size={13} /> {updateBusy ? "Checking…" : "Check now"}
          </button>
        </div>

        {updateError && <p className="empty small" style={{ color: "var(--deficit)" }}>{updateError}</p>}
        {!updateError && !updateBusy && updateInfo && !hasUpdate && (
          <p className="empty small">You're on the latest version (v{updateInfo.latestVersion}).</p>
        )}

        {hasUpdate && (
          <>
            <p className="empty small" style={{ marginTop: 4 }}>
              <strong>Update available: v{updateInfo.latestVersion}</strong>
            </p>
            {whatsNew && (
              <div className="changelog-preview">
                <div className="small-label" style={{ marginBottom: 6 }}>What's new</div>
                <pre className="changelog-body">{whatsNew}</pre>
              </div>
            )}
            {phaseLabel ? (
              <div className="update-progress">
                <div className="update-progress-bar"><div className="update-progress-fill" /></div>
                <span className="small-label">{phaseLabel}</span>
              </div>
            ) : (
              <div className="backup-folder">
                {installed ? (
                  <button className="btn-primary" onClick={onRestart}>
                    <RefreshCw size={13} /> Restart now
                  </button>
                ) : (
                  <button className="btn-primary" onClick={doInstall} disabled={updateBusy}>
                    <Download size={13} /> Install v{updateInfo.latestVersion}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        <div className="changelog-toggle" onClick={() => setShowChangelog((s) => !s)}>
          {showChangelog ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="small-label">Changelog history</span>
        </div>
        {showChangelog && (
          <div className="changelog-history">
            {changelogSections.map((s) => (
              <div key={s.version} className="changelog-entry">
                <div className="changelog-version mono">
                  v{s.version}
                  {s.version === appVersion && <span className="excluded-tag" style={{ marginLeft: 8 }}>current</span>}
                </div>
                <pre className="changelog-body">{s.body}</pre>
              </div>
            ))}
            {changelogSections.length === 0 && <p className="empty small">No changelog found.</p>}
          </div>
        )}
      </div>

      <h4 className="block-title">Appearance</h4>
      <div className="insight-card">
        <div className="backup-folder">
          <span className="small-label" style={{ flex: 1 }}>Theme</span>
          <div className="seg-group">
            {THEMES.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={"seg-btn" + (theme === id ? " selected" : "")}
                onClick={() => onThemeChange(id)}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className="backup-folder" style={{ marginTop: 10 }}>
          <span className="small-label" style={{ flex: 1 }}>UI scale</span>
          <select value={uiScale} onChange={(e) => onScaleChange(Number(e.target.value))}>
            {SCALE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}%{s === DEFAULT_SCALE ? " (default)" : ""}</option>
            ))}
          </select>
          <button className="btn-secondary" onClick={onResetScale} disabled={uiScale === DEFAULT_SCALE}>
            Reset to default
          </button>
        </div>
        <div className="backup-folder" style={{ marginTop: 10 }}>
          <span className="small-label" style={{ flex: 1 }}>Color theme</span>
          <div className="swatch-row">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className={"swatch" + (accent === a.id ? " selected" : "")}
                style={{ background: a.color }}
                onClick={() => onAccentChange(a.id)}
                title={a.id.charAt(0).toUpperCase() + a.id.slice(1)}
                aria-label={a.id}
              />
            ))}
          </div>
        </div>
        <div className="backup-folder" style={{ marginTop: 10 }}>
          <span className="small-label" style={{ flex: 1 }}>Scrolling</span>
          <label className="exclude-toggle">
            <input
              type="checkbox"
              checked={containScroll}
              onChange={(e) => onContainScrollChange(e.target.checked)}
            />
            Keep scrolling inside a section (don't scroll the page at its end)
          </label>
        </div>
      </div>

      <h4 className="block-title"><Users size={13} /> Profiles</h4>
      <div className="insight-card">
        <p className="empty small" style={{ marginTop: 0 }}>
          Each profile is a completely separate ledger — its own accounts, months, cards, and backups.
          Switching reloads the app with that profile's data.
        </p>
        {PROFILE_SLOTS.filter((s) => profiles[s]).map((slot) => (
          <div className="backup-folder" key={slot}>
            <input
              className="text-input"
              style={{ maxWidth: 220 }}
              defaultValue={profiles[slot]}
              onBlur={(e) => renameProfile(slot, e.target.value)}
            />
            {slot === active ? (
              <span className="excluded-tag">active</span>
            ) : (
              <>
                <button className="btn-secondary" onClick={() => switchProfile(slot)}>Switch</button>
                {slot !== PROFILE_SLOTS[0] && (
                  <button className="icon-btn" title="Delete this profile and its entire ledger" onClick={() => deleteProfile(slot)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
        {slotsFree && (
          <div className="backup-folder">
            <input
              className="text-input"
              style={{ maxWidth: 220 }}
              placeholder="New profile name"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
            />
            <button className="btn-secondary" onClick={createProfile} disabled={!newProfileName.trim()}>
              <Plus size={13} /> Add profile
            </button>
          </div>
        )}
      </div>

      <h4 className="block-title">Offsite backup folder</h4>
      <div className="insight-card">
        <p className="empty small" style={{ marginTop: 0 }}>
          Point at a Google Drive or Dropbox desktop sync folder and every backup
          is also copied there. Plain file copy — no accounts, no sign-in.
        </p>
        <div className="backup-folder">
          <FolderSync size={15} />
          {mirrorFolder ? (
            <>
              <span className="mono backup-folder-path" title={mirrorFolder}>{mirrorFolder}</span>
              <button className="btn-secondary" onClick={onChooseFolder}>Change</button>
              <button className="btn-secondary" onClick={onCopyAllToFolder}>Copy existing here</button>
              <button className="icon-btn" title="Stop copying backups offsite" onClick={onClearFolder}>
                <Trash2 size={14} />
              </button>
            </>
          ) : (
            <button className="btn-secondary" onClick={onChooseFolder}>
              <FolderSync size={13} /> Choose backup folder…
            </button>
          )}
        </div>
      </div>

      <h4 className="block-title">Auto-archive</h4>
      <div className="insight-card">
        <div className="backup-folder">
          <Archive size={15} />
          <label className="retention-toggle">
            <input
              type="checkbox"
              checked={retention.enabled}
              onChange={(e) => onRetentionChange({ enabled: e.target.checked })}
            />
            Keep the last
          </label>
          <input
            className="day-input"
            type="number"
            min="1"
            value={retention.keepMonths}
            disabled={!retention.enabled}
            onChange={(e) => onRetentionChange({ keepMonths: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          />
          <span className="small-label">months active; older months move to the archive (not deleted).</span>
        </div>
      </div>
    </div>
  );
}

export default React.memo(SettingsTab);
