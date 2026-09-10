/* Bloque 5 — Correlación (controlador JS). */

let corrReady = false;
const C5 = { prepared: false, theme: 'StatsPro' };

document.addEventListener('analizar:data', build5);
initTabs('panel-5');

function build5() {
  const nums = (state.info && state.info.numeric) || [];
  const cats = (state.info && state.info.categorical) || [];
  el('c5Vars').innerHTML = nums.map(v => `<label class="checkbox-label"><input type="checkbox" value="${v}" checked> ${v}</label>`).join('');
  el('c5Theme').innerHTML = ['StatsPro', 'Minimal', 'Publicacion', 'Cuadricula', 'Clasico', 'Oscuro'].map(t => `<option>${t}</option>`).join('');
  // par
  el('c5PairX').innerHTML = nums.map(v => `<option>${v}</option>`).join('');
  el('c5PairY').innerHTML = nums.map((v, i) => `<option ${i === 1 ? 'selected' : ''}>${v}</option>`).join('');
  el('c5PairGroup').innerHTML = `<option value="">— ninguno —</option>` + cats.map(c => `<option>${c}</option>`).join('');
  // semiparcial
  el('c5SpTarget').innerHTML = nums.map(v => `<option>${v}</option>`).join('');
  el('c5SpOthers').innerHTML = nums.map(v => `<label class="checkbox-label"><input type="checkbox" value="${v}" checked> ${v}</label>`).join('');
  // canónica
  el('c5CcaX').innerHTML = nums.map((v, i) => `<label class="checkbox-label"><input type="checkbox" value="${v}" ${i < 2 ? 'checked' : ''}> ${v}</label>`).join('');
  el('c5CcaY').innerHTML = nums.map((v, i) => `<label class="checkbox-label"><input type="checkbox" value="${v}" ${i >= 2 ? 'checked' : ''}> ${v}</label>`).join('');
  el('c5CcaGroup').innerHTML = `<option value="">— ninguno —</option>` + cats.map(c => `<option>${c}</option>`).join('');
  el('c5PairsGroup').innerHTML = `<option value="">— ninguno —</option>` + cats.map(c => `<option>${c}</option>`).join('');
}

async function ensureCorr() {
  await ensurePackages(['scipy', 'scikit-learn']);
  if (!corrReady) { (await getPyodide()).runPython(PY_CORR); corrReady = true; }
  if (!C5.prepared) {
    const nums = (state.info && state.info.numeric) || [];
    const cats = (state.info && state.info.categorical) || [];
    await runPy('corr_prepare(_pn, _pc)', { _pn: JSON.stringify(nums), _pc: JSON.stringify(cats) });
    C5.prepared = true;
  }
}

/* ---------- MATRIZ ---------- */
el('c5RunMatrix').addEventListener('click', runMatrix);
async function runMatrix() {
  const method = el('c5Method').value;
  const padj = el('c5Padj').value;
  C5.theme = el('c5Theme').value;
  showSpinner('Calculando matriz de correlación…');
  try {
    await ensureCorr();
    const r = await runPyJSON(`corr_matrix(${JSON.stringify(method)}, ${JSON.stringify(padj)})`);
    el('c5MatrixNote').innerHTML = r.note;
    buildTable('c5PairTable', [
      { key: 'v1', label: 'Variable 1' }, { key: 'v2', label: 'Variable 2' },
      { key: 'r', label: 'r', fmt: v => fmtNum(v, 4) }, { key: 'IC_inf', label: 'IC 95% inf', fmt: v => fmtNum(v, 3) },
      { key: 'IC_sup', label: 'IC 95% sup', fmt: v => fmtNum(v, 3) },
      { key: 'p', label: 'p', fmt: fmtP }, { key: 'p_ajust', label: 'p ajustado', fmt: fmtP },
      { key: 'sig', label: '' }, { key: 'n', label: 'n' }, { key: 'fuerza', label: 'Fuerza' },
    ], r.pairs);
    state.corr = { pairs: r.pairs };
    el('c5MatrixResults').style.display = 'block';
    C5.matrixDone = true;
    ['heatmap', 'corrplot', 'network', 'pairs'].forEach(k => renderCorrFig(k));
  } catch (err) {
    console.error(err); showMessage('c5Messages', 'error', 'Error: ' + (err.message || err).toString().split('\n').slice(-3).join('<br>'));
  } finally { hideSpinner(); }
}
el('dlCorrCsv').addEventListener('click', () => {
  if (!state.corr) return;
  download(toCSV([
    { key: 'v1', label: 'variable_1' }, { key: 'v2', label: 'variable_2' }, { key: 'r' },
    { key: 'IC_inf' }, { key: 'IC_sup' }, { key: 'p' }, { key: 'p_ajust' }, { key: 'n' }, { key: 'fuerza' },
  ], state.corr.pairs), `${slug(state.fileName)}_correlaciones.csv`, 'text/csv;charset=utf-8');
});

