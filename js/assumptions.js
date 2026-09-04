/* Bloque 3 — Supuestos del ANOVA (controlador JS). */

let assumpReady = false;
const A3 = { fitted: false, theme: 'AnalizaR' };

const FIG_INFO = {
  panel4: ['Diagnóstico general (4 paneles)', 'El cuadro clásico de diagnóstico: residuales vs. ajustados, Q–Q, escala–ubicación e influencia. Ideal para incluir tal cual en una tesis.'],
  qq: ['Q–Q normal con banda 95%', 'Si los puntos siguen la recta y quedan dentro de la banda, los residuales son compatibles con la normal.'],
  pp: ['P–P normal', 'Compara la probabilidad acumulada empírica con la teórica. Sensible al centro de la distribución.'],
  hist_resid: ['Histograma de residuales', 'Con la curva normal teórica y la densidad observada superpuestas.'],
  resid_fitted: ['Residuales vs. ajustados', 'Debe verse una nube sin forma alrededor de 0. Un embudo indica heterocedasticidad; una curva, falta de ajuste.'],
  scale_location: ['Escala–ubicación', 'La línea roja debe ser aproximadamente horizontal si la varianza es constante.'],
  resid_box_group: ['Residuales por grupo', 'Las cajas deben tener una altura parecida y centrarse en 0.'],
  sd_group: ['Dispersión por grupo', 'Barras de desviación estándar por grupo (± error estándar).'],
  resid_order: ['Residuales vs. orden', 'Un patrón (tendencia, ciclos, rachas) sugiere falta de independencia.'],
  acf: ['Autocorrelación (ACF)', 'Barras fuera de las líneas rojas indican autocorrelación en ese rezago.'],
  cooks: ['Distancia de Cook', 'Observaciones por encima de 4/n tienen influencia desproporcionada en el modelo.'],
  influence: ['Gráfico de influencia', 'Residual estudentizado vs. apalancamiento; el tamaño del punto es proporcional a la distancia de Cook.'],
};

document.addEventListener('analizar:data', build3);

function build3() {
  const nums = (state.info && state.info.numeric) || [];
  const cats = (state.info && state.info.categorical) || [];
  el('a3Resp').innerHTML = nums.map(v => `<option>${v}</option>`).join('');
  el('a3Factors').innerHTML = cats.length
    ? cats.map(c => `<label class="checkbox-label"><input type="checkbox" value="${c}"> ${c}</label>`).join('')
    : '<p class="hint">No hay variables categóricas. El análisis de supuestos del ANOVA necesita al menos un factor (grupo/tratamiento).</p>';
  el('a3Theme').innerHTML = ['AnalizaR', 'Minimal', 'Publicacion', 'Cuadricula', 'Clasico', 'Oscuro']
    .map(t => `<option>${t}</option>`).join('');
}

el('a3Factors').addEventListener('change', () => {
  const n = els('#a3Factors input:checked').length;
  el('a3InterWrap').style.display = n >= 2 ? 'flex' : 'none';
});

el('a3RunBtn').addEventListener('click', runAssumptions);

async function ensureAssump() {
  await ensurePackages(['scipy', 'statsmodels']);
  if (!assumpReady) {
    (await getPyodide()).runPython(PY_ASSUMP);
    assumpReady = true;
  }
}

