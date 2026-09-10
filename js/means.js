/* Bloque 4b — Comparación de medias (controlador JS). */

let meansReady = false;
const M4 = { fitted: false };

document.addEventListener('analizar:data', buildMeans);

function buildMeans() {
  const nums = (state.info && state.info.numeric) || [];
  const cats = (state.info && state.info.categorical) || [];
  el('m4Resp').innerHTML = nums.map(v => `<option>${v}</option>`).join('');
  el('m4Factors').innerHTML = cats.length
    ? cats.map(c => `<label class="checkbox-label"><input type="checkbox" value="${c}"> ${c}</label>`).join('')
    : '<p class="hint">Sin variables categóricas: la comparación de medias necesita al menos un factor.</p>';
  el('m4Theme').innerHTML = ['StatsPro', 'Minimal', 'Publicacion', 'Cuadricula', 'Clasico', 'Oscuro'].map(t => `<option>${t}</option>`).join('');
  el('m4Palette').innerHTML = ['StatsPro', 'Okabe-Ito', 'Vivo', 'Tierra', 'Pastel', 'Set2', 'Dark2', 'Viridis'].map(t => `<option>${t}</option>`).join('');
}

el('m4Factors').addEventListener('change', () => {
  el('m4InterWrap').style.display = els('#m4Factors input:checked').length >= 2 ? 'flex' : 'none';
});

el('m4Method').addEventListener('change', syncMeansControls);
function syncMeansControls() {
  const m = el('m4Method').value;
  el('m4CtrlWrap').style.display = m === 'dunnett' ? 'flex' : 'none';
  el('m4PadjWrap').style.display = ['dunn', 'mannwhitney'].includes(m) ? 'flex' : 'none';
}

async function ensureMeans() {
  await ensurePackages(['scipy', 'statsmodels']);
  if (!meansReady) { (await getPyodide()).runPython(PY_MEANS); meansReady = true; }
}

el('m4RunBtn').addEventListener('click', runMeansFit);

async function runMeansFit() {
  const resp = el('m4Resp').value;
  const factors = els('#m4Factors input:checked').map(c => c.value);
  if (!resp || !factors.length) { showMessage('m4Messages', 'error', 'Elige la respuesta y al menos un factor.'); return; }
  const inter = el('m4Inter').checked && factors.length >= 2;
  clearMessages('m4Messages');
  showSpinner('Ajustando ANOVA…');
  try {
    await ensureMeans();
    const fit = await runPyJSON('means_fit(_resp, _fac, _intr)', { _resp: resp, _fac: JSON.stringify(factors), _intr: inter });
    renderMeansFit(fit);
    // llenar selects post-hoc
    el('m4Comparar').innerHTML = fit.comparables.map(c => `<option>${c}</option>`).join('');
    el('m4Ctrl').innerHTML = fit.group_summary.map(g => `<option>${g.grupo}</option>`).join('');
    el('m4Results').style.display = 'block';
    el('m4PhCard').style.display = 'block';
    M4.fitted = true;
    showMessage('m4Messages', 'success', 'ANOVA listo. Ahora elige un método de comparación de medias abajo.');
    await runPosthoc();
  } catch (err) {
    console.error(err);
    showMessage('m4Messages', 'error', 'Error: ' + (err.message || err).toString().split('\n').slice(-4).join('<br>'));
  } finally { hideSpinner(); }
}

