/* Bloque 2 — Estadistica descriptiva + estudio de graficas (controlador JS). */

let descReady = false;

const PLOT_KINDS = [
  { group: 'Distribución de una variable', items: [
    { id: 'histogram', name: 'Histograma', xnum: 1 },
    { id: 'hist_density', name: 'Histograma + densidad', xnum: 1 },
    { id: 'density', name: 'Curva de densidad (KDE)', xnum: 1 },
    { id: 'freqpoly', name: 'Polígono de frecuencias', xnum: 1 },
    { id: 'ecdf', name: 'Distribución acumulada (ECDF)', xnum: 1 },
    { id: 'qq', name: 'Gráfico Q–Q normal', xnum: 1 },
  ]},
  { group: 'Comparación entre grupos', items: [
    { id: 'boxplot', name: 'Diagrama de caja (boxplot)', xnum: 1, wantsGroup: 1 },
    { id: 'violin', name: 'Diagrama de violín', xnum: 1, wantsGroup: 1 },
    { id: 'violin_box', name: 'Violín + caja', xnum: 1, wantsGroup: 1 },
    { id: 'raincloud', name: 'Raincloud (nube + caja + puntos)', xnum: 1, wantsGroup: 1 },
    { id: 'strip', name: 'Puntos con dispersión (jitter)', xnum: 1, wantsGroup: 1 },
    { id: 'bar_mean', name: 'Barras de media ± error', xnum: 1, wantsGroup: 1 },
    { id: 'pointrange', name: 'Media ± intervalo (point-range)', xnum: 1, wantsGroup: 1 },
    { id: 'line', name: 'Línea de medias por nivel', xnum: 1, wantsGroup: 1 },
    { id: 'ridgeline', name: 'Ridgeline (densidades apiladas)', xnum: 1, wantsGroup: 1 },
  ]},
  { group: 'Relación entre dos variables', items: [
    { id: 'scatter', name: 'Diagrama de dispersión', xnum: 1, ynum: 1, wantsGroup: 1 },
    { id: 'scatter_fit', name: 'Dispersión + curva de ajuste', xnum: 1, ynum: 1, wantsGroup: 1 },
    { id: 'hexbin', name: 'Hexbin (densidad de puntos)', xnum: 1, ynum: 1 },
    { id: 'density2d', name: 'Densidad 2D (contornos)', xnum: 1, ynum: 1 },
  ]},
  { group: 'Categóricas y panorama', items: [
    { id: 'bar_count', name: 'Barras de conteo', xcat: 1, wantsGroup: 1 },
    { id: 'pairs', name: 'Matriz de dispersión (pairs)', multi: 1, wantsGroup: 1 },
  ]},
];
const KIND_META = {};
PLOT_KINDS.forEach(s => s.items.forEach(it => KIND_META[it.id] = it));

const PALETTES = ['StatsPro', 'Okabe-Ito', 'Vivo', 'Tierra', 'Pastel', 'Set2', 'Dark2', 'Viridis', 'Plasma', 'Cividis', 'Magma'];
const THEMES = ['StatsPro', 'Minimal', 'Publicacion', 'Cuadricula', 'Clasico', 'Oscuro'];

function num() { return (state.info && state.info.numeric) || []; }
function cat() { return (state.info && state.info.categorical) || []; }

/* ---------- inicializacion al entrar al bloque ---------- */
window.onDataLoaded = function () {
  buildDescControls();
};

function opt(v, t, sel) { return `<option value="${v}" ${sel ? 'selected' : ''}>${t || v}</option>`; }

