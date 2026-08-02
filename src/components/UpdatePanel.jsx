import React from "react";
import { Download, RefreshCw } from "lucide-react";
import { parseChangelog, notesSince } from "../lib/update.js";

// The "update available" content: what's-new notes since the running
// version, the install button, and download/install progress. Shared
// between SettingsTab (inline, under Updates) and UpdateModal (the popup
// triggered from the header badge) so the two can't drift out of sync.
function UpdatePanel({ appVersion, updateInfo, updateBusy, updatePhase, onInstallUpdate, onRestart }) {
  const whatsNew = notesSince(parseChangelog(updateInfo.changelogMd), appVersion);
  const phaseLabel =
    updatePhase === "downloading" ? "Downloading update…"
    : updatePhase === "installing" ? "Installing… you may be asked for your password"
    : updatePhase === "restarting" ? "Update installed — restarting…"
    : null;

  return (
    <>
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
          {updatePhase === "restarting" && (
            <button className="btn-secondary" onClick={onRestart}>
              <RefreshCw size={13} /> Restart now
            </button>
          )}
        </div>
      ) : (
        <div className="backup-folder">
          <button className="btn-primary" onClick={onInstallUpdate} disabled={updateBusy}>
            <Download size={13} /> Install v{updateInfo.latestVersion}
          </button>
        </div>
      )}
    </>
  );
}

export default React.memo(UpdatePanel);
