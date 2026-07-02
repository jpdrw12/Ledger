// Shared delete-with-undo flow: perform the delete, refresh, and offer an
// Undo action on the toast that re-inserts the snapshot and refreshes again.
// `doRestore` must fully restore what `doDelete` removed (original ids), so
// undo is invisible to the rest of the app.
export async function undoableDelete({ label, doDelete, doRestore, onChanged, toast }) {
  await doDelete();
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