function buildDescControls() {
  // selector de tipo de grafico
  const ks = el('plotKind');
  ks.innerHTML = PLOT_KINDS.map(s =>
    `<optgroup label="${s.group}">${s.items.map(it => opt(it.id, it.name)).join('')}</optgroup>`).join('');

  // variables descriptiva
  const dv = el('descVars');
  dv.innerHTML = num().map(v => `<label class="checkbox-label"><input type="checkbox" value="${v}" checked> ${v}</label>`).join('');
  const gsel = el('descGroup');
  gsel.innerHTML = opt('', '— sin agrupar —') + cat().map(c => opt(c)).join('');

  // tabla de frecuencias
  const fsel = el('freqCol');
  fsel.innerHTML = cat().length ? cat().map(c => opt(c)).join('') : opt('', '(no hay variables categóricas)');

  buildPlotOptions();
  syncPlotControls();
  renderDescriptive();
  renderMissing();
}

/* ---------- panel de opciones del grafico (generado) ---------- */
function buildPlotOptions() {
  const box = el('plotOptions');
  box.innerHTML = `
  <div class="opt-sec">
    <h4>Variables</h4>
    <div class="opt-grid">
      <label>Variable X <select id="pX"></select></label>
      <label>Variable Y <select id="pY"></select></label>
      <label>Agrupar / color <select id="pGroup"></select></label>
      <label id="pPairWrap" style="display:none">Variables (pairs)
        <span id="pPairVars" class="mini-check"></span></label>
    </div>
  </div>
  <div class="opt-sec">
    <h4>Estética</h4>
    <div class="opt-grid">
      <label>Paleta (con grupos) <select id="pPalette">${PALETTES.map(p => opt(p)).join('')}</select></label>
      <label>Color (sin grupos) <input type="color" id="pColor" value="#4C72B0"></label>
      <label>Tema <select id="pTheme">${THEMES.map(t => opt(t)).join('')}</select></label>
      <label>Fuente <select id="pFontFamily"></select></label>
      <label>Transparencia <input type="range" id="pAlpha" min="0.1" max="1" step="0.05" value="0.85"><span id="pAlphaV" class="rv">0.85</span></label>
      <label>Escala de fuente <input type="range" id="pFont" min="0.7" max="1.6" step="0.05" value="1"><span id="pFontV" class="rv">1.0</span></label>
      <label class="ck"><input type="checkbox" id="pGrid" checked> Cuadrícula</label>
    </div>
  </div>
  <div class="opt-sec">
    <h4>Opciones del gráfico</h4>
    <div class="opt-grid">
      <label data-for="bins">Nº de barras/celdas <input type="number" id="pBins" value="24" min="4" max="120"></label>
      <label data-for="bw">Suavizado densidad <input type="number" id="pBw" value="1" min="0.2" max="3" step="0.1"></label>
      <label data-for="smooth">Curva de ajuste <select id="pSmooth">${['lineal', 'poly2', 'poly3', 'suave'].map(s => opt(s)).join('')}</select></label>
      <label data-for="errorbar">Barra de error <select id="pErr">${[['se', 'Error estándar'], ['sd', 'Desv. estándar'], ['ci95', 'IC 95%']].map(a => opt(a[0], a[1])).join('')}</select></label>
      <label data-for="jitter">Dispersión de puntos <input type="number" id="pJitter" value="0.08" min="0" max="0.4" step="0.02"></label>
      <label data-for="cmap">Mapa de color <select id="pCmap">${['viridis', 'plasma', 'magma', 'cividis', 'inferno', 'YlGnBu', 'Blues'].map(c => opt(c)).join('')}</select></label>
      <label class="ck" data-for="notch"><input type="checkbox" id="pNotch"> Muesca (notch)</label>
      <label class="ck" data-for="points"><input type="checkbox" id="pPoints"> Superponer puntos</label>
      <label class="ck" data-for="mean"><input type="checkbox" id="pMean"> Marcar media</label>
      <label class="ck" data-for="fill"><input type="checkbox" id="pFill" checked> Rellenar área</label>
      <label class="ck" data-for="facet"><input type="checkbox" id="pFacet"> Panel por grupo (facetas)</label>
      <label class="ck" data-for="flip"><input type="checkbox" id="pFlip"> Orientación horizontal</label>
      <label class="ck" data-for="nann"><input type="checkbox" id="pAnnN"> Anotar n por grupo</label>
    </div>
  </div>
  <div class="opt-sec">
    <h4>Ejes y texto</h4>
    <div class="opt-grid">
      <label>Título <input type="text" id="pTitle" placeholder="(opcional)"></label>
      <label>Subtítulo <input type="text" id="pSub" placeholder="(opcional)"></label>
      <label>Etiqueta eje X <input type="text" id="pXlab" placeholder="(automático)"></label>
      <label>Etiqueta eje Y <input type="text" id="pYlab" placeholder="(automático)"></label>
      <label>Nota al pie <input type="text" id="pCap" placeholder="(opcional)"></label>
      <label class="ck"><input type="checkbox" id="pLegend" checked> Mostrar leyenda</label>
      <label>Posición leyenda <select id="pLegPos">${[['best', 'automática'], ['upper right', 'arriba dcha.'], ['upper left', 'arriba izq.'], ['lower right', 'abajo dcha.'], ['lower left', 'abajo izq.'], ['fuera', 'fuera del gráfico']].map(a => opt(a[0], a[1])).join('')}</select></label>
      <label class="ck"><input type="checkbox" id="pLogX"> Eje X logarítmico</label>
      <label class="ck"><input type="checkbox" id="pLogY"> Eje Y logarítmico</label>
    </div>
  </div>
  <div class="opt-sec">
    <h4>Tamaño y exportación</h4>
    <div class="opt-grid">
      <label>Ancho (pulg) <input type="number" id="pW" value="7.2" min="3" max="16" step="0.2"></label>
      <label>Alto (pulg) <input type="number" id="pH" value="4.6" min="2" max="14" step="0.2"></label>
      <label>DPI exportación <select id="pDpi">${[150, 300, 450, 600].map(d => opt(d, d + ' dpi')).join('')}</select></label>
    </div>
    <div class="btn-row">
      <button class="btn btn-secondary" id="expPNG">⬇ PNG</button>
      <button class="btn btn-secondary" id="expSVG">⬇ SVG</button>
      <button class="btn btn-secondary" id="expPDF">⬇ PDF</button>
      <button class="btn btn-secondary" id="expCSV">⬇ Datos (CSV)</button>
    </div>
  </div>`;

  // set DPI default 300
  el('pDpi').value = '300';
  getFontList().then(fonts => {
    el('pFontFamily').innerHTML = fonts.map(f => `<option value="${f.id}" ${f.id === 'Inter' ? 'selected' : ''}>${f.label}</option>`).join('');
  });

  // listeners: cualquier cambio => re-render
  els('input,select', box).forEach(inp => {
    inp.addEventListener('input', () => { updateRangeLabels(); scheduleRender(); });
    inp.addEventListener('change', () => { syncPlotControls(); scheduleRender(); });
  });
  el('plotKind').addEventListener('change', () => { syncPlotControls(); scheduleRender(); });

  el('expPNG').addEventListener('click', () => exportFig('png'));
  el('expSVG').addEventListener('click', () => exportFig('svg'));
  el('expPDF').addEventListener('click', () => exportFig('pdf'));
  el('expCSV').addEventListener('click', exportFigData);
}

