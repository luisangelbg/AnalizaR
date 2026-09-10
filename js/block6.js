/* Bloque 6 — Multivariado (controlador JS): recomendación + factorial + clustering. */

let mvReady = false, clustReady = false;
const B6 = { prepared: false, theme: 'StatsPro', factorDone: false, clustPrepared: false };

document.addEventListener('analizar:data', build6);
initTabs('panel-6');

function build6() {
  const nums = (state.info && state.info.numeric) || [];
  const cats = (state.info && state.info.categorical) || [];
  const chk = (v, c) => `<label class="checkbox-label"><input type="checkbox" value="${v}" ${c ? 'checked' : ''}> ${v}</label>`;
  el('m6Nums').innerHTML = nums.map(v => chk(v, true)).join('');
  el('m6Cats').innerHTML = cats.length ? cats.map(v => chk(v, false)).join('') : '<p class="hint">Sin variables categóricas.</p>';
  el('m6Theme').innerHTML = ['StatsPro', 'Minimal', 'Publicacion', 'Cuadricula', 'Clasico', 'Oscuro'].map(t => `<option>${t}</option>`).join('');
  el('m6Palette').innerHTML = ['StatsPro', 'Okabe-Ito', 'Vivo', 'Tierra', 'Pastel', 'Set2', 'Dark2', 'Viridis'].map(t => `<option>${t}</option>`).join('');
  el('m6Legend').innerHTML = LEGEND_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  getFontList().then(fonts => {
    el('m6Font').innerHTML = fonts.map(f => `<option value="${f.id}" ${f.id === 'Inter' ? 'selected' : ''}>${f.label}</option>`).join('');
  });
  el('m6Group').innerHTML = `<option value="">— ninguno —</option>` + cats.map(c => `<option>${c}</option>`).join('');
  el('cl6Group').innerHTML = `<option value="">— ninguno —</option>` + cats.map(c => `<option>${c}</option>`).join('');
}
el('m6FontScale').addEventListener('input', () => { el('m6FontScaleV').textContent = (+el('m6FontScale').value).toFixed(2); });
function m6StyleExtra() {
  const legendV = el('m6Legend').value;
  return {
    font: el('m6Font').value, font_scale: +el('m6FontScale').value || 1, grid: el('m6Grid').checked,
    legend_show: legendV === 'oculta' ? false : true,
    legend_pos: (legendV === 'auto' || legendV === 'oculta') ? null : legendV,
  };
}

function selNums() { return els('#m6Nums input:checked').map(c => c.value); }
function selCats() { return els('#m6Cats input:checked').map(c => c.value); }

async function ensureMV() {
  await ensurePackages(['scipy', 'scikit-learn']);
  if (!mvReady) { (await getPyodide()).runPython(PY_MV); mvReady = true; }
  const nums = selNums(), cats = selCats();
  const key = JSON.stringify([nums, cats]);
  if (B6.prepKey !== key) {
    await runPy('mv_prepare(_pn, _pc)', { _pn: JSON.stringify(nums), _pc: JSON.stringify(cats) });
    B6.prepKey = key; B6.prepared = true; B6.factorDone = false; B6.clustPrepared = false;
  }
}
async function ensureClust() {
  await ensurePackages(['scipy', 'scikit-learn']);
  if (!clustReady) { (await getPyodide()).runPython(PY_CLUST); clustReady = true; }
}

/* ---------- RECOMENDACIÓN ---------- */
el('m6RunRec').addEventListener('click', async () => {
  if (selNums().length + selCats().length < 2) { showMessage('m6Msg', 'error', 'Elige al menos 2 variables.'); return; }
  showSpinner('Diagnosticando los datos…');
  try {
    await ensureMV();
    const r = await runPyJSON('mv_recommend()');
    const D = r.diag;
    const tiles = [];
    if (D.KMO != null) tiles.push(['KMO', fmtNum(D.KMO, 3), D.KMO_interp]);
    if (D.Bartlett_p != null) tiles.push(['Bartlett (esfericidad)', 'p ' + fmtP(D.Bartlett_p), D.Bartlett_p < 0.05 ? 'hay correlación' : 'sin correlación']);
    if (D.r_medio != null) tiles.push(['|r| medio', fmtNum(D.r_medio, 2)]);
    if (D.Hopkins != null) tiles.push(['Hopkins', fmtNum(D.Hopkins, 2), D.Hopkins_interp]);
    statTiles('m6RecTiles', tiles);
    el('m6RecBox').innerHTML = `<p class="rec-head">Método sugerido: <b>${r.primary}</b></p><ul>` +
      r.rec.map(t => `<li>${t}</li>`).join('') + '</ul>';
    if (r.tabla_kmo && r.tabla_kmo.length) {
      buildTable('m6KmoTable', [{ key: 'variable', label: 'Variable' }, { key: 'KMO', label: 'KMO individual', fmt: v => fmtNum(v, 3) }], r.tabla_kmo);
      el('m6KmoWrap').style.display = 'block';
    } else el('m6KmoWrap').style.display = 'none';
    el('m6RecResults').style.display = 'block';
    // preseleccionar método en la pestaña Factorial
    el('m6Method').value = r.primary === 'MCA' ? 'MCA' : r.primary === 'FAMD' ? 'FAMD' : 'PCA';
  } catch (err) { showMessage('m6Msg', 'error', (err.message || err).toString().split('\n').slice(-3).join('<br>')); }
  finally { hideSpinner(); }
});