function renderMeansFit(f) {
  buildTable('m4AnovaTable', [
    { key: 'fuente', label: 'Fuente' }, { key: 'gl', label: 'gl' },
    { key: 'SC', label: 'Suma de cuadrados', fmt: v => fmtNum(v, 3) }, { key: 'CM', label: 'Cuadrado medio', fmt: v => fmtNum(v, 3) },
    { key: 'F', label: 'F', fmt: v => fmtNum(v, 3) }, { key: 'p', label: 'p', fmt: fmtP },
  ], f.anova);
  const w = f.welch, kw = f.kw;
  el('m4Robust').innerHTML =
    `<div class="mini-tiles">
      <div><span>ANOVA de Welch</span><b>F(${w.gl1}, ${fmtNum(w.gl2, 1)}) = ${fmtNum(w.F, 3)}</b><i>p = ${fmtP(w.p)}</i><small>no exige varianzas iguales</small></div>
      <div><span>Kruskal-Wallis</span><b>H(${kw.gl}) = ${fmtNum(kw.H, 3)}</b><i>p = ${fmtP(kw.p)}</i><small>no paramétrico (rangos)</small></div>
     </div>`;
  buildTable('m4EffectTable', [
    { key: 'efecto', label: 'Efecto' },
    { key: 'eta2', label: 'η²', fmt: v => fmtNum(v, 3) }, { key: 'eta2_parcial', label: 'η² parcial', fmt: v => fmtNum(v, 3) },
    { key: 'omega2', label: 'ω²', fmt: v => fmtNum(v, 3) }, { key: 'epsilon2', label: 'ε²', fmt: v => fmtNum(v, 3) },
    { key: 'f_cohen', label: 'f de Cohen', fmt: v => fmtNum(v, 3) }, { key: 'magnitud', label: 'Magnitud' },
  ], f.effects);
  buildTable('m4GroupTable', [
    { key: 'grupo', label: 'Grupo' }, { key: 'n', label: 'n' },
    { key: 'media', label: 'Media', fmt: v => fmtNum(v, 4) }, { key: 'DE', label: 'DE', fmt: v => fmtNum(v, 4) },
    { key: 'EE', label: 'EE', fmt: v => fmtNum(v, 4) }, { key: 'mediana', label: 'Mediana', fmt: v => fmtNum(v, 4) },
    { key: 'IC95_inf', label: 'IC95 inf', fmt: v => fmtNum(v, 4) }, { key: 'IC95_sup', label: 'IC95 sup', fmt: v => fmtNum(v, 4) },
  ], f.group_summary);
  el('m4InterFigWrap').style.display = f.factors.length >= 2 ? 'block' : 'none';
}

['m4Method', 'm4Comparar', 'm4Alpha', 'm4Ctrl', 'm4Padj'].forEach(id =>
  el(id).addEventListener('change', () => { if (M4.fitted) runPosthoc(); }));

async function runPosthoc() {
  const method = el('m4Method').value;
  const comparar = el('m4Comparar').value;
  const alpha = +el('m4Alpha').value || 0.05;
  const control = el('m4Ctrl').value || '';
  const padj = el('m4Padj').value;
  showSpinner('Comparando medias (' + method + ')…');
  try {
    await ensureMeans();
    const r = await runPyJSON(`posthoc(${JSON.stringify(method)}, ${JSON.stringify(comparar)}, ${alpha}, ${JSON.stringify(control)}, ${JSON.stringify(padj)})`);
    el('m4PhNote').innerHTML = `<span class="hint">${r.nota}</span> — <b>${r.n_signif}</b> de ${r.n_pairs} parejas resultaron significativas (α = ${alpha}).`;
    buildTable('m4CldTable', [
      { key: 'grupo', label: 'Grupo' }, { key: 'media', label: 'Media', fmt: v => fmtNum(v, 4) },
      { key: 'n', label: 'n' }, { key: 'letras', label: 'Grupos (letras)' },
    ], r.cld);
    const cols = [
      { key: 'g1', label: 'Grupo 1' }, { key: 'g2', label: 'Grupo 2' },
      { key: 'dif', label: 'Diferencia', fmt: v => fmtNum(v, 4) }, { key: 'EE', label: 'Error estándar', fmt: v => fmtNum(v, 5) },
      { key: 'estad', label: 'Estadístico', fmt: v => fmtNum(v, 3) },
      { key: 'p', label: 'p', fmt: fmtP }, { key: 'p_ajust', label: 'p ajustado', fmt: fmtP },
      { key: 'IC_inf', label: 'IC inf', fmt: v => fmtNum(v, 4) }, { key: 'IC_sup', label: 'IC sup', fmt: v => fmtNum(v, 4) },
      { key: 'signif', label: 'Signif.', get: r => r.signif ? 'sí' : 'no' },
    ];
    buildTable('m4PairTable', cols, r.pairs);
    state.means = { pairs: r.pairs, cld: r.cld };
    renderMeansFig('cld');
    renderMeansFig('tukey_ci');
    renderMeansFig('box_signif');
    if (el('m4InterFigWrap').style.display !== 'none') renderMeansFig('interaction');
  } catch (err) {
    console.error(err);
    showMessage('m4Messages', 'error', 'Error en la comparación: ' + (err.message || err).toString().split('\n').slice(-3).join('<br>'));
  } finally { hideSpinner(); }
}

