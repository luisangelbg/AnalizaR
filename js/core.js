/* AnalizaR — estado global y utilidades comunes.
   Sin modulos ES: todo cuelga de window para no depender de bundlers. */

const state = {
  // Bloque 1 — datos
  fileName: null,
  sheetName: null,
  columns: [],      // [{ name, role: 'numeric'|'categorical', n, missing, levels? }]
  rows: [],         // [ { col: valor, ... }, ... ]  (valores ya tipados)
  dataReady: false,

  // Bloque 2 — descriptiva
  desc: {
    lastPlot: null, // spec de la ultima figura, para reexportar
  },
};
window.state = state;

/* ---------- DOM ---------- */
function el(id) { return document.getElementById(id); }
function els(sel, root) { return [...(root || document).querySelectorAll(sel)]; }

function showMessage(container, type, text) {
  if (typeof container === 'string') container = el(container);
  const div = document.createElement('div');
  div.className = 'msg msg-' + type;
  div.innerHTML = text;
  container.appendChild(div);
  return div;
}
function clearMessages(container) {
  if (typeof container === 'string') container = el(container);
  if (container) container.innerHTML = '';
}

function statTiles(container, pairs) {
  if (typeof container === 'string') container = el(container);
  container.innerHTML = '';
  pairs.forEach(([label, value, sub]) => {
    const d = document.createElement('div');
    d.className = 'stat-tile';
    d.innerHTML = `<div class="stat-label">${label}</div><div class="stat-value">${value}</div>` +
      (sub ? `<div class="stat-sub">${sub}</div>` : '');
    container.appendChild(d);
  });
}

/* Construye una <table> a partir de columnas y filas (array de objetos).
   columns: [{ key, label, get?, fmt? }] */
function buildTable(container, columns, rows, opts) {
  opts = opts || {};
  if (typeof container === 'string') container = el(container);
  container.innerHTML = '';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  columns.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c.label != null ? c.label : c.key;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  const shown = opts.limit ? rows.slice(0, opts.limit) : rows;
  shown.forEach(r => {
    const tr = document.createElement('tr');
    columns.forEach(c => {
      const td = document.createElement('td');
      let v = c.get ? c.get(r) : r[c.key];
      if (c.fmt && v != null && v !== '') v = c.fmt(v);
      td.textContent = (v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v))) ? '—' : v;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
  if (opts.limit && rows.length > opts.limit) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.padding = '6px 12px';
    p.textContent = `Mostrando ${opts.limit} de ${rows.length} filas.`;
    container.appendChild(p);
  }
}

/* ---------- numeros ---------- */
function fmtNum(v, d) {
  if (v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v))) return '—';
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e6)) return n.toExponential(d != null ? d : 2);
  return n.toLocaleString('es-MX', { maximumFractionDigits: d != null ? d : 3 });
}
function fmtP(p) {
  if (p == null || !isFinite(p)) return '—';
  if (p < 0.0001) return '< 0.0001';
  return Number(p).toLocaleString('es-MX', { maximumFractionDigits: 4 });
}

/* ---------- CSV / descargas ---------- */
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(columns, rows) {
  const head = columns.map(c => csvEscape(c.label != null ? c.label : c.key)).join(',');
  const body = rows.map(r => columns.map(c => csvEscape(c.get ? c.get(r) : r[c.key])).join(','));
  return '﻿' + [head, ...body].join('\r\n');
}
function download(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function dataURItoBlob(uri) {
  const [meta, b64] = uri.split(',');
  const mime = (meta.match(/data:([^;]+)/) || [, 'application/octet-stream'])[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function slug(s) {
  return String(s || 'analizar').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'analizar';
}

window.el = el; window.els = els;
window.showMessage = showMessage; window.clearMessages = clearMessages;
window.statTiles = statTiles; window.buildTable = buildTable;
window.fmtNum = fmtNum; window.fmtP = fmtP;
window.csvEscape = csvEscape; window.toCSV = toCSV;
window.download = download; window.dataURItoBlob = dataURItoBlob; window.slug = slug;