/* ---------- FACTORIAL (PCA / FA / FAMD / MCA) ---------- */
el('m6RunFactor').addEventListener('click', runFactor);
async function runFactor() {
  const method = el('m6Method').value;
  B6.theme = el('m6Theme').value;
  showSpinner('Ejecutando ' + method + '…');
  try {
    await ensureMV();
    if (method === 'FA') {
      const nf = +el('m6Nfac').value || 2;
      const r = await runPyJSON(`fa_fit(${nf}, True)`);
      const dimKeys = r.loadings.length ? Object.keys(r.loadings[0]).filter(k => k.startsWith('F')) : [];
      buildTable('m6LoadTable', [
        { key: 'variable', label: 'Variable' },
        ...dimKeys.map(k => ({ key: k, label: k, fmt: v => fmtNum(v, 3) })),
        { key: 'comunalidad', label: 'Comunalidad', fmt: v => fmtNum(v, 3) },
        { key: 'unicidad', label: 'Unicidad', fmt: v => fmtNum(v, 3) },
      ], r.loadings);
      el('m6FactorNote').innerHTML = r.nota + ' · Varianza explicada por factor: ' + r.var_explicada.map(v => v + '%').join(', ');
      el('m6EigWrap').style.display = 'none'; el('m6DimDescWrap').style.display = 'none';
      el('m6CritBox').innerHTML = '';
      B6.factorDone = true; B6.method = 'FA';
      el('m6FactorResults').style.display = 'block';
      renderFactorFig('fa_loadings');
      ['scree', 'var_circle', 'ind', 'biplot', 'var_contrib'].forEach(k => el(FFIG[k]).innerHTML = '');
      return;
    }
    const ncomp = +el('m6Ncomp').value || 5;
    const r = await runPyJSON(`factor_fit(${JSON.stringify(method)}, True, ${ncomp})`);
    B6.method = method; B6.ncomp = r.ncomp;
    el('m6FactorNote').innerHTML = r.nota;
    buildTable('m6EigTable', [
      { key: 'dim', label: 'Dim' }, { key: 'autovalor', label: 'Autovalor / inercia', fmt: v => fmtNum(v, 4) },
      { key: 'pct', label: '% varianza', fmt: v => fmtNum(v, 2) }, { key: 'pct_acum', label: '% acumulado', fmt: v => fmtNum(v, 2) },
    ], r.eig);
    el('m6EigWrap').style.display = 'block';
    const C = r.criterios;
    el('m6CritBox').innerHTML = `<p class="hint">Nº de dimensiones a retener según cada criterio:</p>
      <div class="mini-tiles">
        <div><span>Kaiser</span><b>${C.kaiser}</b></div>
        <div><span>Bastón roto</span><b>${C.broken_stick}</b></div>
        ${C.analisis_paralelo != null ? `<div><span>Análisis paralelo</span><b>${C.analisis_paralelo}</b></div>` : ''}
        <div><span>80% varianza</span><b>${C.var_80pct}</b></div>
        <div><span>Recomendado</span><b>${C.recomendado}</b></div>
      </div>`;
    const loadKeys = r.loadings.length ? Object.keys(r.loadings[0]).filter(k => k.startsWith('Dim')) : [];
    buildTable('m6LoadTable', [
      { key: 'variable', label: 'Variable' },
      ...loadKeys.map(k => ({ key: k, label: k, fmt: v => fmtNum(v, 3) })),
      { key: 'cos2_2D', label: 'cos² (2D)', fmt: v => fmtNum(v, 3) },
    ], r.loadings);
    // descripción de dimensiones
    el('m6DimDesc').innerHTML = r.dimdesc.map(dd =>
      `<div class="dimdesc"><b>Dim ${dd.dim}</b>: ` +
      dd.vars.map(v => `<span class="${(v.r || 0) >= 0 ? 'pos' : 'neg'}">${v.variable} (${fmtNum(v.r, 2)})</span>`).join(' · ') + '</div>').join('');
    el('m6DimDescWrap').style.display = 'block';
    // ejes selector
    el('m6Axes').innerHTML = pairAxes(r.ncomp);
    el('m6ContribDim').innerHTML = [...Array(r.ncomp)].map((_, i) => `<option value="${i + 1}">Dim ${i + 1}</option>`).join('');
    B6.factorDone = true;
    el('m6FactorResults').style.display = 'block';
    ['scree', 'var_circle', 'ind', 'biplot', 'var_contrib'].forEach(renderFactorFig);
    el('m6FaLoadWrap') && (el('m6FaLoadWrap').style.display = 'none');
  } catch (err) {
    console.error(err); showMessage('m6Msg', 'error', (err.message || err).toString().split('\n').slice(-4).join('<br>'));
  } finally { hideSpinner(); }
}
function pairAxes(n) {
  const o = [];
  for (let i = 1; i <= n; i++) for (let j = i + 1; j <= n; j++) o.push(`<option value="${i},${j}">Dim ${i} – Dim ${j}</option>`);
  return o.join('');
}