function updateRangeLabels() {
  const a = el('pAlphaV'), f = el('pFontV');
  if (a) a.textContent = (+el('pAlpha').value).toFixed(2);
  if (f) f.textContent = (+el('pFont').value).toFixed(1);
}

/* ajusta selects de variables y visibilidad de controles segun el tipo de grafico */
function syncPlotControls() {
  const kind = el('plotKind').value;
  const m = KIND_META[kind] || {};
  const pX = el('pX'), pY = el('pY'), pG = el('pGroup');
  const xopts = m.xcat ? cat() : num();
  const keepX = pX.value, keepY = pY.value, keepG = pG.value;
  pX.innerHTML = xopts.map(v => opt(v)).join('');
  pY.innerHTML = num().map(v => opt(v)).join('');
  pG.innerHTML = opt('', '— ninguno —') + cat().map(c => opt(c)).join('');
  if (xopts.includes(keepX)) pX.value = keepX;
  if (num().includes(keepY)) pY.value = keepY; else if (num()[1]) pY.value = num()[1];
  if (keepG && cat().includes(keepG)) pG.value = keepG;

  show('pX', !m.multi);
  show('pY', !!m.ynum);
  show('pGroup', !!m.wantsGroup || !!m.multi);
  show('pPairWrap', !!m.multi);
  if (m.multi) {
    el('pPairVars').innerHTML = num().map((v, i) =>
      `<label><input type="checkbox" value="${v}" ${i < 4 ? 'checked' : ''}> ${v}</label>`).join('');
    els('#pPairVars input').forEach(c => c.addEventListener('change', scheduleRender));
  }

  const vis = {
    bins: ['histogram', 'hist_density', 'freqpoly', 'hexbin'],
    bw: ['density', 'hist_density', 'ridgeline', 'violin', 'violin_box', 'raincloud'],
    smooth: ['scatter_fit'],
    errorbar: ['bar_mean', 'pointrange', 'line'],
    jitter: ['strip', 'raincloud'],
    cmap: ['hexbin', 'density2d'],
    notch: ['boxplot'],
    points: ['boxplot', 'violin', 'violin_box'],
    mean: ['boxplot', 'violin', 'violin_box', 'strip'],
    fill: ['density'],
    facet: ['histogram', 'density', 'hist_density', 'boxplot', 'violin', 'scatter', 'scatter_fit', 'ecdf', 'freqpoly', 'strip', 'qq'],
    flip: ['boxplot', 'violin', 'violin_box', 'strip', 'bar_mean', 'bar_count', 'pointrange', 'raincloud'],
    nann: ['boxplot', 'violin', 'violin_box', 'strip', 'bar_mean', 'pointrange'],
  };
  els('#plotOptions [data-for]').forEach(lab => {
    const key = lab.dataset.for;
    lab.style.display = (vis[key] && vis[key].includes(kind)) ? '' : 'none';
  });
  show('pColor', !el('pGroup').value || !m.wantsGroup);
  show('pPalette', !!m.wantsGroup);
}
function show(id, on) { const e = el(id); if (e) { const w = e.closest('label') || e; w.style.display = on ? '' : 'none'; } }