/* ---------- figuras matriz ---------- */
const CFIG = { heatmap: 'c5FigHeat', corrplot: 'c5FigCorrplot', network: 'c5FigNet', pairs: 'c5FigPairs',
  pair: 'c5FigPair', cca_scatter: 'c5FigCca', cca_loadings: 'c5FigCcaLoad' };
function corrFigOpts(kind) {
  const o = { title: '', cluster: el('c5Cluster').checked, mask: el('c5Mask').value };
  if (kind === 'network') o.thr = +el('c5NetThr').value || 0.3;
  if (kind === 'pairs') { o.vars = els('#c5Vars input:checked').map(c => c.value).slice(0, 6); o.group = el('c5PairsGroup').value || null; o.palette = 'StatsPro'; }
  if (kind === 'pair') { o.x = el('c5PairX').value; o.y = el('c5PairY').value; }
  if (kind === 'cca_scatter' || kind === 'cca_loadings') { o.dim = +el('c5CcaDim').value || 1; o.group = el('c5CcaGroup').value || null; }
  return o;
}
async function renderCorrFig(kind) {
  const box = el(CFIG[kind]); if (!box) return;
  box.classList.add('loading');
  try {
    const uri = await runPy(`corr_fig(${JSON.stringify(kind)}, "png", 140, ${JSON.stringify(C5.theme)}, ${JSON.stringify(JSON.stringify(corrFigOpts(kind)))})`);
    box.innerHTML = `<img src="${uri}"><div class="fig-dl">${['png', 'svg', 'pdf'].map(f => `<button class="btn btn-secondary btn-xs" data-k="${kind}" data-f="${f}">${f.toUpperCase()}</button>`).join('')}</div>`;
    els('button', box).forEach(b => b.addEventListener('click', () => exportCorrFig(b.dataset.k, b.dataset.f)));
  } catch (err) { box.innerHTML = `<p class="msg msg-error">${(err.message || '').split('\n').slice(-2).join(' ')}</p>`; }
  finally { box.classList.remove('loading'); }
}
async function exportCorrFig(kind, fmt) {
  showSpinner('Exportando…');
  try {
    const dpi = +el('c5Dpi').value || 300;
    const uri = await runPy(`corr_fig(${JSON.stringify(kind)}, ${JSON.stringify(fmt)}, ${dpi}, ${JSON.stringify(C5.theme)}, ${JSON.stringify(JSON.stringify(corrFigOpts(kind)))})`);
    if (uri) download(dataURItoBlob(uri), `${slug(state.fileName)}_corr_${kind}.${fmt}`);
  } finally { hideSpinner(); }
}
['c5Cluster', 'c5Mask', 'c5NetThr', 'c5PairsGroup'].forEach(id => el(id).addEventListener('change', () => {
  if (!C5.matrixDone) return;
  clearTimeout(C5._t); C5._t = setTimeout(() => ['heatmap', 'corrplot', 'network', 'pairs'].forEach(renderCorrFig), 250);
}));
el('c5Theme').addEventListener('change', () => { C5.theme = el('c5Theme').value; if (C5.matrixDone) ['heatmap', 'corrplot', 'network', 'pairs'].forEach(renderCorrFig); });