const FFIG = { scree: 'm6FigScree', var_circle: 'm6FigCircle', ind: 'm6FigInd', biplot: 'm6FigBiplot', var_contrib: 'm6FigContrib', fa_loadings: 'm6FigFa' };
function factorOpts(kind) {
  const o = Object.assign({ axes: el('m6Axes').value || '1,2', palette: el('m6Palette').value, title: '' }, m6StyleExtra());
  if (kind === 'ind' || kind === 'biplot') { o.group = el('m6Group').value || null; o.ellipse = el('m6Ellipse').checked; o.ellipse_kind = el('m6EllipseKind').value; }
  if (kind === 'var_circle') o.color_by = el('m6CircleColor').value;
  if (kind === 'var_contrib') o.axes = (el('m6ContribDim').value || '1') + ',1';
  return o;
}
async function renderFactorFig(kind) {
  const box = el(FFIG[kind]); if (!box) return;
  box.classList.add('loading');
  try {
    const uri = await runPy(`factor_fig(${JSON.stringify(kind)}, "png", 170, ${JSON.stringify(B6.theme)}, ${JSON.stringify(JSON.stringify(factorOpts(kind)))})`);
    box.innerHTML = `<img src="${uri}"><div class="fig-dl">${['png', 'svg', 'pdf'].map(f => `<button class="btn btn-secondary btn-xs" data-k="${kind}" data-f="${f}">${f.toUpperCase()}</button>`).join('')}</div>`;
    els('button', box).forEach(b => b.addEventListener('click', () => expFactor(b.dataset.k, b.dataset.f)));
  } catch (err) { box.innerHTML = `<p class="msg msg-error">${(err.message || '').split('\n').slice(-2).join(' ')}</p>`; }
  finally { box.classList.remove('loading'); }
}
async function expFactor(kind, fmt) {
  showSpinner('Exportando…');
  try {
    const uri = await runPy(`factor_fig(${JSON.stringify(kind)}, ${JSON.stringify(fmt)}, ${+el('m6Dpi').value || 300}, ${JSON.stringify(B6.theme)}, ${JSON.stringify(JSON.stringify(factorOpts(kind)))})`);
    if (uri) download(dataURItoBlob(uri), `${slug(state.fileName)}_${B6.method}_${kind}.${fmt}`);
  } finally { hideSpinner(); }
}
['m6Axes', 'm6Group', 'm6Ellipse', 'm6EllipseKind', 'm6CircleColor', 'm6ContribDim', 'm6Palette', 'm6Theme',
 'm6Font', 'm6FontScale', 'm6Grid', 'm6Legend'].forEach(id =>
  el(id) && el(id).addEventListener('change', () => {
    B6.theme = el('m6Theme').value;
    if (B6.factorDone) { clearTimeout(B6._ft); B6._ft = setTimeout(() => ['scree', 'var_circle', 'ind', 'biplot', 'var_contrib'].forEach(renderFactorFig), 200); }
    if (B6.clustDone) { clearTimeout(B6._ct); B6._ct = setTimeout(() => ['scatter', 'silhouette', 'dendrogram', 'profile_heat', 'profile_parallel'].forEach(renderClustFig), 200); }
  }));
