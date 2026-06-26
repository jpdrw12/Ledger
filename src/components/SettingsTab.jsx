import React from "react";
import { FolderSync, Trash2, Archive, Sun, Moon } from "lucide-react";

// Consolidated preferences: theme, offsite backup folder, and the
// auto-archive retention policy. All state lives in App; this is presentation.
export default function SettingsTab({
  theme, onToggleTheme,
  mirrorFolder, onChooseFolder, onClearFolder, onCopyAllToFolder,
  retention, onRetentionChange,
}) {
  return (
    <div className="section">
      <div className="section-head">
        <h2>Settings</h2>
      </div>

      <h4 className="block-title">Appearance</h4>
      <div className="insight-card">
        <div className="backup-folder">
          {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
          <span className="small-label" style={{ flex: 1 }}>
            Theme: {theme === "dark" ? "Dark" : "Light"}
          </span>
          <button className="btn-secondary" onClick={onToggleTheme}>
            Switch to {theme === "dark" ? "light" : "dark"}
          </button>
        </div>
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
