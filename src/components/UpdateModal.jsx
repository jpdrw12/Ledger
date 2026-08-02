import React, { useEffect } from "react";
import { X } from "lucide-react";
import UpdatePanel from "./UpdatePanel.jsx";

// Popup shown when the person clicks the "↑ vX.Y.Z" badge in the header —
// same install flow as Settings > Updates, but front and center instead of
// requiring a trip to Settings first. Closing it (backdrop click, Escape,
// or "Not now") doesn't cancel an in-progress install — that keeps running
// in the background either way, same as it already does from Settings.
function UpdateModal({ appVersion, updateInfo, updateBusy, updatePhase, onInstallUpdate, onRestart, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!updateInfo) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card update-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="update-modal-head">
          <strong>Update available: v{updateInfo.latestVersion}</strong>
          <button className="update-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="empty small" style={{ marginTop: 2, marginBottom: 12 }}>You're on v{appVersion}.</p>

        <UpdatePanel
          appVersion={appVersion}
          updateInfo={updateInfo}
          updateBusy={updateBusy}
          updatePhase={updatePhase}
          onInstallUpdate={onInstallUpdate}
          onRestart={onRestart}
        />

        {!updatePhase && (
          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button className="btn-secondary" onClick={onClose}>Not now</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(UpdateModal);