/* ---------- recoger opciones ---------- */
function collectOpts() {
  const kind = el('plotKind').value;
  const o = {
    kind,
    x: el('pX').value, y: el('pY').value, group: el('pGroup').value || '',
    palette: el('pPalette').value, single_color: el('pColor').value, theme: el('pTheme').value,
    font: el('pFontFamily').value,
    alpha: +el('pAlpha').value, font_scale: +el('pFont').value, grid: el('pGrid').checked,
    bins: +el('pBins').value, bw_adjust: +el('pBw').value, smooth: el('pSmooth').value,
    errorbar: el('pErr').value, jitter: +el('pJitter').value, cmap: el('pCmap').value,
    notch: el('pNotch').checked, show_points: el('pPoints').checked, show_mean: el('pMean').checked,
    fill: el('pFill').checked, facet: el('pFacet').checked, flip: el('pFlip').checked,
    annotate_n: el('pAnnN').checked,
    title: el('pTitle').value, subtitle: el('pSub').value, xlab: el('pXlab').value,
    ylab: el('pYlab').value, caption: el('pCap').value,
    legend_show: el('pLegend').checked, legend_pos: el('pLegPos').value,
    log_x: el('pLogX').checked, log_y: el('pLogY').checked,
    width: +el('pW').value, height: +el('pH').value, dpi: 170,
  };
  // color unico: si no hay grupo, mandamos la paleta como un solo color
  if (!o.group) o.palette = null, o.single_color = el('pColor').value;
  if (!o.group && !o.palette) {
    // truco: paleta de un color via lista inyectada -> usamos nombre especial
  }
  if (KIND_META[kind].multi) {
    o.pair_vars = els('#pPairVars input:checked').map(c => c.value);
  }
  return o;
}

