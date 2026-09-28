/* Navegacion por pasos + spinner global. */

const STEP_TITLES = {
  1: 'Datos', 2: 'Descriptiva', 3: 'Supuestos ANOVA',
  4: 'Regresion y medias', 5: 'Correlacion', 6: 'Multivariado',
};

/* Orden de lectura de los bloques (Inicio y los seis bloques). */
const STEP_ORDER = [0, 1, 2, 3, 4, 5, 6];
const stepBtn = n => document.querySelector(`.step-btn[data-step="${n}"]`);
const stepOn = n => { const b = stepBtn(n); return !!b && !b.disabled; };

function goToStep(n) {
  n = Number(n);                      /* la barra comun entrega el numero como texto */
  const btn = stepBtn(n);
  if (btn && btn.disabled) return;
  els('.step-panel').forEach(p => p.classList.remove('active'));
  const panel = el('panel-' + n);
  if (panel) panel.classList.add('active');
  els('.step-btn').forEach(b => b.classList.toggle('active', +b.dataset.step === n));
  if (window.LABG) {
    LABG.setCurrentStep(n);
    if (btn) LABG.announce('Bloque: ' + stepLabel(n));
  }
  refreshStepFooters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function enableStep(n) {
  const b = stepBtn(n);
  if (b) b.disabled = false;
  refreshStepMarks();
  refreshStepFooters();
}

els('.step-btn').forEach(btn => {
  btn.addEventListener('click', () => { if (!btn.disabled) goToStep(+btn.dataset.step); });
});

/* Ir a un bloque como si se pulsara su boton: asi corren tambien los oyentes
   que otros archivos cuelgan del boton (p. ej., la primera figura del Bloque 2). */
function clickStep(n) {
  const b = stepBtn(n);
  if (b && !b.disabled) b.click();
}

/* Un bloque queda «terminado» cuando ya se puede pasar a uno posterior. */
function refreshStepMarks() {
  if (!window.LABG) return;
  STEP_ORDER.forEach((s, i) => {
    if (s === 0) return;
    const later = STEP_ORDER.slice(i + 1).some(stepOn);
    LABG.markStep(s, stepOn(s) && later ? 'done' : null);
  });
}

/* Pie de cada bloque: Anterior / Siguiente, con el nombre tomado del boton. */
function stepLabel(n) {
  const b = stepBtn(n); if (!b) return '';
  const num = b.querySelector('.step-num').textContent.trim();
  const name = (b.querySelector('.step-name') || b).textContent.replace(/\s+/g, ' ').trim();
  return (num === '◆' ? '' : num + ' · ') + name;
}
function refreshStepFooters() {
  els('.step-panel').forEach(p => {
    const n = Number(p.id.replace('panel-', ''));
    const i = STEP_ORDER.indexOf(n);
    if (i < 0) return;
    let f = p.querySelector(':scope > .step-footer');
    if (!f) {
      f = document.createElement('nav');
      f.className = 'step-footer no-print';
      f.setAttribute('aria-label', 'Bloques');
      f.innerHTML = '<button type="button" class="btn btn-secondary prev"></button><button type="button" class="btn btn-primary next"></button>';
      f.addEventListener('click', e => {
        const b = e.target.closest('button[data-go]');
        if (b && !b.disabled) { clickStep(b.dataset.go); const m = el('main'); if (m) m.focus({ preventScroll: true }); }
      });
      p.appendChild(f);
    }
    const prev = STEP_ORDER.slice(0, i).reverse().find(stepOn);
    const next = STEP_ORDER.slice(i + 1).find(s => stepBtn(s));
    const bp = f.querySelector('.prev'), bn = f.querySelector('.next');
    bp.hidden = prev === undefined;
    if (prev !== undefined) { bp.dataset.go = prev; bp.innerHTML = `← <span><small>Anterior</small>${stepLabel(prev)}</span>`; }
    bn.hidden = next === undefined;
    if (next !== undefined) {
      bn.dataset.go = next; bn.disabled = !stepOn(next);
      bn.innerHTML = `<span><small>Siguiente</small>${stepLabel(next)}</span> →`;
    }
  });
}

/* Barra comun de la suite: tema, atajos, aviso al salir y teclado. */
if (window.LABG) {
  LABG.theme.init('statspro.theme');
  const tb = el('themeBtn');
  if (tb) tb.addEventListener('click', () => LABG.theme.toggle());
  const hb = el('helpBtn');
  if (hb) hb.addEventListener('click', () => LABG.showShortcuts());
  LABG.shortcuts([]);
  LABG.bindStepKeys(clickStep);
  LABG.guardUnload(() => !!state.dataReady);
  LABG.setCurrentStep((document.querySelector('.step-btn.active') || {}).dataset?.step || '0');
}
refreshStepMarks();
refreshStepFooters();
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

window.goToStep = goToStep; window.enableStep = enableStep; window.clickStep = clickStep;
window.showSpinner = showSpinner; window.setSpinner = setSpinner; window.hideSpinner = hideSpinner;
window.initTabs = initTabs;