el('m6Method').addEventListener('change', () => {
  el('m6FaOpts').style.display = el('m6Method').value === 'FA' ? 'flex' : 'none';
  el('m6PcaOpts').style.display = el('m6Method').value === 'FA' ? 'none' : 'flex';
});
el('dlScoresCsv').addEventListener('click', async () => {
  const c = await runPy('factor_scores_csv()');
  if (c) download('﻿' + c, `${slug(state.fileName)}_coordenadas.csv`, 'text/csv;charset=utf-8');
});

/* ---------- CLUSTERING ---------- */
el('cl6Prep').addEventListener('click', async () => {
  showSpinner('Preparando datos para clustering…');
  try {
    await ensureMV(); await ensureClust();
    const src = el('cl6Source').value;
    if (src === 'pca' && !B6.factorDone) { showMessage('cl6Msg', 'error', 'Primero ejecuta un PCA en la pestaña «Factorial», o usa «variables estandarizadas».'); hideSpinner(); return; }
    const info = await runPyJSON(`clust_prepare(${JSON.stringify(src)}, ${+el('cl6Ndims').value || 3}, ${el('cl6Std').checked ? 'True' : 'False'})`);
    B6.clustPrepared = true;
    clearMessages('cl6Msg');
    const t = await runPyJSON('clust_tendency()');
    el('cl6TendBox').innerHTML = `<p><b>Hopkins = ${fmtNum(t.hopkins, 3)}</b> — ${t.interp}. <span class="hint">${t.nota}</span></p>`;
    renderClustFig('vat');
    setSpinner('Buscando el número óptimo de clusters…');
    const opt = await runPyJSON(`clust_optimal(${+el('cl6Kmax').value || 8})`);
    const C = opt.criterios;
    el('cl6OptBox').innerHTML = `<div class="mini-tiles">
      <div><span>Codo</span><b>${C.codo}</b></div><div><span>Silueta</span><b>${C.silueta}</b></div>
      <div><span>Calinski-Harabasz</span><b>${C.calinski_harabasz}</b></div><div><span>Davies-Bouldin</span><b>${C.davies_bouldin}</b></div>
      <div><span>Gap</span><b>${C.gap}</b></div><div><span>Recomendado</span><b>${C.recomendado}</b></div></div>
      <p class="hint">${opt.nota}</p>`;
    buildTable('cl6OptTable', [
      { key: 'k', label: 'k' }, { key: 'WSS', label: 'Inercia intra', fmt: v => fmtNum(v, 1) },
      { key: 'silueta', label: 'Silueta', fmt: v => fmtNum(v, 4) },
      { key: 'calinski_harabasz', label: 'Calinski-Harabasz', fmt: v => fmtNum(v, 1) },
      { key: 'davies_bouldin', label: 'Davies-Bouldin', fmt: v => fmtNum(v, 4) },
    ], opt.rows);
    renderClustFig('optimal');
    el('cl6K').value = C.recomendado;
    el('cl6Results').style.display = 'block';
  } catch (err) { console.error(err); showMessage('cl6Msg', 'error', (err.message || err).toString().split('\n').slice(-4).join('<br>')); }
  finally { hideSpinner(); }
});

el('cl6Method').addEventListener('change', () => {
  el('cl6DbscanOpts').style.display = el('cl6Method').value === 'dbscan' ? 'flex' : 'none';
  el('cl6KWrap').style.display = el('cl6Method').value === 'dbscan' ? 'none' : 'flex';
});