let renderTimer = null;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(renderPlot, 260); }

async function renderPlot() {
  if (!state.dataReady) return;
  const o = collectOpts();
  const m = KIND_META[o.kind];
  if (!m.multi && m.xnum && !o.x) return;
  if (m.ynum && !o.y) return;
  const box = el('plotCanvas');
  box.classList.add('loading');
  try {
    await ensureDesc();
    // color unico cuando no hay grupo: inyectamos una "paleta" ad-hoc
    const payload = { ...o };
    if (!o.group) payload.palette = '__single__:' + o.single_color;
    const uri = await runPy('make_plot(_o)', { _o: JSON.stringify(payload) });
    box.innerHTML = `<img src="${uri}" alt="gráfico">`;
    state.desc.lastOpts = payload;
  } catch (err) {
    console.error(err);
    box.innerHTML = `<p class="msg msg-error">Error al dibujar: ${err.message}</p>`;
  } finally { box.classList.remove('loading'); }
}

async function exportFig(fmt) {
  if (!state.desc.lastOpts) { renderPlot(); return; }
  showSpinner('Exportando ' + fmt.toUpperCase() + '…');
  try {
    const dpi = +el('pDpi').value || 300;
    const uri = await runPy(`export_plot(${JSON.stringify(fmt)}, ${dpi})`);
    if (!uri) return;
    const ext = fmt === 'png' ? 'png' : fmt;
    download(dataURItoBlob(uri), `${slug(state.fileName)}_${el('plotKind').value}.${ext}`);
  } catch (err) { showMessage('descMessages', 'error', 'Error al exportar: ' + err.message); }
  finally { hideSpinner(); }
}
async function exportFigData() {
  showSpinner('Preparando CSV…');
  try {
    const csv = await runPy('plot_data_csv()');
    if (csv) download('﻿' + csv, `${slug(state.fileName)}_${el('plotKind').value}_datos.csv`, 'text/csv;charset=utf-8');
  } finally { hideSpinner(); }
}

/* ---------- tablas descriptivas ---------- */
async function ensureDesc() {
  await getPyodide();
  if (!descReady) { (await getPyodide()).runPython(PY_DESC); descReady = true; }
}

const DESC_COLS = [
  { key: 'grupo', label: 'Grupo' }, { key: 'variable', label: 'Variable' }, { key: 'n', label: 'n' },
  { key: 'media', label: 'Media', fmt: v => fmtNum(v) }, { key: 'DE', label: 'DE', fmt: v => fmtNum(v) },
  { key: 'EE', label: 'EE', fmt: v => fmtNum(v) },
  { key: 'IC95_inf', label: 'IC95 inf', fmt: v => fmtNum(v) }, { key: 'IC95_sup', label: 'IC95 sup', fmt: v => fmtNum(v) },
  { key: 'CV', label: 'CV %', fmt: v => fmtNum(v, 1) },
  { key: 'mediana', label: 'Mediana', fmt: v => fmtNum(v) }, { key: 'media_recortada', label: 'Media rec. 10%', fmt: v => fmtNum(v) },
  { key: 'min', label: 'Mín', fmt: v => fmtNum(v) }, { key: 'Q1', label: 'Q1', fmt: v => fmtNum(v) },
  { key: 'Q3', label: 'Q3', fmt: v => fmtNum(v) }, { key: 'max', label: 'Máx', fmt: v => fmtNum(v) },
  { key: 'RIC', label: 'RIC', fmt: v => fmtNum(v) }, { key: 'MAD', label: 'MAD', fmt: v => fmtNum(v) },
  { key: 'asimetria', label: 'Asimetría', fmt: v => fmtNum(v) }, { key: 'curtosis', label: 'Curtosis', fmt: v => fmtNum(v) },
  { key: 'media_geom', label: 'Media geom.', fmt: v => fmtNum(v) }, { key: 'moda', label: 'Moda', fmt: v => fmtNum(v) },
];

