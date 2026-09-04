/* Navegacion por pasos + spinner global. */

const STEP_TITLES = {
  1: 'Datos', 2: 'Descriptiva', 3: 'Supuestos ANOVA',
  4: 'Regresion y medias', 5: 'Correlacion', 6: 'Multivariado',
};

function goToStep(n) {
  const btn = document.querySelector(`.step-btn[data-step="${n}"]`);
  if (btn && btn.disabled) return;
  els('.step-panel').forEach(p => p.classList.remove('active'));
  const panel = el('panel-' + n);
  if (panel) panel.classList.add('active');
  els('.step-btn').forEach(b => b.classList.toggle('active', +b.dataset.step === n));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function enableStep(n) {
  const b = document.querySelector(`.step-btn[data-step="${n}"]`);
  if (b) b.disabled = false;
}

els('.step-btn').forEach(btn => {
  btn.addEventListener('click', () => { if (!btn.disabled) goToStep(+btn.dataset.step); });
});

let spinnerCount = 0;
function showSpinner(text) {
  spinnerCount++;
  el('spinnerText').textContent = text || 'Trabajando…';
  el('spinner').style.display = 'flex';
}
function setSpinner(text) { el('spinnerText').textContent = text; }
function hideSpinner(force) {
  spinnerCount = force ? 0 : Math.max(0, spinnerCount - 1);
  if (spinnerCount === 0) el('spinner').style.display = 'none';
}

/* pestanas dentro de un bloque */
function initTabs(root) {
  root = typeof root === 'string' ? el(root) : root;
  if (!root) return;
  const tabs = els('.subtab', root);
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    els('.subtab-panel', root).forEach(p => p.classList.toggle('active', p.dataset.tab === t.dataset.tab));
  }));
}

window.goToStep = goToStep; window.enableStep = enableStep;
window.showSpinner = showSpinner; window.setSpinner = setSpinner; window.hideSpinner = hideSpinner;
window.initTabs = initTabs;
