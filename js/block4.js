/* Bloque 4a — Regresión (controlador JS). */

let regReady = false;
const R4 = { fitted: false, theme: 'AnalizaR' };

document.addEventListener('analizar:data', build4);
initTabs('panel-4');

function build4() {
  const nums = (state.info && state.info.numeric) || [];
  const cats = (state.info && state.info.categorical) || [];
  el('r4Resp').innerHTML = nums.map(v => `<option>${v}</option>`).join('');
  el('r4NumX').innerHTML = nums.map(v => `<label class="checkbox-label"><input type="checkbox" value="${v}"> ${v}</label>`).join('');
  el('r4CatX').innerHTML = cats.length
    ? cats.map(c => `<label class="checkbox-label"><input type="checkbox" value="${c}"> ${c}</label>`).join('')
    : '<p class="hint">Sin variables categóricas.</p>';
  el('r4Theme').innerHTML = ['AnalizaR', 'Minimal', 'Publicacion', 'Cuadricula', 'Clasico', 'Oscuro'].map(t => `<option>${t}</option>`).join('');
  // no permitir respuesta como predictor
  el('r4Resp').addEventListener('change', () => {
    els('#r4NumX input').forEach(i => { i.disabled = i.value === el('r4Resp').value; if (i.disabled) i.checked = false; });
  });
}

el('r4RunBtn').addEventListener('click', runRegression);

async function ensureReg() {
  await ensurePackages(['scipy', 'statsmodels', 'scikit-learn']);
  if (!regReady) { (await getPyodide()).runPython(PY_REG); regReady = true; }
}

async function runRegression() {
  const resp = el('r4Resp').value;
  const numX = els('#r4NumX input:checked').map(c => c.value);
  const catX = els('#r4CatX input:checked').map(c => c.value);
  if (!resp) { showMessage('r4Messages', 'error', 'Elige la variable respuesta.'); return; }
  if (!numX.length && !catX.length) { showMessage('r4Messages', 'error', 'Elige al menos un predictor.'); return; }
  R4.theme = el('r4Theme').value;
  clearMessages('r4Messages');
  showSpinner('Preparando datos…');
  try {
    await ensureReg();
    const info = await runPyJSON('reg_prepare(_resp, _nx, _cx)', { _resp: resp, _nx: JSON.stringify(numX), _cx: JSON.stringify(catX) });
    setSpinner('Ajustando modelos (esto puede tardar ~15 s)…');
    const fit = await runPyJSON('reg_fit()');
    setSpinner('Comparando y recomendando…');
    const nested = await runPyJSON('reg_nested_tests()');
    const rec = await runPyJSON('reg_recommend()');

    renderRegTable(fit, rec.best);
    renderRecommend(rec);
    renderNested(nested);

    // detalle: llenar dropdown y mostrar el mejor
    const dv = el('r4DetailSel');
    dv.innerHTML = fit.models.map(m => `<option ${m.nombre === rec.best ? 'selected' : ''}>${m.nombre}</option>`).join('');
    await renderDetail(rec.best);
    await renderRegFig('compare', rec.best);

    R4.fitted = true;
    el('r4Results').style.display = 'block';
    showMessage('r4Messages', 'success', `Listo: ${fit.models.length} modelos ajustados. Mejor por RMSE de validación cruzada: <b>${rec.best}</b>.`);
  } catch (err) {
    console.error(err);
    showMessage('r4Messages', 'error', 'Error: ' + (err.message || err).toString().split('\n').slice(-4).join('<br>'));
  } finally { hideSpinner(); }
}

const REG_COLS = [
  { key: 'rank_rmse', label: '#' }, { key: 'nombre', label: 'Modelo' }, { key: 'familia', label: 'Tipo' },
  { key: 'RMSE_cv', label: 'RMSE (CV)', fmt: v => fmtNum(v, 4) }, { key: 'MAE_cv', label: 'MAE (CV)', fmt: v => fmtNum(v, 4) },
  { key: 'R2', label: 'R²', fmt: v => fmtNum(v, 3) }, { key: 'R2aj', label: 'R² aj.', fmt: v => fmtNum(v, 3) },
  { key: 'AIC', label: 'AIC', fmt: v => fmtNum(v, 1) }, { key: 'BIC', label: 'BIC', fmt: v => fmtNum(v, 1) },
  { key: 'k', label: 'nº parám.' },
];

function renderRegTable(fit, best) {
  const rows = fit.models.slice().sort((a, b) =>
    (a.RMSE_cv == null) - (b.RMSE_cv == null) || (a.RMSE_cv ?? 1e18) - (b.RMSE_cv ?? 1e18));
  buildTable('r4Table', REG_COLS, rows);
  els('#r4Table tbody tr').forEach(tr => {
    if (tr.children[1] && tr.children[1].textContent === best) tr.classList.add('row-best');
  });
  state.reg = { rows };
}

el('dlRegCsv') && el('dlRegCsv').addEventListener('click', () => {
  if (!state.reg) return;
  download(toCSV(REG_COLS, state.reg.rows), `${slug(state.fileName)}_comparacion_modelos.csv`, 'text/csv;charset=utf-8');
});