async function renderDescriptive() {
  const vars = els('#descVars input:checked').map(c => c.value);
  if (!vars.length) { el('descTable').innerHTML = '<p class="hint">Selecciona variables.</p>'; return; }
  const grp = el('descGroup').value;
  showSpinner('Calculando estadística descriptiva…');
  try {
    await ensureDesc();
    const rows = await runPyJSON(`describe_table(_v, ${grp ? JSON.stringify(grp) : 'None'})`, { _v: JSON.stringify(vars) });
    const cols = grp ? DESC_COLS : DESC_COLS.filter(c => c.key !== 'grupo');
    buildTable('descTable', cols, rows);
    state.desc.lastTable = { cols, rows };
    // normalidad rapida
    const nq = await runPyJSON(`normality_quick(_v, ${grp ? JSON.stringify(grp) : 'None'})`, { _v: JSON.stringify(vars) });
    buildTable('normQuickTable', [
      ...(grp ? [{ key: 'grupo', label: 'Grupo' }] : []),
      { key: 'variable', label: 'Variable' }, { key: 'n', label: 'n' },
      { key: 'asimetria', label: 'Asimetría' }, { key: 'curtosis', label: 'Curtosis' },
      { key: 'shapiro_W', label: 'Shapiro-Wilk W' }, { key: 'shapiro_p', label: 'p', fmt: fmtP },
      { key: 'veredicto', label: 'Veredicto (α=0.05)' },
    ], nq);
  } catch (err) {
    console.error(err); showMessage('descMessages', 'error', 'Error: ' + err.message);
  } finally { hideSpinner(); }
}

async function renderMissing() {
  await ensureDesc();
  const rows = await runPyJSON('missing_table()');
  buildTable('missingTable', [
    { key: 'variable', label: 'Variable' }, { key: 'tipo', label: 'Tipo' },
    { key: 'presentes', label: 'Presentes' }, { key: 'faltantes', label: 'Faltantes' },
    { key: 'pct_faltante', label: '% faltante', fmt: v => fmtNum(v, 1) },
  ], rows);
}

async function renderFreq() {
  const c = el('freqCol').value;
  if (!c) return;
  await ensureDesc();
  const r = await runPyJSON(`freq_table(${JSON.stringify(c)})`);
  el('freqSummary').textContent = `${r.n} observaciones · ${r.k} niveles`;
  buildTable('freqTable', [
    { key: 'nivel', label: 'Nivel' }, { key: 'frec', label: 'Frecuencia' },
    { key: 'porcentaje', label: '%', fmt: v => fmtNum(v, 2) },
    { key: 'frec_acum', label: 'Frec. acumulada' }, { key: 'porc_acum', label: '% acumulado', fmt: v => fmtNum(v, 2) },
  ], r.rows);
}

/* ---------- descargas de tablas ---------- */
el('dlDescCsv').addEventListener('click', () => {
  if (!state.desc.lastTable) return;
  download(toCSV(state.desc.lastTable.cols, state.desc.lastTable.rows),
    `${slug(state.fileName)}_descriptiva.csv`, 'text/csv;charset=utf-8');
});

el('descVars').addEventListener('change', renderDescriptive);
el('descGroup').addEventListener('change', renderDescriptive);
el('freqCol').addEventListener('change', renderFreq);
el('descRecalcBtn').addEventListener('click', renderDescriptive);

/* primera figura al abrir el bloque */
document.querySelector('.step-btn[data-step="2"]').addEventListener('click', () => {
  if (state.dataReady && !state.desc.lastOpts) setTimeout(renderPlot, 300);
  if (state.dataReady) setTimeout(renderFreq, 100);
});
