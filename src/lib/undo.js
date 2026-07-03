// Turn a raw DB error into a short, plain-language sentence. The common one is
// a foreign-key failure from deleting something still referenced elsewhere.
export function friendlyDeleteError(err, label) {
  const text = String(err?.message || err || "");
  if (/FOREIGN KEY constraint failed/i.test(text) || /code:\s*787/.test(text)) {
    return `${label} is still in use elsewhere, so it can't be deleted. Remove or reassign what references it first.`;
  }
  return `Couldn't delete ${label.toLowerCase()}: ${text}`;
}

// Shared delete-with-undo flow: perform the delete, refresh, and offer an
// Undo action on the toast that re-inserts the snapshot and refreshes again.
// `doRestore` must fully restore what `doDelete` removed (original ids), so
// undo is invisible to the rest of the app. A failed delete (e.g. a foreign-key
// constraint) is caught and shown as a dismissable error toast rather than
// bubbling up as an unhandled rejection.
export async function undoableDelete({ label, doDelete, doRestore, onChanged, toast }) {
  try {
    await doDelete();
  } catch (err) {
    toast(friendlyDeleteError(err, label), "error");
    return;
  }
  onChanged();
  toast(`${label} deleted.`, "info", {
    actionLabel: "Undo",
    onAction: async () => {
      try {
        await doRestore();
      } finally {
        onChanged();
      }
    },
  });
}