el('cl6Run').addEventListener('click', async () => {
  if (!B6.clustPrepared) { showMessage('cl6Msg', 'error', 'Pulsa antes «Preparar y explorar».'); return; }
  showSpinner('Agrupando…');
  try {
    const method = el('cl6Method').value;
    const r = await runPyJSON(`clust_fit(${JSON.stringify(method)}, ${+el('cl6K').value || 3}, ${+el('cl6Eps').value || 1.5}, ${+el('cl6MinPts').value || 5}, ${JSON.stringify(el('cl6Group').value || '')})`);
    buildTable('cl6SizeTable', [{ key: 'cluster', label: 'Cluster' }, { key: 'n', label: 'n' }, { key: 'pct', label: '%', fmt: v => fmtNum(v, 1) }], r.sizes);
    const v = r.validacion;
    el('cl6ValBox').innerHTML = `<div class="mini-tiles">` +
      Object.entries(v).map(([k, val]) => `<div><span>${k.replace(/_/g, ' ')}</span><b>${fmtNum(val, 4)}</b></div>`).join('') +
      `</div><p class="hint">${r.nota}</p>`;
    // perfil
    const prof = await runPyJSON('clust_profile()');
    const cKeys = prof.clusters.map(c => 'C' + c);
    buildTable('cl6ProfTable', [
      { key: 'variable', label: 'Variable' }, { key: 'eta2', label: 'η² (separación)', fmt: v => fmtNum(v, 3) },
      { key: 'F', label: 'F', fmt: v => fmtNum(v, 1) }, { key: 'p', label: 'p', fmt: fmtP },
      ...cKeys.map(k => ({ key: k, label: 'Media ' + k, fmt: v => fmtNum(v, 3) })),
    ], prof.rows);
    el('cl6ProfNote').innerHTML = prof.nota;
    B6.clustDone = true;
    el('cl6FitResults').style.display = 'block';
    ['scatter', 'silhouette', 'dendrogram', 'profile_heat', 'profile_parallel'].forEach(renderClustFig);
    if (el('cl6Group').value) renderClustFig('compare_group');
    el('cl6CompareWrap').style.display = el('cl6Group').value ? 'block' : 'none';
  } catch (err) { console.error(err); showMessage('cl6Msg', 'error', (err.message || err).toString().split('\n').slice(-4).join('<br>')); }
  finally { hideSpinner(); }
});

const CLFIG = { vat: 'cl6FigVat', optimal: 'cl6FigOpt', scatter: 'cl6FigScatter', silhouette: 'cl6FigSil',
  dendrogram: 'cl6FigDendro', profile_heat: 'cl6FigProfHeat', profile_parallel: 'cl6FigProfPar', compare_group: 'cl6FigCompare' };
function clustOpts(kind) {
  const o = Object.assign({ palette: el('cl6Palette').value, title: '' }, m6StyleExtra());
  if (kind === 'scatter') { o.ellipse = el('cl6Ellipse').checked; o.ellipse_kind = el('cl6EllipseKind').value; }
  if (kind === 'dendrogram') o.k = +el('cl6K').value || 3;
  if (kind === 'compare_group') o.group = el('cl6Group').value;
  return o;
}
async function renderClustFig(kind) {
  const box = el(CLFIG[kind]); if (!box) return;
  box.classList.add('loading');
  try {
    const uri = await runPy(`clust_fig(${JSON.stringify(kind)}, "png", 170, ${JSON.stringify(el('m6Theme').value || 'StatsPro')}, ${JSON.stringify(JSON.stringify(clustOpts(kind)))})`);
    box.innerHTML = `<img src="${uri}"><div class="fig-dl">${['png', 'svg', 'pdf'].map(f => `<button class="btn btn-secondary btn-xs" data-k="${kind}" data-f="${f}">${f.toUpperCase()}</button>`).join('')}</div>`;
    els('button', box).forEach(b => b.addEventListener('click', () => expClust(b.dataset.k, b.dataset.f)));
  } catch (err) { box.innerHTML = `<p class="msg msg-error">${(err.message || '').split('\n').slice(-2).join(' ')}</p>`; }
  finally { box.classList.remove('loading'); }
}
async function expClust(kind, fmt) {
  showSpinner('Exportando…');
  try {
    const uri = await runPy(`clust_fig(${JSON.stringify(kind)}, ${JSON.stringify(fmt)}, ${+el('cl6Dpi').value || 300}, ${JSON.stringify(el('m6Theme').value || 'StatsPro')}, ${JSON.stringify(JSON.stringify(clustOpts(kind)))})`);
    if (uri) download(dataURItoBlob(uri), `${slug(state.fileName)}_cluster_${kind}.${fmt}`);
  } finally { hideSpinner(); }
}
['cl6Palette', 'cl6Ellipse', 'cl6EllipseKind'].forEach(id => el(id).addEventListener('change', () => {
  if (B6.clustDone) renderClustFig('scatter');
}));
el('dlClustCsv').addEventListener('click', async () => {
  const c = await runPy('clust_labels_csv()');
  if (c) download('﻿' + c, `${slug(state.fileName)}_clusters.csv`, 'text/csv;charset=utf-8');
});