/* ---------- PAR ---------- */
el('c5RunPair').addEventListener('click', runPair);
['c5PairX', 'c5PairY'].forEach(id => el(id).addEventListener('change', () => { if (C5.pairDone) runPair(); }));
async function runPair() {
  const x = el('c5PairX').value, y = el('c5PairY').value;
  if (x === y) { showMessage('c5PairMsg', 'error', 'Elige dos variables distintas.'); return; }
  clearMessages('c5PairMsg');
  showSpinner('Analizando el par…');
  try {
    await ensureCorr();
    const r = await runPyJSON(`corr_pair(${JSON.stringify(x)}, ${JSON.stringify(y)})`);
    buildTable('c5PairTestTable', [
      { key: 'metodo', label: 'Método' }, { key: 'r', label: 'Coeficiente', fmt: v => fmtNum(v, 4) },
      { key: 'IC_inf', label: 'IC inf', fmt: v => fmtNum(v, 3) }, { key: 'IC_sup', label: 'IC sup', fmt: v => fmtNum(v, 3) },
      { key: 'p', label: 'p', fmt: fmtP }, { key: 'fuerza', label: 'Interpretación' },
    ], r.tests);
    el('c5PairNote').innerHTML = `<span class="hint">n = ${r.n}.</span> ${r.nota}`;
    el('c5PairResults').style.display = 'block';
    C5.pairDone = true;
    renderCorrFig('pair');
  } catch (err) { showMessage('c5PairMsg', 'error', err.message); }
  finally { hideSpinner(); }
}

/* ---------- PARCIAL ---------- */
el('c5RunPartial').addEventListener('click', async () => {
  showSpinner('Calculando correlación parcial…');
  try {
    await ensureCorr();
    const method = el('c5PartMethod').value;
    const r = await runPyJSON(`corr_partial(${JSON.stringify(method)}, "[]")`);
    el('c5PartNote').innerHTML = r.nota + ` <span class="hint">(gl = ${r.gl})</span>`;
    buildTable('c5PartTable', [
      { key: 'v1', label: 'Variable 1' }, { key: 'v2', label: 'Variable 2' },
      { key: 'r_parcial', label: 'r parcial', fmt: v => fmtNum(v, 4) }, { key: 'r_simple', label: 'r simple', fmt: v => fmtNum(v, 4) },
      { key: 'p', label: 'p', fmt: fmtP }, { key: 'p_ajust', label: 'p ajustado', fmt: fmtP }, { key: 'sig', label: '' },
    ], r.pairs);
    C5.partialR = r;
    el('c5PartResults').style.display = 'block';
    renderPartialHeat();
  } catch (err) { showMessage('c5Messages', 'error', err.message); }
  finally { hideSpinner(); }
});
async function renderPartialHeat() {
  const box = el('c5FigPartHeat'); box.classList.add('loading');
  try {
    const uri = await runPy(`corr_fig("partial_heat", "png", 140, ${JSON.stringify(C5.theme)}, "{}")`);
    box.innerHTML = `<img src="${uri}"><div class="fig-dl">${['png', 'svg', 'pdf'].map(f => `<button class="btn btn-secondary btn-xs" data-f="${f}">${f.toUpperCase()}</button>`).join('')}</div>`;
    els('button', box).forEach(b => b.addEventListener('click', async () => {
      showSpinner('Exportando…');
      try {
        const uri2 = await runPy(`corr_fig("partial_heat", ${JSON.stringify(b.dataset.f)}, ${+el('c5Dpi').value || 300}, ${JSON.stringify(C5.theme)}, "{}")`);
        if (uri2) download(dataURItoBlob(uri2), `${slug(state.fileName)}_corr_parcial.${b.dataset.f}`);
      } finally { hideSpinner(); }
    }));
  } catch (e) { box.innerHTML = `<p class="msg msg-error">${e.message}</p>`; }
  finally { box.classList.remove('loading'); }
}

/* ---------- SEMIPARCIAL ---------- */
el('c5RunSp').addEventListener('click', async () => {
  const target = el('c5SpTarget').value;
  const others = els('#c5SpOthers input:checked').map(c => c.value).filter(v => v !== target);
  if (others.length < 2) { showMessage('c5Messages', 'error', 'Elige al menos 2 predictores.'); return; }
  showSpinner('Calculando…');
  try {
    await ensureCorr();
    const r = await runPyJSON(`corr_semipartial(${JSON.stringify(target)}, ${JSON.stringify(JSON.stringify(others))})`);
    el('c5SpNote').innerHTML = r.nota;
    buildTable('c5SpTable', [
      { key: 'predictor', label: 'Predictor' }, { key: 'r_simple', label: 'r simple', fmt: v => fmtNum(v, 4) },
      { key: 'r_semiparcial', label: 'r semiparcial', fmt: v => fmtNum(v, 4) },
      { key: 'r2_unico', label: 'R² único', fmt: v => fmtNum(v, 4) }, { key: 'p_simple', label: 'p (simple)', fmt: fmtP },
    ], r.rows);
    el('c5SpResults').style.display = 'block';
  } catch (err) { showMessage('c5Messages', 'error', err.message); }
  finally { hideSpinner(); }
});

