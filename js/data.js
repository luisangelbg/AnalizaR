/* Bloque 1 — Carga de datos (xlsx / csv). */

/* ---------- parseo de archivos ---------- */
function parseCSV(text) {
  // separador: coma, ; o tab (autodeteccion por la primera linea)
  const firstLine = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : text.length);
  const counts = { ',': (firstLine.match(/,/g) || []).length, ';': (firstLine.match(/;/g) || []).length, '\t': (firstLine.match(/\t/g) || []).length };
  const sep = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ',';
  const rows = [];
  let cur = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === sep) { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.length && !(r.length === 1 && r[0].trim() === ''));
}

function matrixToRecords(matrix) {
  if (!matrix.length) return { headers: [], records: [] };
  let headers = matrix[0].map((h, i) => (String(h ?? '').trim() || `col_${i + 1}`));
  // nombres duplicados
  const seen = {};
  headers = headers.map(h => { seen[h] = (seen[h] || 0) + 1; return seen[h] > 1 ? `${h}_${seen[h]}` : h; });
  const records = matrix.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] === undefined ? '' : r[i]; });
    return o;
  });
  return { headers, records };
}

/* detecta si una columna es numerica */
function detectRole(values) {
  const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined);
  if (!nonEmpty.length) return 'categorical';
  let num = 0;
  for (const v of nonEmpty) {
    if (typeof v === 'number') { num++; continue; }
    const s = String(v).trim().replace(',', '.');
    if (s !== '' && isFinite(Number(s))) num++;
  }
  const frac = num / nonEmpty.length;
  const distinct = new Set(nonEmpty.map(String)).size;
  if (frac >= 0.85 && distinct > 2) return 'numeric';
  if (frac >= 0.95) return 'numeric';
  return 'categorical';
}

async function handleFile(file) {
  clearMessages('dataMessages');
  const ext = file.name.split('.').pop().toLowerCase();
  showSpinner('Leyendo ' + file.name + '…');
  try {
    let matrix, sheetName = null, sheetNames = [];
    if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
      matrix = parseCSV(await file.text());
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
      if (!window.XLSX) throw new Error('No se pudo cargar el lector de Excel (¿sin internet?). Guarda tu archivo como CSV y vuelve a intentarlo.');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      sheetNames = wb.SheetNames;
      sheetName = wb.SheetNames[0];
      window.__wb = wb;
      matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true });
    } else {
      throw new Error('Formato no reconocido: .' + ext + '. Usa .xlsx o .csv');
    }
    ingestMatrix(matrix, file.name, sheetName, sheetNames);
  } catch (err) {
    console.error(err);
    showMessage('dataMessages', 'error', err.message);
  } finally { hideSpinner(); }
}

function ingestMatrix(matrix, fileName, sheetName, sheetNames) {
  matrix = matrix.filter(r => r.some(c => String(c ?? '').trim() !== ''));
  if (matrix.length < 2) { showMessage('dataMessages', 'error', 'La hoja tiene menos de 2 filas con datos.'); return; }
  const { headers, records } = matrixToRecords(matrix);

  state.fileName = fileName;
  state.sheetName = sheetName;
  state.rawHeaders = headers;
  state.rawRecords = records;
  state.columns = headers.map(h => {
    const vals = records.map(r => r[h]);
    const role = detectRole(vals);
    const nonEmpty = vals.filter(v => v !== '' && v !== null && v !== undefined);
    return {
      name: h, role,
      missing: records.length - nonEmpty.length,
      distinct: new Set(nonEmpty.map(String)).size,
    };
  });

  // selector de hojas (solo xlsx con >1 hoja)
  const sw = el('sheetPicker');
  if (sheetNames && sheetNames.length > 1) {
    sw.style.display = 'flex';
    el('sheetSelect').innerHTML = sheetNames.map(s => `<option ${s === sheetName ? 'selected' : ''}>${s}</option>`).join('');
  } else sw.style.display = 'none';

  renderDataConfig();
  el('dataConfigCard').style.display = 'block';
  el('dataPreviewCard').style.display = 'block';
  showMessage('dataMessages', 'success', `Leído: <b>${records.length}</b> filas × <b>${headers.length}</b> columnas.`);
}

el('sheetSelect') && el('sheetSelect').addEventListener('change', e => {
  const wb = window.__wb; if (!wb) return;
  const sn = e.target.value;
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true });
  ingestMatrix(matrix, state.fileName, sn, wb.SheetNames);
});

