export const css = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  /* Theming has two independent axes: Light/Dark (data-theme) sets the
     lightness ramp, and the color (data-accent) sets --hue, which all the
     neutral surfaces below derive from via hsl(). Money colors (surplus/
     deficit) and the warning amber are kept fixed/semantic, not hue-derived. */
  :root {
    color-scheme: light;
    --hue: 142;                    /* default green; overridden per data-accent */
    --paper:      hsl(var(--hue) 30% 90%);
    --card:       hsl(var(--hue) 35% 94%);
    --paper-line: hsl(var(--hue) 28% 76%);
    --ink:        hsl(var(--hue) 40% 14%);
    --ink-soft:   hsl(var(--hue) 22% 36%);
    --control-bg: #fff;            /* light inputs stay near-white */
    --stamp: #B8862E;
    --surplus: #2E6B4D;
    --deficit: #A93E2C;
    --warn-bg: #FBF3E0;
    --warn-line: #E8D6A8;
    /* Accent is hand-tuned per color theme below (green by default here). */
    --accent: #2E6B4D;
    --accent-hover: #21503A;
    --accent-ink: #FFFFFF;
  }
  :root[data-theme="dark"] {
    /* color-scheme tells the engine to render native controls (select
       popups, checkboxes, range slider, date pickers, scrollbars) dark. */
    color-scheme: dark;
    --paper:      hsl(var(--hue) 22% 9%);
    --card:       hsl(var(--hue) 20% 14%);
    --paper-line: hsl(var(--hue) 18% 26%);
    --ink:        hsl(var(--hue) 18% 90%);
    --ink-soft:   hsl(var(--hue) 14% 62%);
    --control-bg: hsl(var(--hue) 25% 6%);
    --stamp: #D9A847;
    --surplus: #6FCF97;
    --deficit: #E07A68;
    --warn-bg: #2E2716;
    --warn-line: #4A3D1E;
  }

  /* Color themes: each sets the surface hue + a hand-tuned accent (so
     contrast is guaranteed regardless of the hsl-generated neutrals). Works
     in both Light and Dark. Yellow needs dark accent ink. */
  :root[data-accent="red"]    { --hue:6;   --accent:#C0392B; --accent-hover:#9E2E22; --accent-ink:#fff; }
  :root[data-accent="orange"] { --hue:28;  --accent:#C96A1E; --accent-hover:#A85617; --accent-ink:#fff; }
  :root[data-accent="yellow"] { --hue:46;  --accent:#C99A12; --accent-hover:#A87F0C; --accent-ink:#241E08; }
  :root[data-accent="green"]  { --hue:142; --accent:#2E6B4D; --accent-hover:#21503A; --accent-ink:#fff; }
  :root[data-accent="blue"]   { --hue:208; --accent:#2C6EA5; --accent-hover:#235984; --accent-ink:#fff; }
  :root[data-accent="purple"] { --hue:280; --accent:#6B4D9E; --accent-hover:#573E82; --accent-ink:#fff; }

  :root[data-theme="dark"] body { background: var(--paper); }
  :root[data-theme="dark"] input,
  :root[data-theme="dark"] select,
  :root[data-theme="dark"] textarea { background: var(--control-bg); color: var(--ink); }
  :root[data-theme="dark"] .progress-fill,
  :root[data-theme="dark"] .cat-bar-fill { opacity: 0.4; }
  :root[data-theme="dark"] .scroll-panel,
  :root[data-theme="dark"] .per-account-chip,
  :root[data-theme="dark"] .pay-block,
  :root[data-theme="dark"] .progress-track,
  :root[data-theme="dark"] .cat-bar-track,
  :root[data-theme="dark"] .balance-chip:not(.consolidated),
  :root[data-theme="dark"] .check,
  :root[data-theme="dark"] .chip { background: var(--control-bg); }
  :root[data-theme="dark"] .month-title-input:focus { background: var(--control-bg); }
  .app { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: var(--ink); background: var(--paper); min-height: 100vh; padding: 24px 20px 60px; }
  .screen-loading { padding: 60px 20px; text-align: center; font-family: ui-sans-serif, system-ui; }

  .app-header { display:flex; gap:14px; align-items:flex-start; border-bottom:2px solid var(--ink); padding-bottom:16px; margin-bottom:16px; }
  .app-header h1 { font-family: Georgia, 'Iowan Old Style', serif; font-size:26px; margin:0 0 4px; letter-spacing:0.2px; }
  .app-version { font-family: ui-monospace, monospace; font-size:12px; font-weight:400; color:var(--ink-soft); vertical-align:middle; margin-left:6px; }
  .update-badge { vertical-align:middle; margin-left:8px; background:var(--accent); color:#fff; border:none; border-radius:12px; padding:3px 10px; font-size:11.5px; font-weight:600; cursor:pointer; }
  .update-badge:hover { filter:brightness(1.06); }
  .changelog-preview { margin:8px 0; padding:10px 12px; background:var(--paper); border:1px solid var(--paper-line); border-radius:8px; }
  .changelog-body { margin:0; font-family:inherit; font-size:12.5px; line-height:1.5; color:var(--ink); white-space:pre-wrap; word-break:break-word; }
  .changelog-toggle { display:flex; align-items:center; gap:6px; margin-top:12px; cursor:pointer; user-select:none; }
  .changelog-history { margin-top:8px; max-height:340px; overflow:auto; }
  .changelog-entry { padding:8px 0; border-top:1px solid var(--paper-line); }
  .changelog-version { font-weight:600; margin-bottom:4px; color:var(--accent); }
  .due-chip { margin-left:auto; align-self:center; background:var(--card); border:1px solid var(--paper-line); border-radius:14px; padding:6px 12px; font-size:12.5px; cursor:pointer; color:var(--ink); }
  .due-chip:hover { border-color:var(--stamp); }
  .due-chip-over { color:var(--deficit); font-weight:600; }
  .due-chip-soon { color:var(--stamp); }
  .overdue-pill { font-size:9.5px; text-transform:uppercase; letter-spacing:0.4px; color:var(--deficit); border:1px solid var(--deficit); border-radius:8px; padding:1px 6px; margin-left:6px; }
  .tagline { margin:0; color: var(--ink-soft); font-size:13px; }

  .balance-strip { display:flex; gap:10px; margin-bottom:18px; flex-wrap:wrap; }
  .balance-chip { display:flex; flex-direction:column; gap:2px; background:var(--card); border:1px solid var(--paper-line); border-radius:3px; padding:8px 14px; min-width:140px; }
  .balance-chip.consolidated { background:var(--accent); border-color:var(--accent); }
  .balance-chip.consolidated .balance-chip-label { color:#C3D0B7; }
  .balance-chip.consolidated .surplus { color:#9FE3BC; }
  .balance-chip.consolidated .deficit { color:#F2A38F; }
  .balance-chip-label { font-size:10.5px; text-transform:uppercase; letter-spacing:0.5px; color:var(--ink-soft); }

  .tabs { display:flex; gap:4px; margin-bottom:22px; border-bottom:1px solid var(--paper-line); flex-wrap:wrap; }
  .tab-btn { display:flex; align-items:center; gap:6px; padding:9px 14px; background:none; border:none; cursor:pointer; font-size:13.5px; color:var(--ink-soft); border-bottom:2px solid transparent; font-family: ui-sans-serif, system-ui; }
  .tab-btn.active { color:var(--ink); border-bottom-color: var(--stamp); font-weight:600; }

  .section-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
  .section-head h2 { font-family: Georgia, serif; font-size:19px; margin:0; }

  .btn-primary { display:flex; align-items:center; gap:6px; background:var(--accent); color:var(--accent-ink); border:none; padding:8px 13px; border-radius:3px; cursor:pointer; font-size:13px; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-secondary { display:flex; align-items:center; gap:6px; background:none; border:1px dashed var(--ink-soft); color:var(--ink-soft); padding:6px 12px; border-radius:3px; cursor:pointer; font-size:12.5px; margin-top:6px; }
  .btn-secondary:hover { border-color: var(--ink); color: var(--ink); }
  .icon-btn { background:none; border:none; cursor:pointer; color:var(--ink-soft); padding:4px; display:flex; }
  .icon-btn:hover { color: var(--deficit); }
  .icon-btn:disabled { opacity:0.3; cursor:default; }
  .icon-btn:disabled:hover { color: var(--ink-soft); }

  .empty { color: var(--ink-soft); font-size:13.5px; font-style:italic; }
  .empty.small { font-size:12px; margin:4px 0 8px; }

  .month-filter { display:flex; align-items:center; gap:8px; margin-bottom:14px; background:var(--card); border:1px solid var(--paper-line); border-radius:3px; padding:6px 10px; }
  .month-filter-input { flex:1; border:none; background:none; font-size:13px; color:var(--ink); outline:none; font-family: ui-sans-serif, system-ui; }
  .month-filter-input::placeholder { color:var(--ink-soft); }

  .stub-summary { display:flex; gap:6px; margin-right:12px; }
  .stub-summary-chip { font-size:11px; color:var(--ink-soft); background:var(--paper); border:1px solid var(--paper-line); border-radius:10px; padding:2px 8px; font-family:ui-monospace, monospace; }

  .btn-apply-debt { font-size:11px; padding:3px 8px; background:var(--accent); color:var(--accent-ink); border:none; border-radius:3px; cursor:pointer; white-space:nowrap; }
  .btn-apply-debt:hover { background:var(--accent-hover); }
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
  .month-title-input:focus { border-color: var(--stamp); background:var(--control-bg); outline:none; }
  .stub-balance { display:flex; flex-direction:column; align-items:flex-end; margin-right:8px; }
  .stub-label { font-size:10.5px; color:var(--ink-soft); }
  .amount { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-weight:600; font-size:15px; }
  .amount.surplus, .surplus { color: var(--surplus); }
  .amount.deficit, .deficit { color: var(--deficit); }

  .stub-body { padding:6px 14px 18px 14px; border-top:1px solid var(--paper-line); }
  .block-title { display:flex; align-items:center; gap:6px; font-size:12.5px; text-transform:uppercase; letter-spacing:0.6px; color:var(--ink-soft); margin:16px 0 8px; }
  .sub-title { display:flex; align-items:center; gap:5px; font-size:11px; text-transform:uppercase; letter-spacing:0.4px; color:var(--stamp); margin:10px 0 6px; }

  .per-account-row { display:flex; gap:10px; margin:6px 0 14px; flex-wrap:wrap; }
  .per-account-chip { display:flex; flex-direction:column; background:var(--control-bg); border:1px solid var(--paper-line); border-radius:3px; padding:7px 12px; font-size:13px; gap:2px; }

  .pay-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:14px 0; }
  .pay-stack { display:flex; flex-direction:column; gap:8px; margin:14px 0; }
  .month-section { background:var(--control-bg); border:1px solid var(--paper-line); border-radius:3px; margin-top:14px; }
  .pay-block { background:var(--control-bg); border:1px solid var(--paper-line); border-radius:3px; }
  .pay-block-head { display:flex; align-items:center; gap:8px; padding:10px 12px; cursor:pointer; user-select:none; }
  .pay-block-head:hover { background: var(--card); border-radius:3px; }
  .pay-block-label { flex:1; font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--ink-soft); }
  .pay-block-total { font-size:14px; color:var(--ink); }
  .pay-block-body { padding:0 12px 12px; border-top:1px solid var(--paper-line); }

  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:10px 0; }
  .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin:10px 0; }
  .field { display:flex; flex-direction:column; font-size:12px; color:var(--ink-soft); gap:4px; }
  .field input, .field select { font-family: ui-monospace, monospace; padding:7px 8px; border:1px solid var(--paper-line); border-radius:2px; background:var(--control-bg); font-size:13px; }

  .ledger-row { display:flex; align-items:center; gap:8px; padding:7px 0; border-bottom:1px solid var(--paper-line); }
  .ledger-row.totals-row { font-size:13px; justify-content:space-between; border-bottom:none; border-top:1px dashed var(--paper-line); padding-top:9px; }
  .ledger-row.totals-row.final { font-weight:700; border-top:2px solid var(--ink); margin-top:4px; }
  .row-name { flex:1; font-size:13.5px; display:flex; align-items:center; gap:6px; }
  .mono { font-family: ui-monospace, monospace; }
  .small-label { font-size:11px; color:var(--ink-soft); }

  .slot-pill { font-size:10px; background:var(--paper); border:1px solid var(--paper-line); border-radius:8px; padding:1px 6px; color:var(--ink-soft); }
  .chip-slot { font-size:9.5px; opacity:0.6; }

  .check { width:22px; height:22px; border:2px solid var(--ink-soft); border-radius:4px; background:var(--control-bg); display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--surplus); flex-shrink:0; }
  .check:hover { border-color:var(--surplus); }
  .check.checked { background:var(--surplus); border-color:var(--surplus); color:#fff; }
  .check svg { flex-shrink:0; }

  .scroll-panel {
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--paper-line);
    border-radius: 3px;
    padding: 2px 8px;
    background: var(--control-bg);
    scrollbar-width: thin;
  }
  .scroll-panel .ledger-row:last-child { border-bottom: none; }
  .scroll-panel::-webkit-scrollbar { width: 8px; }
  .scroll-panel::-webkit-scrollbar-thumb { background: var(--paper-line); border-radius: 4px; }
  .scroll-panel-empty { padding: 6px 0; }
  .scroll-panel-label { display:flex; align-items:center; gap:4px; font-size:10.5px; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.4px; padding:4px 0 2px; }
  .amount-input { width:90px; font-family:ui-monospace, monospace; text-align:right; padding:6px 7px; border:1px solid var(--paper-line); border-radius:2px; background:var(--control-bg); }
  .date-input { width:126px; font-family:ui-monospace, monospace; font-size:12px; padding:6px 6px; border:1px solid var(--paper-line); border-radius:2px; background:var(--control-bg); }
  .day-input { width:60px; font-family:ui-monospace, monospace; text-align:center; padding:6px; border:1px solid var(--paper-line); border-radius:2px; background:var(--control-bg); }
  .text-input { flex:1; width:100%; padding:6px 8px; border:1px solid var(--paper-line); border-radius:2px; background:var(--control-bg); font-size:13px; box-sizing:border-box; }
  .tag-input { flex:0 0 110px; }
  .account-select { font-size:12px; padding:6px 7px; border:1px solid var(--paper-line); border-radius:2px; background:var(--control-bg); max-width:150px; }

  .quick-add { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:8px; font-size:12px; color:var(--ink-soft); }
  .chip { display:flex; align-items:center; gap:4px; background:var(--control-bg); border:1px solid var(--paper-line); border-radius:12px; padding:4px 10px; font-size:12px; cursor:pointer; color:var(--ink); }
  .chip:hover { border-color: var(--stamp); }

  .card-list { display:flex; flex-direction:column; gap:10px; }
  .bill-card { display:grid; grid-template-columns:1fr 1fr 60px 90px 120px 100px 36px 28px; gap:8px; align-items:center; background:var(--card); border:1px solid var(--paper-line); padding:10px; border-radius:2px; }
  .bill-card-header { background:none; border:none; font-size:11px; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.4px; padding:0 10px; }
  .bill-card select { padding:6px; border:1px solid var(--paper-line); border-radius:2px; background:var(--control-bg); font-size:12.5px; width:100%; }
  .slot-checks { display:flex; flex-direction:column; gap:2px; font-size:11.5px; color:var(--ink-soft); }
  .slot-checks label { display:flex; align-items:center; gap:5px; cursor:pointer; }
  .slot-checks input { cursor:pointer; }
  .bill-group { margin-bottom:6px; }
  .bill-group-head { display:flex; align-items:center; gap:8px; padding:8px 10px; cursor:pointer; user-select:none; font-weight:600; font-size:13px; }
  .bill-group-head:hover { background:var(--card); border-radius:3px; }
  .bill-group-name { flex:1; }
  .bill-group-count { font-size:11px; color:var(--ink-soft); background:var(--card); border:1px solid var(--paper-line); border-radius:10px; padding:1px 8px; }

  .goal-card, .debt-card { background:var(--card); border:1px solid var(--paper-line); border-radius:2px; padding:14px; }
  .consolidated-card { background:var(--accent); border-color:var(--accent); color:#fff; }
  .consolidated-card .amount.surplus { color:#9FE3BC; }
  .consolidated-card .amount.deficit { color:#F2A38F; }
  .debt-top { display:flex; gap:8px; align-items:center; margin-bottom:4px; }

  .progress-track { position:relative; height:26px; background:var(--control-bg); border:1px solid var(--paper-line); border-radius:13px; overflow:hidden; margin-top:6px; }
  .progress-fill { position:absolute; left:0; top:0; bottom:0; background:var(--stamp); opacity:0.55; }
  .progress-label { position:relative; z-index:1; font-size:12px; line-height:26px; padding-left:10px; color:var(--ink); }

  .history-table { width:100%; margin-top:12px; font-size:12.5px; border-collapse:collapse; }
  .history-table th { text-align:right; color:var(--ink-soft); font-weight:500; padding:5px 6px; border-bottom:1px solid var(--ink); }
  .history-table th:first-child, .history-table td:first-child { text-align:left; }
  .history-table td { text-align:right; padding:5px 6px; border-bottom:1px solid var(--paper-line); }

  .insight-card { background:var(--card); border:1px solid var(--paper-line); border-radius:3px; padding:14px; margin-bottom:18px; }
  .networth-row { display:flex; align-items:stretch; gap:10px; margin-bottom:18px; flex-wrap:wrap; }
  .networth-card { display:flex; flex-direction:column; gap:4px; background:var(--card); border:1px solid var(--paper-line); border-radius:3px; padding:10px 16px; min-width:120px; }
  .networth-card.networth-total { background:var(--accent); border-color:var(--accent); }
  .networth-total .networth-label { color:#C3D0B7; }
  .networth-total .surplus { color:#9FE3BC; }
  .networth-total .deficit { color:#F2A38F; }
  .networth-label { font-size:10.5px; text-transform:uppercase; letter-spacing:0.5px; color:var(--ink-soft); }
  .networth-op { display:flex; align-items:center; font-size:18px; color:var(--ink-soft); }
  .sparkline { width:100%; height:120px; display:block; }
  .spark-line { stroke:var(--stamp); stroke-width:2; vector-effect:non-scaling-stroke; }
  .spark-zero { stroke:var(--paper-line); stroke-width:1; stroke-dasharray:3 3; vector-effect:non-scaling-stroke; }
  .spark-dot { fill:var(--stamp); }
  .spark-dot.deficit-dot { fill:var(--deficit); }
  .spark-legend { display:flex; justify-content:space-between; font-size:12px; color:var(--ink-soft); margin-top:8px; }
  .spark-line-projected { stroke:var(--accent); stroke-dasharray:5 4; opacity:0.75; }
  .spark-dot-projected { opacity:0.55; }
  .spark-divider { stroke:var(--paper-line); stroke-width:1; vector-effect:non-scaling-stroke; }
  .forecast-table { margin-top:10px; }
  .forecast-table .ledger-row { display:flex; justify-content:space-between; }
  .cat-row { display:flex; align-items:center; gap:12px; padding:5px 0; }
  .cat-name { flex:0 0 140px; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cat-bar-track { flex:1; height:14px; background:var(--control-bg); border:1px solid var(--paper-line); border-radius:7px; overflow:hidden; }
  .cat-bar-fill { height:100%; background:var(--stamp); opacity:0.55; }
  .cat-bar-fill.under { background:var(--surplus); }
  .cat-bar-fill.over { background:var(--deficit); opacity:0.7; }
  .budget-add { gap:8px; margin-top:10px; padding-top:10px; border-top:1px dashed var(--paper-line); }
  .budget-add .text-input { flex:0 0 160px; }
  .budget-add .btn-secondary { margin-top:0; }
  .cat-amount { flex:0 0 90px; text-align:right; font-size:13px; }
  .cat-total { border-top:1px solid var(--ink); margin-top:6px; padding-top:8px; font-weight:700; }

  .backup-row { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
  .backup-folder { display:flex; align-items:center; gap:10px; margin:10px 0 4px; color:var(--ink-soft); flex-wrap:wrap; }
  .backup-folder .btn-secondary { margin-top:0; }
  .seg-group { display:flex; gap:0; border:1px solid var(--paper-line); border-radius:4px; overflow:hidden; }
  .seg-btn { display:flex; align-items:center; gap:5px; padding:6px 11px; background:var(--card); border:none; border-right:1px solid var(--paper-line); cursor:pointer; font-size:12.5px; color:var(--ink-soft); font-family:ui-sans-serif, system-ui; }
  .seg-btn:last-child { border-right:none; }
  .seg-btn:hover { color:var(--ink); }
  .seg-btn.selected { background:var(--accent); color:var(--accent-ink); }
  .transfer-row { display:flex; align-items:center; gap:8px; }
  .transfer-arrow { color:var(--ink-soft); flex-shrink:0; }
  .transfer-arrow.warn { color:var(--deficit); }
  .transfer-savings-tag { display:flex; align-items:center; justify-content:center; flex:0 0 110px; color:var(--accent); }
  .goal-group { margin-bottom:6px; }
  .goal-group-head { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:4px 2px; font-weight:600; font-size:13px; border-bottom:1px solid var(--paper-line); margin-bottom:2px; }
  .contribution-row { padding-left:14px; }
  .excluded-tag { font-size:9.5px; text-transform:uppercase; letter-spacing:0.4px; color:var(--stamp); border:1px solid var(--stamp); border-radius:8px; padding:1px 6px; margin-left:6px; vertical-align:middle; }
  .exclude-toggle { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--ink-soft); cursor:pointer; padding:7px 0; }
  .cat-row.selectable { cursor:pointer; border-radius:3px; }
  .cat-row.selectable:hover { background:var(--card); }
  .cat-row.selected { background:var(--card); }
  .cat-row.selected .cat-name { font-weight:600; color:var(--ink); }
  .cat-row.selected .cat-amount { font-weight:700; color:var(--accent); font-size:15px; }
  /* When enabled, scrolling stays inside a section instead of chaining to the page. */
  :root[data-contain-scroll="true"] .scroll-panel { overscroll-behavior: contain; }
  .drag-handle { display:inline-flex; align-items:center; color:var(--ink-soft); cursor:grab; padding:2px; flex-shrink:0; }
  .drag-handle:active { cursor:grabbing; color:var(--accent); }
  .goal-card.dragging, .debt-card.dragging { opacity:0.4; }
  .goal-card.drag-over, .debt-card.drag-over { box-shadow:0 -3px 0 var(--accent); }
  :root[data-dragging="1"] { cursor:grabbing; }
  :root[data-dragging="1"] * { user-select:none !important; }
  .profile-pick-row { display:flex; gap:14px; justify-content:center; flex-wrap:wrap; margin-top:6px; }
  .profile-pick { min-width:140px; padding:18px 22px; font-size:15px; font-weight:600; font-family:Georgia, serif; background:var(--card); color:var(--ink); border:1px solid var(--paper-line); border-radius:6px; cursor:pointer; }
  .profile-pick:hover { border-color:var(--accent); color:var(--accent); }
  .swatch-row { display:flex; gap:8px; }
  .swatch { width:26px; height:26px; border-radius:6px; border:2px solid var(--paper-line); cursor:pointer; padding:0; transition:transform 0.08s; }
  .swatch:hover { transform:scale(1.1); }
  .swatch.selected { border-color:var(--ink); box-shadow:0 0 0 2px var(--paper), 0 0 0 4px var(--ink); }
  .backup-folder-path { font-size:12px; max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; background:var(--card); border:1px solid var(--paper-line); border-radius:3px; padding:4px 8px; }
  .backup-msg { font-size:12px; color:var(--ink-soft); }
  .backup-group { margin-top:12px; }
  .backup-group-label { display:flex; align-items:center; gap:8px; font-family: Georgia, serif; font-size:14px; margin:0; color:var(--ink); border-bottom:1px solid var(--paper-line); padding-bottom:3px; }
  .backup-group-toggle { display:flex; align-items:center; gap:6px; flex:1; cursor:pointer; user-select:none; }
  .backup-group-toggle:hover { color:var(--stamp); }
  .backup-group-label .btn-secondary { margin-top:0; }
  .backup-group-count { font-family: ui-monospace, monospace; font-size:11px; color:var(--ink-soft); background:var(--card); border:1px solid var(--paper-line); border-radius:10px; padding:1px 8px; }
  .backup-archive-icon { color:var(--ink-soft); }
  .retention-toggle { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--ink-soft); cursor:pointer; }
  .due-date-hint { font-size:12px; color:var(--stamp); background:var(--warn-bg); border:1px solid var(--warn-line); border-radius:3px; padding:6px 10px; margin:10px 0 0; }
  .month-toolbar { display:flex; gap:8px; margin:10px 0 0; }
  .month-toolbar .btn-secondary { margin-top:0; }
  .saving-pill { position:fixed; top:12px; right:14px; z-index:50; background:var(--ink); color:var(--paper); font-size:12px; padding:5px 12px; border-radius:12px; opacity:0.9; box-shadow:0 1px 4px rgba(0,0,0,0.2); }

  .toast-stack { position:fixed; bottom:18px; right:18px; z-index:100; display:flex; flex-direction:column; gap:8px; max-width:360px; }
  .toast { display:flex; align-items:center; gap:8px; background:var(--ink); color:var(--paper); font-size:13px; padding:10px 12px; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.25); cursor:pointer; }
  .toast span { flex:1; }
  .toast-close { opacity:0.6; }
  .toast-action { background:rgba(255,255,255,0.18); color:inherit; border:1px solid rgba(255,255,255,0.45); border-radius:3px; padding:3px 10px; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; }
  .toast-action:hover { background:rgba(255,255,255,0.3); }
  .toast-success { background:var(--surplus); }
  .toast-error { background:var(--deficit); }

  .modal-backdrop { position:fixed; inset:0; z-index:110; background:rgba(30,43,34,0.45); display:flex; align-items:center; justify-content:center; padding:20px; }
  .modal-card { background:var(--card); border:1px solid var(--paper-line); border-radius:5px; padding:20px; max-width:440px; box-shadow:0 6px 24px rgba(0,0,0,0.3); }
  .modal-message { margin:0 0 16px; font-size:14px; color:var(--ink); line-height:1.5; }
  .modal-actions { display:flex; justify-content:flex-end; gap:10px; }
  .btn-danger { display:flex; align-items:center; gap:6px; background:var(--deficit); color:#fff; border:none; padding:8px 14px; border-radius:3px; cursor:pointer; font-size:13px; }
  .btn-danger:hover { background:#8f3322; }
  .block-hint { font-size:11px; font-weight:400; text-transform:none; letter-spacing:0; color:var(--ink-soft); }
  .withdrawal-pill { font-size:9.5px; text-transform:uppercase; letter-spacing:0.4px; color:var(--deficit); border:1px solid var(--deficit); border-radius:8px; padding:1px 6px; margin-left:6px; }
  .backup-list { list-style:none; padding:0; margin:6px 0 0; font-size:12px; }
  .backup-list li { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid var(--paper-line); }

`;