/* ---------- CATEGÓRICAS ---------- */
el('c5RunCat').addEventListener('click', async () => {
  showSpinner('Midiendo asociaciones…');
  try {
    await ensureCorr();
    const rows = await runPyJSON('corr_categorical()');
    if (!rows.length) { el('c5CatTable').innerHTML = '<p class="hint">Se necesita al menos una variable categórica.</p>'; }
    else buildTable('c5CatTable', [
      { key: 'par', label: 'Par' }, { key: 'tipo', label: 'Tipo' }, { key: 'medida', label: 'Medida' },
      { key: 'valor', label: 'Valor', fmt: v => fmtNum(v, 4) }, { key: 'p', label: 'p', fmt: fmtP },
      { key: 'fuerza', label: 'Fuerza' }, { key: 'n', label: 'n' }, { key: 'nota', label: 'Nota' },
    ], rows);
    el('c5CatResults').style.display = 'block';
  } catch (err) { showMessage('c5Messages', 'error', err.message); }
  finally { hideSpinner(); }
});

/* ---------- CANÓNICA ---------- */
el('c5RunCca').addEventListener('click', async () => {
  const xs = els('#c5CcaX input:checked').map(c => c.value);
  const ys = els('#c5CcaY input:checked').map(c => c.value);
  const overlap = xs.filter(v => ys.includes(v));
  if (xs.length < 2 || ys.length < 2) { showMessage('c5CcaMsg', 'error', 'Cada grupo necesita ≥ 2 variables.'); return; }
  if (overlap.length) { showMessage('c5CcaMsg', 'error', 'Una variable no puede estar en ambos grupos: ' + overlap.join(', ')); return; }
  clearMessages('c5CcaMsg');
  showSpinner('Correlación canónica…');
  try {
    await ensureCorr();
    const r = await runPyJSON(`cca_run(${JSON.stringify(JSON.stringify(xs))}, ${JSON.stringify(JSON.stringify(ys))})`);
    el('c5CcaNote').innerHTML = r.nota;
    buildTable('c5CcaDimTable', [
      { key: 'dimension', label: 'Dimensión' }, { key: 'r_canonica', label: 'r canónica', fmt: v => fmtNum(v, 4) },
      { key: 'r2', label: 'r²', fmt: v => fmtNum(v, 4) }, { key: 'wilks_lambda', label: 'Λ de Wilks', fmt: v => fmtNum(v, 4) },
      { key: 'chi2', label: 'χ²', fmt: v => fmtNum(v, 2) }, { key: 'gl', label: 'gl' }, { key: 'p', label: 'p', fmt: fmtP },
    ], r.dims);
    const dimKeys = r.dims.map(d => 'dim' + d.dimension);
    const cols = [{ key: 'variable', label: 'Variable' }, ...dimKeys.map(k => ({ key: k, label: k.replace('dim', 'Dim '), fmt: v => fmtNum(v, 3) }))];
    buildTable('c5CcaLxTable', cols, r.loadings_x);
    buildTable('c5CcaLyTable', cols, r.loadings_y);
    el('c5CcaDim').innerHTML = r.dims.map(d => `<option value="${d.dimension}">Dimensión ${d.dimension}</option>`).join('');
    el('c5CcaResults').style.display = 'block';
    C5.ccaDone = true;
    renderCorrFig('cca_scatter'); renderCorrFig('cca_loadings');
  } catch (err) { showMessage('c5CcaMsg', 'error', (err.message || err).toString().split('\n').slice(-3).join('<br>')); }
  finally { hideSpinner(); }
});
el('c5CcaDim').addEventListener('change', () => { if (C5.ccaDone) { renderCorrFig('cca_scatter'); renderCorrFig('cca_loadings'); } });
el('c5CcaGroup').addEventListener('change', () => { if (C5.ccaDone) renderCorrFig('cca_scatter'); });
