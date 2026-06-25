export const css = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  :root {
    --paper: #E9EEE3;
    --paper-line: #C3D0B7;
    --ink: #1E2B22;
    --ink-soft: #4B5C49;
    --stamp: #B8862E;
    --surplus: #2E6B4D;
    --deficit: #A93E2C;
    --card: #F3F6EE;
  }
  .app { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: var(--ink); background: var(--paper); min-height: 100vh; padding: 24px 20px 60px; }
  .screen-loading { padding: 60px 20px; text-align: center; font-family: ui-sans-serif, system-ui; }

  .app-header { display:flex; gap:14px; align-items:flex-start; border-bottom:2px solid var(--ink); padding-bottom:16px; margin-bottom:16px; }
  .app-header h1 { font-family: Georgia, 'Iowan Old Style', serif; font-size:26px; margin:0 0 4px; letter-spacing:0.2px; }
  .tagline { margin:0; color: var(--ink-soft); font-size:13px; }

  .balance-strip { display:flex; gap:10px; margin-bottom:18px; flex-wrap:wrap; }
  .balance-chip { display:flex; flex-direction:column; gap:2px; background:var(--card); border:1px solid var(--paper-line); border-radius:3px; padding:8px 14px; min-width:140px; }
  .balance-chip.consolidated { background:var(--ink); border-color:var(--ink); }
  .balance-chip.consolidated .balance-chip-label { color:#C3D0B7; }
  .balance-chip.consolidated .surplus { color:#9FE3BC; }
  .balance-chip.consolidated .deficit { color:#F2A38F; }
  .balance-chip-label { font-size:10.5px; text-transform:uppercase; letter-spacing:0.5px; color:var(--ink-soft); }

  .tabs { display:flex; gap:4px; margin-bottom:22px; border-bottom:1px solid var(--paper-line); flex-wrap:wrap; }
  .tab-btn { display:flex; align-items:center; gap:6px; padding:9px 14px; background:none; border:none; cursor:pointer; font-size:13.5px; color:var(--ink-soft); border-bottom:2px solid transparent; font-family: ui-sans-serif, system-ui; }
  .tab-btn.active { color:var(--ink); border-bottom-color: var(--stamp); font-weight:600; }

  .section-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
  .section-head h2 { font-family: Georgia, serif; font-size:19px; margin:0; }

  .btn-primary { display:flex; align-items:center; gap:6px; background:var(--ink); color:var(--paper); border:none; padding:8px 13px; border-radius:3px; cursor:pointer; font-size:13px; }
  .btn-primary:hover { background: var(--ink-soft); }
  .btn-secondary { display:flex; align-items:center; gap:6px; background:none; border:1px dashed var(--ink-soft); color:var(--ink-soft); padding:6px 12px; border-radius:3px; cursor:pointer; font-size:12.5px; margin-top:6px; }
  .btn-secondary:hover { border-color: var(--ink); color: var(--ink); }
  .icon-btn { background:none; border:none; cursor:pointer; color:var(--ink-soft); padding:4px; display:flex; }
  .icon-btn:hover { color: var(--deficit); }

  .empty { color: var(--ink-soft); font-size:13.5px; font-style:italic; }
  .empty.small { font-size:12px; margin:4px 0 8px; }

  .month-filter { display:flex; align-items:center; gap:8px; margin-bottom:14px; background:var(--card); border:1px solid var(--paper-line); border-radius:3px; padding:6px 10px; }
  .month-filter-input { flex:1; border:none; background:none; font-size:13px; color:var(--ink); outline:none; font-family: ui-sans-serif, system-ui; }
  .month-filter-input::placeholder { color:var(--ink-soft); }

  .stub-summary { display:flex; gap:6px; margin-right:12px; }
  .stub-summary-chip { font-size:11px; color:var(--ink-soft); background:var(--paper); border:1px solid var(--paper-line); border-radius:10px; padding:2px 8px; font-family:ui-monospace, monospace; }

  .btn-apply-debt { font-size:11px; padding:3px 8px; background:var(--ink); color:var(--paper); border:none; border-radius:3px; cursor:pointer; white-space:nowrap; }
  .btn-apply-debt:hover { background:var(--ink-soft); }
  .debt-applied-badge { display:flex; align-items:center; gap:3px; font-size:11px; color:var(--surplus); white-space:nowrap; }

  .sticky-totals { background:var(--card); border-top:1px solid var(--paper-line); padding-top:4px; margin-top:16px; }

  .stub-row { display:flex; flex-direction:column; gap:10px; }
  .stub { background: var(--card); border:1px solid var(--paper-line); border-radius:2px; }
  .stub-head { display:flex; align-items:center; gap:10px; padding:12px 14px; cursor:pointer; }
  .stub-title { display:flex; flex-direction:column; flex:1; }
  .stub-eyebrow { font-size:10.5px; letter-spacing:1px; text-transform:uppercase; color:var(--stamp); }
  .month-title-input {
    font-family: ui-sans-serif, system-ui, sans-serif; font-weight:700; font-size:15px; color:var(--ink);
    background:none; border:1px solid transparent; border-radius:3px; padding:2px 4px; margin:-2px -4px; width:220px;
  }
  .month-title-input:hover { border-color: var(--paper-line); }
  .month-title-input:focus { border-color: var(--stamp); background:#fff; outline:none; }
  .stub-balance { display:flex; flex-direction:column; align-items:flex-end; margin-right:8px; }
  .stub-label { font-size:10.5px; color:var(--ink-soft); }
  .amount { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-weight:600; font-size:15px; }
  .amount.surplus, .surplus { color: var(--surplus); }
  .amount.deficit, .deficit { color: var(--deficit); }

  .stub-body { padding:6px 14px 18px 14px; border-top:1px solid var(--paper-line); }
  .block-title { display:flex; align-items:center; gap:6px; font-size:12.5px; text-transform:uppercase; letter-spacing:0.6px; color:var(--ink-soft); margin:16px 0 8px; }
  .sub-title { display:flex; align-items:center; gap:5px; font-size:11px; text-transform:uppercase; letter-spacing:0.4px; color:var(--stamp); margin:10px 0 6px; }

  .per-account-row { display:flex; gap:10px; margin:6px 0 14px; flex-wrap:wrap; }
  .per-account-chip { display:flex; flex-direction:column; background:#fff; border:1px solid var(--paper-line); border-radius:3px; padding:7px 12px; font-size:13px; gap:2px; }

  .pay-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:14px 0; }
  .pay-stack { display:flex; flex-direction:column; gap:8px; margin:14px 0; }
  .pay-block { background:#fff; border:1px solid var(--paper-line); border-radius:3px; }
  .pay-block-head { display:flex; align-items:center; gap:8px; padding:10px 12px; cursor:pointer; user-select:none; }
  .pay-block-head:hover { background: var(--card); border-radius:3px; }
  .pay-block-label { flex:1; font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--ink-soft); }
  .pay-block-total { font-size:14px; color:var(--ink); }
  .pay-block-body { padding:0 12px 12px; border-top:1px solid var(--paper-line); }

  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:10px 0; }
  .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin:10px 0; }
  .field { display:flex; flex-direction:column; font-size:12px; color:var(--ink-soft); gap:4px; }
  .field input, .field select { font-family: ui-monospace, monospace; padding:7px 8px; border:1px solid var(--paper-line); border-radius:2px; background:#fff; font-size:13px; }

  .ledger-row { display:flex; align-items:center; gap:8px; padding:7px 0; border-bottom:1px solid var(--paper-line); }
  .ledger-row.totals-row { font-size:13px; justify-content:space-between; border-bottom:none; border-top:1px dashed var(--paper-line); padding-top:9px; }
  .ledger-row.totals-row.final { font-weight:700; border-top:2px solid var(--ink); margin-top:4px; }
  .row-name { flex:1; font-size:13.5px; display:flex; align-items:center; gap:6px; }
  .mono { font-family: ui-monospace, monospace; }
  .small-label { font-size:11px; color:var(--ink-soft); }

  .slot-pill { font-size:10px; background:var(--paper); border:1px solid var(--paper-line); border-radius:8px; padding:1px 6px; color:var(--ink-soft); }
  .chip-slot { font-size:9.5px; opacity:0.6; }

  .check { width:20px; height:20px; border:1px solid var(--ink-soft); border-radius:3px; background:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--surplus); flex-shrink:0; }

  .scroll-panel {
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--paper-line);
    border-radius: 3px;
    padding: 2px 8px;
    background: #fff;
    scrollbar-width: thin;
  }
  .scroll-panel .ledger-row:last-child { border-bottom: none; }
  .scroll-panel::-webkit-scrollbar { width: 8px; }
  .scroll-panel::-webkit-scrollbar-thumb { background: var(--paper-line); border-radius: 4px; }
  .scroll-panel-empty { padding: 6px 0; }
  .scroll-panel-label { display:flex; align-items:center; gap:4px; font-size:10.5px; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.4px; padding:4px 0 2px; }
  .amount-input { width:90px; font-family:ui-monospace, monospace; text-align:right; padding:6px 7px; border:1px solid var(--paper-line); border-radius:2px; background:#fff; }
  .date-input { width:126px; font-family:ui-monospace, monospace; font-size:12px; padding:6px 6px; border:1px solid var(--paper-line); border-radius:2px; background:#fff; }
  .day-input { width:60px; font-family:ui-monospace, monospace; text-align:center; padding:6px; border:1px solid var(--paper-line); border-radius:2px; background:#fff; }
  .text-input { flex:1; width:100%; padding:6px 8px; border:1px solid var(--paper-line); border-radius:2px; background:#fff; font-size:13px; box-sizing:border-box; }
  .tag-input { flex:0 0 110px; }
  .account-select { font-size:12px; padding:6px 7px; border:1px solid var(--paper-line); border-radius:2px; background:#fff; max-width:150px; }

  .quick-add { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:8px; font-size:12px; color:var(--ink-soft); }
  .chip { display:flex; align-items:center; gap:4px; background:#fff; border:1px solid var(--paper-line); border-radius:12px; padding:4px 10px; font-size:12px; cursor:pointer; color:var(--ink); }
  .chip:hover { border-color: var(--stamp); }

  .card-list { display:flex; flex-direction:column; gap:10px; }
  .bill-card { display:grid; grid-template-columns:1fr 1fr 60px 90px 80px 100px 36px 28px; gap:8px; align-items:center; background:var(--card); border:1px solid var(--paper-line); padding:10px; border-radius:2px; }
  .bill-card-header { background:none; border:none; font-size:11px; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.4px; padding:0 10px; }
  .bill-card select { padding:6px; border:1px solid var(--paper-line); border-radius:2px; background:#fff; font-size:12.5px; width:100%; }

  .goal-card, .debt-card { background:var(--card); border:1px solid var(--paper-line); border-radius:2px; padding:14px; }
  .consolidated-card { background:var(--ink); border-color:var(--ink); color:#fff; }
  .consolidated-card .amount.surplus { color:#9FE3BC; }
  .consolidated-card .amount.deficit { color:#F2A38F; }
  .debt-top { display:flex; gap:8px; align-items:center; margin-bottom:4px; }

  .progress-track { position:relative; height:26px; background:#fff; border:1px solid var(--paper-line); border-radius:13px; overflow:hidden; margin-top:6px; }
  .progress-fill { position:absolute; left:0; top:0; bottom:0; background:var(--stamp); opacity:0.55; }
  .progress-label { position:relative; z-index:1; font-size:12px; line-height:26px; padding-left:10px; color:var(--ink); }

  .history-table { width:100%; margin-top:12px; font-size:12.5px; border-collapse:collapse; }
  .history-table th { text-align:right; color:var(--ink-soft); font-weight:500; padding:5px 6px; border-bottom:1px solid var(--ink); }
  .history-table th:first-child, .history-table td:first-child { text-align:left; }
  .history-table td { text-align:right; padding:5px 6px; border-bottom:1px solid var(--paper-line); }

  .backup-row { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
  .backup-msg { font-size:12px; color:var(--ink-soft); }
  .backup-list { list-style:none; padding:0; margin:6px 0 0; font-size:12px; }
  .backup-list li { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid var(--paper-line); }

`;