async function runAssumptions() {
  const resp = el('a3Resp').value;
  const factors = els('#a3Factors input:checked').map(c => c.value);
  if (!resp) { showMessage('a3Messages', 'error', 'Elige la variable respuesta.'); return; }
  if (!factors.length) { showMessage('a3Messages', 'error', 'Elige al menos un factor.'); return; }
  const inter = el('a3Inter').checked && factors.length >= 2;
  A3.theme = el('a3Theme').value;
  clearMessages('a3Messages');
  showSpinner('Ajustando el modelo…');
  try {
    await ensureAssump();
    const fit = await runPyJSON('fit_model(_resp, _fac, _intr)', { _resp: resp, _fac: JSON.stringify(factors), _intr: inter });
    renderModelCard(fit);

    setSpinner('Evaluando normalidad…');
    const norm = await runPyJSON('normality_block()');
    setSpinner('Evaluando homocedasticidad…');
    const homo = await runPyJSON('homoced_block()');
    setSpinner('Evaluando independencia…');
    const indep = await runPyJSON('independence_block()');
    setSpinner('Buscando observaciones influyentes…');
    const infl = await runPyJSON('influence_block()');
    const rec = await runPyJSON(`recommendation_block(${JSON.stringify(norm.verdict)}, ${JSON.stringify(homo.verdict)}, ${JSON.stringify(indep.verdict)})`);

    renderNormality(norm);
    renderHomoced(homo);
    renderIndep(indep);
    renderInfluence(infl);
    renderRecommendation(norm, homo, indep, rec);

    setSpinner('Generando figuras…');
    const figs = await runPyJSON(`all_figs(${JSON.stringify(A3.theme)})`);
    renderFigGallery(figs);

    A3.fitted = true;
    el('a3Results').style.display = 'block';
    showMessage('a3Messages', 'success', 'Análisis de supuestos completo.');
  } catch (err) {
    console.error(err);
    showMessage('a3Messages', 'error', 'Error: ' + (err.message || err).toString().split('\n').slice(-4).join('<br>'));
  } finally { hideSpinner(); }
}

/* ---------- render ---------- */
function badge(v) {
  const cls = v === 'se cumple' ? 'ok' : v === 'no se cumple' ? 'bad' : 'warn';
  return `<span class="verdict ${cls}">${v}</span>`;
}

function renderModelCard(f) {
  statTiles('a3ModelTiles', [
    ['Modelo', f.formula],
    ['n', f.n], ['Grupos', f.ngroups],
    ['R²', fmtNum(f.r2, 3)], ['R² ajustado', fmtNum(f.r2adj, 3)],
    ['σ (residual)', fmtNum(f.sigma, 3)],
  ]);
  buildTable('a3AnovaTable', [
    { key: 'fuente', label: 'Fuente' }, { key: 'gl', label: 'gl' },
    { key: 'SC', label: 'Suma de cuadrados', fmt: v => fmtNum(v, 3) }, { key: 'CM', label: 'Cuadrado medio', fmt: v => fmtNum(v, 3) },
    { key: 'F', label: 'F', fmt: v => fmtNum(v, 3) }, { key: 'p', label: 'p', fmt: fmtP },
  ], f.anova);
}

function testTable(id, tests) {
  buildTable(id, [
    { key: 'prueba', label: 'Prueba' }, { key: 'estadistico', label: 'Estadístico', fmt: v => fmtNum(v, 4) },
    { key: 'p', label: 'valor p', fmt: fmtP }, { key: 'nota', label: 'Nota' },
  ], tests);
}

function renderNormality(n) {
  el('a3NormVerdict').innerHTML = `Veredicto: ${badge(n.verdict)} <span class="hint">(${n.votos} pruebas no rechazan la normalidad · asimetría ${fmtNum(n.asimetria, 2)}, curtosis ${fmtNum(n.curtosis, 2)})</span>`;
  testTable('a3NormTable', n.tests);
  if (n.per_group && n.per_group.length) {
    el('a3NormGroupWrap').style.display = 'block';
    buildTable('a3NormGroupTable', [
      { key: 'grupo', label: 'Grupo' }, { key: 'n', label: 'n' }, { key: 'W', label: 'Shapiro W' },
      { key: 'p', label: 'p', fmt: fmtP }, { key: 'veredicto', label: 'Veredicto' },
    ], n.per_group);
  } else el('a3NormGroupWrap').style.display = 'none';
}

function renderHomoced(h) {
  el('a3HomoVerdict').innerHTML = `Veredicto: ${badge(h.verdict)} <span class="hint">(${h.votos} pruebas no rechazan la igualdad de varianzas${h.ratio_var ? ` · razón varianza máx/mín = ${fmtNum(h.ratio_var, 1)}` : ''})</span>`;
  testTable('a3HomoTable', h.tests);
  buildTable('a3SpreadTable', [
    { key: 'grupo', label: 'Grupo' }, { key: 'n', label: 'n' },
    { key: 'media', label: 'Media', fmt: v => fmtNum(v, 3) }, { key: 'DE', label: 'DE', fmt: v => fmtNum(v, 4) },
    { key: 'varianza', label: 'Varianza', fmt: v => fmtNum(v, 4) },
  ], h.spread);
}