/* ---------- configuracion de columnas ---------- */
function renderDataConfig() {
  const box = el('colConfig');
  box.innerHTML = '';
  state.columns.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'col-config-row';
    row.innerHTML = `
      <div class="col-name" title="${c.name}">${c.name}</div>
      <div class="col-meta">${c.distinct} distintos · ${c.missing} vacíos</div>
      <select data-i="${i}" class="col-role">
        <option value="numeric" ${c.role === 'numeric' ? 'selected' : ''}>Numérica (cuantitativa)</option>
        <option value="categorical" ${c.role === 'categorical' ? 'selected' : ''}>Categórica (factor / grupo)</option>
        <option value="exclude" ${c.role === 'exclude' ? 'selected' : ''}>Excluir del análisis</option>
      </select>`;
    box.appendChild(row);
  });
  els('.col-role', box).forEach(s => s.addEventListener('change', e => {
    state.columns[+e.target.dataset.i].role = e.target.value;
    updateDataSummary();
  }));
  updateDataSummary();
  renderPreview();
}

function updateDataSummary() {
  const nNum = state.columns.filter(c => c.role === 'numeric').length;
  const nCat = state.columns.filter(c => c.role === 'categorical').length;
  const missCells = state.columns.filter(c => c.role !== 'exclude').reduce((a, c) => a + c.missing, 0);
  const dup = countDuplicateRows();
  statTiles('dataSummary', [
    ['Observaciones', state.rawRecords.length],
    ['Variables numéricas', nNum],
    ['Variables categóricas', nCat],
    ['Celdas vacías', missCells],
    ['Filas duplicadas', dup],
  ]);
}

function countDuplicateRows() {
  const keys = state.columns.filter(c => c.role !== 'exclude').map(c => c.name);
  const seen = new Set(); let dup = 0;
  for (const r of state.rawRecords) {
    const k = keys.map(x => String(r[x])).join('');
    if (seen.has(k)) dup++; else seen.add(k);
  }
  return dup;
}

function renderPreview() {
  const keys = state.columns.map(c => c.name);
  const cols = keys.map(k => {
    const role = state.columns.find(c => c.name === k).role;
    return { key: k, label: k + (role === 'numeric' ? ' ⌗' : role === 'categorical' ? ' ⌸' : ' ∅') };
  });
  buildTable('dataPreview', cols, state.rawRecords, { limit: 60 });
}

/* ---------- typing + carga a Python ---------- */
function typedRows() {
  const roles = {};
  state.columns.forEach(c => { if (c.role !== 'exclude') roles[c.name] = c.role; });
  const active = Object.keys(roles);
  const rows = state.rawRecords.map(r => {
    const o = {};
    active.forEach(k => {
      let v = r[k];
      if (v === '' || v === null || v === undefined) { o[k] = null; return; }
      if (roles[k] === 'numeric') {
        const n = Number(String(v).trim().replace(',', '.'));
        o[k] = isFinite(n) ? n : null;
      } else o[k] = String(v);
    });
    return o;
  });
  return { rows, roles };
}

el('loadDataBtn').addEventListener('click', async () => {
  const { rows, roles } = typedRows();
  const nNum = Object.values(roles).filter(r => r === 'numeric').length;
  if (!rows.length) { showMessage('dataMessages', 'error', 'No hay filas para cargar.'); return; }
  if (nNum < 1) { showMessage('dataMessages', 'error', 'Marca al menos una variable como numérica.'); return; }
  clearMessages('dataMessages');
  showSpinner('Cargando datos en el motor de análisis…');
  try {
    await getPyodide();
    const info = await runPyJSON('load_data(_rows, _roles)', {
      _rows: JSON.stringify(rows), _roles: JSON.stringify(roles),
    });
    state.rows = rows;
    state.roles = roles;
    state.info = info;
    state.dataReady = true;
    showMessage('dataMessages', 'success',
      `Datos cargados: ${info.n} observaciones · ${info.numeric.length} numéricas · ${info.categorical.length} categóricas. ` +
      `Ya puedes ir al bloque <b>Descriptiva</b>.`);
    enableStep(2); enableStep(3); enableStep(4); enableStep(5); enableStep(6);
    if (window.onDataLoaded) window.onDataLoaded();
    document.dispatchEvent(new Event('analizar:data'));
    el('goDescBtn').style.display = 'inline-block';
  } catch (err) {
    console.error(err);
    showMessage('dataMessages', 'error', 'Error al cargar: ' + err.message);
  } finally { hideSpinner(); }
});

el('goDescBtn').addEventListener('click', () => goToStep(2));

/* ---------- drop zone / inputs ---------- */
const dz = el('dropZone');
dz.addEventListener('click', () => el('fileInput').click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('drag');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
el('fileInput').addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

el('loadExampleBtn').addEventListener('click', async () => {
  showSpinner('Cargando datos de ejemplo (iris)…');
  try {
    const txt = await (await fetch('datos/iris.csv')).text();
    ingestMatrix(parseCSV(txt), 'iris.csv', null, []);
  } catch (err) {
    showMessage('dataMessages', 'error', 'No se pudo cargar el ejemplo: ' + err.message + ' (abre la app con servidor.ps1).');
  } finally { hideSpinner(); }
});