function renderRecommend(rec) {
  let html = `<p class="rec-head">Modelo recomendado: <b>${rec.best}</b> <span class="verdict ok">${rec.familia}</span>
    <span class="hint">— menor error de predicción (RMSE CV = ${fmtNum(rec.best_rmse, 4)})</span></p>`;
  if (rec.tips && rec.tips.length) {
    html += '<p class="hint">Qué dicen tus datos sobre el tipo de regresión:</p><ul>' +
      rec.tips.map(t => `<li>${t}</li>`).join('') + '</ul>';
  }
  el('r4RecBox').innerHTML = html;
}

function renderNested(nested) {
  if (!nested.length) { el('r4NestedWrap').style.display = 'none'; return; }
  el('r4NestedWrap').style.display = 'block';
  buildTable('r4NestedTable', [
    { key: 'reducido', label: 'Modelo reducido' }, { key: 'completo', label: 'Modelo completo' },
    { key: 'F', label: 'F', fmt: v => fmtNum(v, 3) }, { key: 'gl', label: 'gl' }, { key: 'p', label: 'p', fmt: fmtP },
    { key: 'conclusion', label: 'Conclusión' },
  ], nested);
}

el('r4DetailSel').addEventListener('change', e => { renderDetail(e.target.value); renderRegFig('compare', e.target.value); });

async function renderDetail(name) {
  const dt = await runPyJSON(`reg_detail(${JSON.stringify(name)})`);
  if (!dt.nombre) { el('r4DetailBox').innerHTML = '<p class="hint">Sin detalle disponible.</p>'; return; }
  statTiles('r4DetailTiles', [
    ['R²', fmtNum(dt.R2, 3)], ['R² ajustado', fmtNum(dt.R2aj, 3)],
    ['RMSE (CV)', fmtNum(dt.RMSE_cv, 4)], ['MAE (CV)', fmtNum(dt.MAE_cv, 4)],
    ['AIC', fmtNum(dt.AIC, 1)], ['BIC', fmtNum(dt.BIC, 1)],
    ['F global', dt.F_global != null ? `${fmtNum(dt.F_global, 2)} (p ${fmtP(dt.F_p)})` : '—'],
    ['nº parámetros', dt.k ?? '—'],
  ]);
  let coefHtml = '';
  if (dt.coeficientes && dt.coeficientes.length) {
    const hasP = dt.coeficientes[0].p !== undefined;
    coefHtml = `<div class="table-scroll" id="r4CoefTable"></div>`;
  }
  el('r4DetailBox').innerHTML = `<p class="hint">${dt.nota || ''}${dt.formula ? ' · <code>' + dt.formula + '</code>' : ''}</p>` + coefHtml +
    (dt.params_nl ? `<p class="hint">Parámetros ajustados: ${dt.params_nl.map(p => fmtNum(p, 4)).join(', ')}</p>` : '');
  if (dt.coeficientes && dt.coeficientes.length) {
    const cols = [{ key: 'termino', label: 'Término' }, { key: 'coef', label: 'Coeficiente', fmt: v => fmtNum(v, 5) }];
    if (dt.coeficientes[0].EE !== undefined) cols.push(
      { key: 'EE', label: 'Error estándar', fmt: v => fmtNum(v, 5) },
      { key: 't', label: 't', fmt: v => fmtNum(v, 2) }, { key: 'p', label: 'p', fmt: fmtP },
      { key: 'IC_inf', label: 'IC 95% inf', fmt: v => fmtNum(v, 4) }, { key: 'IC_sup', label: 'IC 95% sup', fmt: v => fmtNum(v, 4) });
    buildTable('r4CoefTable', cols, dt.coeficientes);
  }
  // figuras del modelo
  renderRegFig('fit', name);
  renderRegFig('resid', name);
  renderRegFig('qq', name);
}

const FIGS4 = { compare: 'r4FigCompare', fit: 'r4FigFit', resid: 'r4FigResid', qq: 'r4FigQQ' };
async function renderRegFig(kind, name) {
  const box = el(FIGS4[kind]); if (!box) return;
  box.classList.add('loading');
  try {
    const uri = await runPy(`reg_fig(${JSON.stringify(name)}, ${JSON.stringify(kind)}, "png", 140, ${JSON.stringify(R4.theme)})`);
    box.innerHTML = `<img src="${uri}">
      <div class="fig-dl">
        ${['png', 'svg', 'pdf'].map(f => `<button class="btn btn-secondary btn-xs" data-k="${kind}" data-n="${name}" data-f="${f}">${f.toUpperCase()}</button>`).join('')}
      </div>`;
    els('button', box).forEach(b => b.addEventListener('click', () => exportReg(b.dataset.k, b.dataset.n, b.dataset.f)));
  } catch (err) { box.innerHTML = `<p class="msg msg-error">${err.message}</p>`; }
  finally { box.classList.remove('loading'); }
}

async function exportReg(kind, name, fmt) {
  showSpinner('Exportando…');
  try {
    const dpi = +el('r4Dpi').value || 300;
    const uri = await runPy(`reg_fig(${JSON.stringify(name)}, ${JSON.stringify(kind)}, ${JSON.stringify(fmt)}, ${dpi}, ${JSON.stringify(R4.theme)})`);
    if (uri) download(dataURItoBlob(uri), `${slug(state.fileName)}_reg_${kind}_${slug(name)}.${fmt}`);
  } finally { hideSpinner(); }
}

el('r4Theme').addEventListener('change', () => {
  if (!R4.fitted) return;
  R4.theme = el('r4Theme').value;
  const name = el('r4DetailSel').value;
  ['compare', 'fit', 'resid', 'qq'].forEach(k => renderRegFig(k, name));
});