function renderIndep(i) {
  el('a3IndepVerdict').innerHTML = `Veredicto: ${badge(i.verdict)} <span class="hint">(Durbin-Watson = ${fmtNum(i.dw, 2)})</span>`;
  testTable('a3IndepTable', i.tests);
  el('a3IndepNote').textContent = i.nota;
}

function renderInfluence(inf) {
  el('a3InflNote').innerHTML = `Umbrales: Cook > <b>${fmtNum(inf.thr_cook, 4)}</b> (4/n) · apalancamiento > <b>${fmtNum(inf.thr_hat, 4)}</b> (2p/n). ` +
    (inf.rows.length ? `<b>${inf.rows.length}</b> observación(es) marcada(s).` : 'Ninguna observación destaca como influyente.');
  buildTable('a3InflTable', [
    { key: 'obs', label: 'Obs.' }, { key: 'grupo', label: 'Grupo' },
    { key: 'resid_std', label: 'Resid. estand.', fmt: v => fmtNum(v, 2) }, { key: 'resid_stud', label: 'Resid. estud.', fmt: v => fmtNum(v, 2) },
    { key: 'apalancamiento', label: 'Apalancamiento', fmt: v => fmtNum(v, 4) }, { key: 'cook', label: 'Cook', fmt: v => fmtNum(v, 4) },
    { key: 'motivo', label: 'Motivo' },
  ], inf.rows);
}

function renderRecommendation(n, h, i, rec) {
  el('a3Traffic').innerHTML = ['Normalidad', 'Homocedasticidad', 'Independencia'].map((lab, k) => {
    const v = [n.verdict, h.verdict, i.verdict][k];
    return `<div class="traffic-item">${badge(v)}<span>${lab}</span></div>`;
  }).join('');
  let html = '<ul>' + rec.rec.map(r => `<li>${r}</li>`).join('') + '</ul>';
  if (rec.transform && rec.transform.lambda != null) {
    html += `<p class="hint">Transformación sugerida (${rec.transform.metodo}): λ óptimo = <b>${fmtNum(rec.transform.lambda, 3)}</b> → en la práctica, <b>${rec.transform.practica}</b>.</p>`;
  }
  el('a3RecBox').innerHTML = html;
}

function renderFigGallery(figs) {
  const box = el('a3Figs');
  box.innerHTML = '';
  Object.keys(FIG_INFO).forEach(name => {
    if (!figs[name]) return;
    const [title, desc] = FIG_INFO[name];
    const card = document.createElement('div');
    card.className = 'fig-card';
    card.innerHTML = `
      <div class="fig-head">
        <div><b>${title}</b><p class="hint">${desc}</p></div>
        <div class="fig-dl">
          <button class="btn btn-secondary btn-xs" data-n="${name}" data-f="png">PNG</button>
          <button class="btn btn-secondary btn-xs" data-n="${name}" data-f="svg">SVG</button>
          <button class="btn btn-secondary btn-xs" data-n="${name}" data-f="pdf">PDF</button>
        </div>
      </div>
      <img src="${figs[name]}" alt="${title}">`;
    box.appendChild(card);
  });
  els('.fig-dl button', box).forEach(b => b.addEventListener('click', () => exportAssumpFig(b.dataset.n, b.dataset.f)));
}

async function exportAssumpFig(name, fmt) {
  showSpinner('Exportando ' + fmt.toUpperCase() + '…');
  try {
    const dpi = +el('a3Dpi').value || 300;
    const uri = await runPy(`assump_fig(${JSON.stringify(name)}, ${JSON.stringify(fmt)}, ${dpi}, ${JSON.stringify(A3.theme)})`);
    if (uri) download(dataURItoBlob(uri), `${slug(state.fileName)}_supuestos_${name}.${fmt}`);
  } catch (err) { showMessage('a3Messages', 'error', 'Error al exportar: ' + err.message); }
  finally { hideSpinner(); }
}

el('a3Theme').addEventListener('change', async () => {
  if (!A3.fitted) return;
  A3.theme = el('a3Theme').value;
  showSpinner('Regenerando figuras…');
  try { renderFigGallery(await runPyJSON(`all_figs(${JSON.stringify(A3.theme)})`)); }
  finally { hideSpinner(); }
});