const MFIGS = { cld: 'm4FigCld', tukey_ci: 'm4FigTukey', box_signif: 'm4FigBox', interaction: 'm4FigInter' };
function figArgs(kind, fmt, dpi) {
  return `${JSON.stringify(kind)}, ${JSON.stringify(fmt)}, ${dpi}, ${JSON.stringify(el('m4Theme').value)}, ${JSON.stringify(el('m4Palette').value)}, ` +
    `7.6, 5.0, ${JSON.stringify(el('m4Err').value)}, ${JSON.stringify(el('m4Style').value)}, ` +
    `${JSON.stringify(el('m4Title').value)}, ${JSON.stringify(el('m4Ylab').value)}`;
}
async function renderMeansFig(kind) {
  const box = el(MFIGS[kind]); if (!box) return;
  box.classList.add('loading');
  try {
    const uri = await runPy(`means_fig(${figArgs(kind, 'png', 140)})`);
    box.innerHTML = `<img src="${uri}">
      <div class="fig-dl">${['png', 'svg', 'pdf'].map(f => `<button class="btn btn-secondary btn-xs" data-k="${kind}" data-f="${f}">${f.toUpperCase()}</button>`).join('')}</div>`;
    els('button', box).forEach(b => b.addEventListener('click', () => exportMeansFig(b.dataset.k, b.dataset.f)));
  } catch (err) { box.innerHTML = `<p class="msg msg-error">${err.message}</p>`; }
  finally { box.classList.remove('loading'); }
}
async function exportMeansFig(kind, fmt) {
  showSpinner('Exportando…');
  try {
    const dpi = +el('m4Dpi').value || 300;
    const uri = await runPy(`means_fig(${figArgs(kind, fmt, dpi)})`);
    if (uri) download(dataURItoBlob(uri), `${slug(state.fileName)}_medias_${kind}.${fmt}`);
  } finally { hideSpinner(); }
}

['m4Theme', 'm4Palette', 'm4Err', 'm4Style', 'm4Title', 'm4Ylab'].forEach(id =>
  el(id).addEventListener('input', debounceMeansFigs));
let mfTimer;
function debounceMeansFigs() {
  if (!M4.fitted) return;
  clearTimeout(mfTimer);
  mfTimer = setTimeout(() => ['cld', 'tukey_ci', 'box_signif', 'interaction'].forEach(k => {
    if (k !== 'interaction' || el('m4InterFigWrap').style.display !== 'none') renderMeansFig(k);
  }), 300);
}

el('dlCldCsv').addEventListener('click', async () => {
  const c = await runPy('cld_csv()'); if (c) download('﻿' + c, `${slug(state.fileName)}_letras.csv`, 'text/csv;charset=utf-8');
});
el('dlPairsCsv').addEventListener('click', async () => {
  const c = await runPy('pairs_csv()'); if (c) download('﻿' + c, `${slug(state.fileName)}_comparaciones.csv`, 'text/csv;charset=utf-8');
});
