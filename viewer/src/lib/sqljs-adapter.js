import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

// Wraps a sql.js in-memory Database behind the same { select(), execute() }
// shape @tauri-apps/plugin-sql's Database exposes — db.js's own test seam
// (__setTestDb) exists for exactly this, so the real db.js runs completely
// unmodified against a backup file loaded in the browser.
//
// All the app's SQL is written with Postgres-style "$1", "$2" placeholders.
// Those aren't positional in SQLite — "$1" is a *named* parameter (same
// family as ":name"/"@name") — so each is bound by name rather than by
// rewriting the SQL to "?" and hoping every param is used exactly once in
// order (a few queries, e.g. the accounts upsert, reuse $2 twice).
function bindObject(params) {
  const obj = {};
  (params || []).forEach((v, i) => {
    obj[`$${i + 1}`] = v === undefined ? null : v;
  });
  return obj;
}

export async function loadDatabaseFile(arrayBuffer) {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const sqljsDb = new SQL.Database(new Uint8Array(arrayBuffer));

  return {
    async select(sql, params) {
      const stmt = sqljsDb.prepare(sql);
      try {
        stmt.bind(bindObject(params));
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    async execute(sql, params) {
      // Read-only viewer: every write only ever touches this in-memory
      // copy of the loaded file, never the original backup — there is no
      // path back to disk or to Google Drive, so the source file is safe
      // to reopen and reload at any time.
      sqljsDb.run(sql, bindObject(params));
      return { rowsAffected: sqljsDb.getRowsModified(), lastInsertId: undefined };
    },
    close() {
      sqljsDb.close();
    },
  };
}
